/* Embedded AI Growth Analyst — NVIDIA NIM (OpenAI-compatible) with function calling over the LIVE database.
 * The model never sees a hardcoded data dump: every number comes from a tool call against current Postgres state,
 * computed by the same metrics engine as the dashboard. Writes are only *proposed*; the UI asks the user to confirm.
 */
import type { FunctionDeclaration } from "@google/genai";
import { pool, q, getSettings } from "./db";
import { loadAll, snapshot, type Snapshot } from "./metrics";
import { STAGES } from "./mutations";

const SCHEMA_DOC = `
Postgres tables (timestamps are timestamptz; source data is IST +05:30):
- brand(brand_id, brand_name, industry, owner_name, created_at)
- sponsor_contact(contact_id, contact_name, job_title, brand_id, created_at)
- sponsor_campaign(sponsor_campaign_id SC01..SC06, campaign_name, channel, objective, audience, owner_name, planned_start_at, planned_end_at)
- sponsor_interaction(interaction_id, attempt_id, origin_interaction_id, brand_id, contact_id, sponsor_campaign_id, channel, event_type[outreach_sent|delivered|replied|meeting_booked|meeting_held|opt_out|introduction_received|web_inbound], outcome[sent|delivered|positive|neutral|not_interested|wrong_contact|scheduled|attended|do_not_contact|introduced|interest_submitted], summary, occurred_at)
- brand_qualification(history_id, brand_id, qualification_status[unreviewed|engaged|qualified|unqualified|dormant], reason, sponsor_campaign_id, effective_at)  -- FULL-STATE HISTORY: use latest row per brand with effective_at < cutoff
- partner_opportunity(opportunity_id, opportunity_name, brand_id, primary_contact_id, sponsor_campaign_id (originating), support_type[cash|in_kind], created_at)
- opportunity_history(history_id, opportunity_id, brand_id, stage, proposed_value_inr, confirmed_value_inr, owner_name, effective_at, note, source['dataset'|'app'])  -- FULL-STATE HISTORY: latest per opportunity
- sponsor_activation(activation_id, brand_id, opportunity_id, attendee_campaign_id, attendee_campaign_name, activation_note, linked_at)
- target_plan(target_version, effective_at, qualified_brands_goal, confirmed_partnerships_goal)
- app_campaign_plan(sponsor_campaign_id, status, budget_inr, spent_inr, hours_per_week, notes)  -- ASSUMED planning numbers entered by team, not source data
- app_task(id, title, description, owner_name, due_date, status, priority, sponsor_campaign_id, opportunity_id, created_by)
- app_payment(id, opportunity_id, amount_inr, received_at, reference) -- cash receipts logged in app
- app_audit_log(at, actor, action, entity, entity_id, details)
- VIEW opportunity_latest(opportunity_id, opportunity_name, brand_name, sponsor_campaign_id, campaign_name, channel, channel_group['warm'|'cold'], support_type, stage, proposed_value_inr, confirmed_value_inr, owner_name, effective_at)  -- latest version per opportunity, all time. USE THIS instead of opportunity_history for current-state questions.
- VIEW brand_qualification_latest -- latest qualification per brand, all time
Warm channels = SC02 Warm Partner Introductions, SC05 Creator Network Referrals, SC04 Partner Interest Form. Cold = SC01 Brand Discovery Email, SC03 Brand Leader LinkedIn, SC06 Past Conversation Revival.
Snapshot cutoff for date D = D+1 00:00 IST (exclusive).`;

const decls: FunctionDeclaration[] = [
  { name: "get_overview", description: "Headline KPIs for a snapshot date: funnel (brand & opportunity stages with conversion), targets vs actuals, weighted forecast, cash collected/outstanding, top bottlenecks, known data gaps.", parametersJsonSchema: { type: "object", properties: { as_of: { type: "string", description: "YYYY-MM-DD; defaults to the app's working date" } } } },
  { name: "get_campaign_performance", description: "Per-campaign KPIs (outreach, replies, positive reply rate, meetings, qualified brands, opportunities, win rate, confirmed value, pipeline, budget/spend, cost per confirmed) and rule-based scale/change/stop/test_more recommendation with reasons.", parametersJsonSchema: { type: "object", properties: { as_of: { type: "string" }, campaign: { type: "string", description: "Optional name or SC id filter" } } } },
  { name: "list_opportunities", description: "Opportunities at a snapshot with latest stage, values, owner, days since last change, stalled flag, cash collected.", parametersJsonSchema: { type: "object", properties: { as_of: { type: "string" }, stage: { type: "string", enum: STAGES }, campaign: { type: "string" }, owner: { type: "string" }, brand: { type: "string" }, stalled_only: { type: "boolean" }, open_only: { type: "boolean" }, limit: { type: "integer" } } } },
  { name: "get_weekly_trend", description: "Week-by-week outreach, positive replies, intros/inbound, meetings held, cumulative confirmed count/value and target in force.", parametersJsonSchema: { type: "object", properties: { as_of: { type: "string" } } } },
  { name: "compare_snapshots", description: "Compare headline metrics and per-campaign metrics between two dates to explain what changed.", parametersJsonSchema: { type: "object", properties: { date_a: { type: "string" }, date_b: { type: "string" } }, required: ["date_a", "date_b"] } },
  { name: "list_tasks", description: "Team tasks/action items from the management tool.", parametersJsonSchema: { type: "object", properties: { status: { type: "string", enum: ["todo", "in_progress", "blocked", "done", "open"] }, owner: { type: "string" } } } },
  { name: "get_assumptions", description: "App settings: working as-of date, stage win-probability weights, collection-rate assumption, value goal (assumption), stall days, scale/stop thresholds, and import data-quality issues.", parametersJsonSchema: { type: "object", properties: {} } },
  { name: "run_sql", description: "Run a single READ-ONLY SQL SELECT against the database for questions the other tools don't cover. Max 200 rows. Respect history/cutoff rules.\n" + SCHEMA_DOC, parametersJsonSchema: { type: "object", properties: { sql: { type: "string" }, purpose: { type: "string" } }, required: ["sql"] } },
  { name: "calculate", description: "Evaluate an arithmetic expression exactly (+ - * / ( ) and numbers). ALWAYS use this for any arithmetic you report instead of mental math.", parametersJsonSchema: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] } },
  { name: "propose_action", description: "Propose a change for the user to confirm in the UI (it is NOT executed until they click Confirm). Use for creating/updating tasks, changing campaign status/budget, moving opportunity stage/value, or logging a payment.", parametersJsonSchema: {
    type: "object", required: ["type", "payload", "rationale"], properties: {
      type: { type: "string", enum: ["create_task", "update_task", "update_campaign", "update_opportunity", "log_payment"] },
      payload: { type: "object", description: "create_task: {title, description, owner_name, due_date YYYY-MM-DD, priority low|medium|high, sponsor_campaign_id?, opportunity_id?}; update_task: {id, ...fields}; update_campaign: {sponsor_campaign_id, status? active|scaling|fixing|paused|stopped, budget_inr?, spent_inr?, hours_per_week?, notes?}; update_opportunity: {opportunity_id, stage?, proposed_value_inr?, confirmed_value_inr?, owner_name?, note?}; log_payment: {opportunity_id, amount_inr, received_at? YYYY-MM-DD, reference?}" },
      rationale: { type: "string", description: "Data-backed reason, citing the metrics" },
    } } },
];

function safeCalc(expr: string) {
  if (!/^[\d\s+\-*/().,%e]+$/i.test(expr)) throw new Error("only numbers and + - * / ( ) allowed");
  const cleaned = expr.replace(/,/g, "").replace(/(\d+(?:\.\d+)?)%/g, "($1/100)");
  const v = Function(`"use strict"; return (${cleaned});`)();
  if (typeof v !== "number" || !isFinite(v)) throw new Error("not a finite number");
  return { expression: expr, result: Math.round(v * 1e6) / 1e6 };
}

async function readOnlySql(sql: string) {
  const s = sql.trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(s) || s.includes(";")) throw new Error("Only a single SELECT/WITH statement is allowed");
  const c = await pool.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SAVEPOINT ro");
    try { await c.query("SET LOCAL ROLE copilot_ro"); } catch { await c.query("ROLLBACK TO SAVEPOINT ro"); } // role may not exist on hosted DBs
    await c.query("SET LOCAL statement_timeout = 4000");
    const r = await c.query(`SELECT * FROM (${s}) _q LIMIT 200`);
    await c.query("ROLLBACK");
    return { row_count: r.rowCount, rows: r.rows };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { c.release(); }
}

const match = (v: unknown, f?: string) => !f || String(v ?? "").toLowerCase().includes(f.toLowerCase());
const pick = (s: Snapshot) => ({ as_of: s.as_of, targets: s.targets, forecast: s.forecast, funnel: s.funnel, counts: s.counts });

export type Proposal = { id: string; type: string; payload: Record<string, unknown>; rationale: string };

async function runTool(name: string, args: Record<string, any>, ctx: { asOf: string; proposals: Proposal[] }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const D = name === "calculate" || name === "run_sql" || name === "list_tasks" || name === "propose_action" ? null : await loadAll();
  const snap = (d?: string) => snapshot(D!, d || ctx.asOf);
  switch (name) {
    case "get_overview": { const s = snap(args.as_of); return { ...pick(s), bottlenecks: s.bottlenecks, stalled_open_opportunities: s.stalled.length, owners: s.owners, industries: s.industries, data_gaps: s.data_gaps }; }
    case "get_campaign_performance": { const s = snap(args.as_of); return { as_of: s.as_of, campaigns: s.campaigns.filter((c) => match(c.campaign_name, args.campaign) || match(c.sponsor_campaign_id, args.campaign)), note: "budget_inr/spent_inr are team-entered assumptions; win_rate = confirmed/(confirmed+lost+withdrawn)." }; }
    case "list_opportunities": {
      const s = snap(args.as_of);
      let rows = s.opportunities.filter((o) => (!args.stage || o.stage === args.stage) && (match(o.campaign_name, args.campaign) || match(o.campaign_id, args.campaign)) && match(o.owner_name, args.owner) && match(o.brand_name, args.brand));
      if (args.stalled_only) rows = rows.filter((o) => o.stalled);
      if (args.open_only) rows = rows.filter((o) => ["prospecting", "contacted", "proposal_sent", "negotiating"].includes(o.stage));
      return { as_of: s.as_of, total: rows.length, rows: rows.slice(0, args.limit ?? 25) };
    }
    case "get_weekly_trend": return { as_of: snap(args.as_of).as_of, weeks: snap(args.as_of).weekly };
    case "compare_snapshots": {
      const a = snap(args.date_a), b = snap(args.date_b);
      return { a: pick(a), b: pick(b), campaigns: a.campaigns.map((c) => { const cb = b.campaigns.find((x) => x.sponsor_campaign_id === c.sponsor_campaign_id)!;
        return { campaign: c.campaign_name, a: { outreach: c.outreach_sent, positive: c.positive_replies, meetings: c.meetings_held, opps: c.opportunities, confirmed: c.confirmed, lost: c.lost_or_withdrawn, value: c.confirmed_value_inr }, b: { outreach: cb.outreach_sent, positive: cb.positive_replies, meetings: cb.meetings_held, opps: cb.opportunities, confirmed: cb.confirmed, lost: cb.lost_or_withdrawn, value: cb.confirmed_value_inr } }; }) };
    }
    case "list_tasks": {
      const rows = await q(`SELECT t.id, t.title, t.description, t.owner_name, t.due_date::text, t.status, t.priority, t.sponsor_campaign_id, c.campaign_name, t.opportunity_id, t.created_by
        FROM app_task t LEFT JOIN sponsor_campaign c USING (sponsor_campaign_id) ORDER BY t.due_date NULLS LAST`);
      return rows.filter((t) => (!args.status || (args.status === "open" ? t.status !== "done" : t.status === args.status)) && match(t.owner_name, args.owner));
    }
    case "get_assumptions": return { settings: await getSettings(), import_issues: await q("SELECT source_table, issue FROM app_import_issue") };
    case "run_sql": return await readOnlySql(String(args.sql));
    case "calculate": return safeCalc(String(args.expression));
    case "propose_action": {
      const payload = normalizePayload(String(args.type), args.payload);
      const problem = validatePayload(String(args.type), payload);
      // Reject malformed proposals back to the model so it fixes them, instead of showing a broken card
      if (problem) throw new Error(`Invalid ${args.type} payload: ${problem}. Send a flat payload object, e.g. {"title": "...", "owner_name": "...", "due_date": "YYYY-MM-DD", "priority": "high"}.`);
      const p: Proposal = { id: `P${Date.now()}${ctx.proposals.length}`, type: args.type, payload, rationale: args.rationale ?? "" };
      ctx.proposals.push(p);
      return { status: "pending_user_confirmation", proposal_id: p.id, note: "Shown to the user as a Confirm card. Do not say it is done." };
    }
  }
  throw new Error(`unknown tool ${name}`);
}

function systemPrompt(asOf: string) {
  return `You are the Growth Analyst & Copilot inside the CampusFest 2025 Sponsor Growth Center (challenge: maximise sponsorship cash collected before the festival, 12–13 Apr 2025, Mumbai).
Working snapshot date (the team's "today"): ${asOf}. Use it unless the user names another date.

GROUNDING RULES
- Every number you state must come from a tool result in THIS conversation. Never use generic knowledge or invent figures. Call tools first; re-call them for follow-ups if data may have changed.
- Prefer the purpose-built tools (get_overview, get_campaign_performance, list_opportunities, compare_snapshots); they already apply dedupe, latest-version and as-of rules. Use run_sql only for questions they cannot answer, and query the *_latest views, never sum raw history tables.
- Cross-check: if a SQL result disagrees with get_overview / get_campaign_performance totals, trust the tools and say so.
- Use the calculate tool for any arithmetic (sums, differences, ratios, percentages, projections) you report.
- Data semantics: confirmed_value_inr is reported partnership value, NOT cash received. Cash collected = app_payment receipts only. Budgets/spend in app_campaign_plan are team-entered assumptions. Activations do not prove attendee uplift. Campaign attribution = originating campaign (observational). Later events must not leak into earlier snapshots.
- If the data cannot answer (e.g. bank receipts not logged, sponsor sentiment, competitor fests, footfall, reasons not recorded, future outcomes), say so plainly, state what data would be needed, and offer what you CAN answer. Distinguish small samples (< 5 closed deals) as weak evidence.

ANSWER FORMAT (concise markdown)
- Lead with the direct answer in 1–2 sentences.
- Then **Evidence** (bullets with figures + which tool/fields), **Assumptions/Caveats** where relevant, and **Recommendation** when asked or useful.
- Use ₹ with Indian grouping (e.g. ₹22,40,000 or ₹22.4L).

ACTIONS
- When the user wants to act (create a task, change campaign status/budget, move a deal, log a payment), or when you recommend a concrete action and they agree, call propose_action with a full payload. It is executed only after the user clicks Confirm in the UI — never claim it is done. Default due dates relative to ${asOf}. Valid owners include: Riya Kapoor, Kabir Shah, Meera Iyer, Nisha Rao.`;
}

export async function chat(history: { role: "user" | "model"; text: string }[], asOfOverride?: string) {
  return chatCompat(PROVIDERS.nvidia, history, asOfOverride);
}

/* ---------- OpenAI-compatible providers (NVIDIA NIM) ---------- */
type Provider = { name: string; url: string; keyEnv: string; keyUrl: string; modelEnv: string; fallbackEnv: string; model: string; fallbacks: string };
const PROVIDERS: Record<string, Provider> = {
  nvidia: { name: "NVIDIA", url: "https://integrate.api.nvidia.com/v1/chat/completions", keyEnv: "NVIDIA_API_KEY", keyUrl: "https://build.nvidia.com", modelEnv: "NVIDIA_MODEL", fallbackEnv: "NVIDIA_FALLBACK_MODELS", model: "nvidia/nemotron-3.5-super-vl-120b-a12b", fallbacks: "nvidia/nemotron-3.5-lightning-30b-a3b,mistralai/mistral-large-4-1t-a52b" },
};
type MMsg = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[]; tool_call_id?: string; name?: string };
async function chatCompat(P: Provider, history: { role: "user" | "model"; text: string }[], asOfOverride?: string) {
  const key = process.env[P.keyEnv];
  if (!key) throw new Error(`${P.keyEnv} is not set in .env.local. Get a free key at ${P.keyUrl} and restart the server.`);
  const models = [...new Set([process.env[P.modelEnv] || P.model, ...(process.env[P.fallbackEnv] ?? P.fallbacks).split(",").map((m) => m.trim()).filter(Boolean)])];
  const asOf = asOfOverride || (await getSettings()).as_of;
  const tools = decls.map((d) => ({ type: "function", function: { name: d.name, description: d.description, parameters: d.parametersJsonSchema } }));
  const messages: MMsg[] = [{ role: "system", content: systemPrompt(asOf) }, ...history.map((m) => ({ role: (m.role === "model" ? "assistant" : "user") as MMsg["role"], content: m.text }))];
  const ctx = { asOf, proposals: [] as Proposal[] };
  const trace: { tool: string; args: unknown; ok: boolean; summary: string }[] = [];
  let model = models[0];

  const MAX_STEPS = 7;
  const seen = new Map<string, number>();
  for (let step = 0; step < MAX_STEPS; step++) {
    const last = step === MAX_STEPS - 1;
    if (last) messages.push({ role: "user", content: "You have enough data. Do not call any more tools: write the final answer now from the tool results above, and say plainly what you could not determine." });
    const { msg, usedModel } = await compatCall(P, key, models, model, last ? { messages, temperature: 0.2 } : { messages, tools, tool_choice: "auto", temperature: 0.2 });
    model = usedModel;
    const calls = last ? [] : msg.tool_calls ?? [];
    if (!calls.length) return { text: msg.content ?? "", trace, proposals: ctx.proposals, as_of: asOf, model };
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
    for (const c of calls) {
      let args: Record<string, unknown> = {};
      try { args = typeof c.function.arguments === "string" ? JSON.parse(c.function.arguments || "{}") : (c.function.arguments as Record<string, unknown>); } catch { /* bad JSON from model */ }
      let content: string;
      try {
        const sig = `${c.function.name}:${JSON.stringify(args)}`;
        seen.set(sig, (seen.get(sig) ?? 0) + 1);
        const out = seen.get(sig)! > 1 && c.function.name !== "propose_action"
          ? { note: "You already called this tool with the same arguments; its result is above. Use it and answer now." }
          : await runTool(c.function.name, args, ctx);
        trace.push({ tool: c.function.name, args, ok: true, summary: JSON.stringify(out).slice(0, 160) });
        content = JSON.stringify({ result: out });
      } catch (e) {
        trace.push({ tool: c.function.name, args, ok: false, summary: (e as Error).message });
        content = JSON.stringify({ error: (e as Error).message });
      }
      messages.push({ role: "tool", tool_call_id: c.id, name: c.function.name, content: content.length > 9000 ? content.slice(0, 9000) + "…[truncated: ask a narrower question or filter]" : content });
    }
  }
  return { text: "I could not finish this one. Please narrow the question.", trace, proposals: ctx.proposals, as_of: asOf, model };
}

async function compatCall(P: Provider, key: string, models: string[], preferred: string, body: Record<string, unknown>): Promise<{ msg: MMsg; usedModel: string }> {
  const order = [preferred, ...models.filter((m) => m !== preferred)];
  let lastErr = "";
  for (const model of order) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 45000);
      try {
        const r = await fetch(P.url, {
          method: "POST", signal: ctrl.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model, ...body }),
        });
        const txt = await r.text();
        if (r.ok) { const m = JSON.parse(txt).choices[0].message as MMsg; delete (m as Record<string, unknown>).reasoning; return { msg: m, usedModel: model }; }
        lastErr = `${r.status} ${txt.slice(0, 200)}`;
        if (r.status === 401) throw new Error(`${P.name} rejected the API key (401). Check ${P.keyEnv} in .env.local.`);
        if (r.status === 429 || r.status >= 500) { const ra = Number(r.headers.get("retry-after")); await new Promise((res) => setTimeout(res, Math.min(ra > 0 ? ra * 1000 : 1500 * (attempt + 1), 8000))); continue; } // free tiers rate-limit per minute
        break; // other 4xx: try next model
      } catch (e) {
        if ((e as Error).message.includes("401")) throw e;
        lastErr = (e as Error).name === "AbortError" ? "request timed out after 45s" : (e as Error).message;
      } finally { clearTimeout(timer); }
    }
  }
  throw new Error(`${P.name} is busy or rate-limited right now (tried ${order.join(", ")}). Wait a few seconds and ask again. Last error: ${lastErr}`);
}

/* Models sometimes nest the payload ({create_task: {...}}, {task: {...}}) or send it as a JSON string: flatten it */
export function normalizePayload(type: string, raw: unknown): Record<string, unknown> {
  let p: unknown = raw;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = {}; } }
  if (!p || typeof p !== "object" || Array.isArray(p)) return {};
  let o = p as Record<string, unknown>;
  for (let i = 0; i < 3; i++) {
    const keys = Object.keys(o);
    const wrapper = keys.length === 1 && o[keys[0]] && typeof o[keys[0]] === "object" && !Array.isArray(o[keys[0]])
      && [type, "task", "campaign", "opportunity", "payment", "payload", "data", "args"].includes(keys[0]);
    if (!wrapper) break;
    o = o[keys[0]] as Record<string, unknown>;
  }
  // Drop nested objects/nulls the write layer can't store
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && typeof v !== "object"));
}

function validatePayload(type: string, p: Record<string, unknown>): string | null {
  const need: Record<string, string[]> = {
    create_task: ["title"], update_task: ["id"], update_campaign: ["sponsor_campaign_id"],
    update_opportunity: ["opportunity_id"], log_payment: ["opportunity_id", "amount_inr"],
  };
  if (!need[type]) return `unknown action type "${type}"`;
  const missing = need[type].filter((k) => p[k] === undefined || p[k] === "");
  if (missing.length) return `missing ${missing.join(", ")}`;
  if (p.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(p.due_date))) return "due_date must be YYYY-MM-DD";
  if (p.priority && !["low", "medium", "high"].includes(String(p.priority))) return "priority must be low, medium or high";
  return null;
}
