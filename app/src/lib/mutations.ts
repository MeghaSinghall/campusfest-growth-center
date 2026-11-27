/* All writes go through here — used by both the UI API routes and the AI copilot (after user confirmation).
 * Every write is audited. Opportunity changes append a new full-state history version (never overwrite),
 * so analytics for earlier dates remain reproducible. */
import { q, audit, getSettings } from "./db";
import { cutoffFor } from "./metrics";

export const STAGES = ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed", "lost", "withdrawn"];

async function effectiveAtFor(opportunityId: string | null) {
  const { as_of } = await getSettings();
  const cutoff = cutoffFor(as_of);
  let t = new Date(cutoff.getTime() - 6 * 3600000); // 18:00 IST on the working "today"
  if (opportunityId) {
    const [r] = await q<{ m: Date | null }>("SELECT max(effective_at) m FROM opportunity_history WHERE opportunity_id=$1 AND effective_at < $2", [opportunityId, cutoff]);
    if (r?.m && new Date(r.m) >= t) t = new Date(new Date(r.m).getTime() + 1000);
  }
  if (t >= cutoff) t = new Date(cutoff.getTime() - 1000);
  return t;
}

export async function createTask(input: { title: string; description?: string | null; owner_name?: string | null; due_date?: string | null; priority?: string; sponsor_campaign_id?: string | null; opportunity_id?: string | null; status?: string }, actor = "user") {
  if (!input.title?.trim()) throw new Error("title required");
  const [t] = await q(
    `INSERT INTO app_task (title, description, owner_name, due_date, priority, sponsor_campaign_id, opportunity_id, status, created_by)
     VALUES ($1,$2,$3,$4,COALESCE($5,'medium'),$6,$7,COALESCE($8,'todo'),$9) RETURNING *`,
    [input.title.trim(), input.description ?? null, input.owner_name ?? null, input.due_date || null, input.priority ?? null, input.sponsor_campaign_id || null, input.opportunity_id || null, input.status ?? null, actor]);
  await audit(actor, "create", "task", t.id as number, t);
  return t;
}

export async function updateTask(id: number, patch: Record<string, unknown>, actor = "user") {
  const allowed = ["title", "description", "owner_name", "due_date", "priority", "status", "sponsor_campaign_id", "opportunity_id"];
  const keys = Object.keys(patch).filter((k) => allowed.includes(k));
  if (!keys.length) throw new Error("nothing to update");
  const [t] = await q(`UPDATE app_task SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(",")}, updated_at=now() WHERE id=$1 RETURNING *`, [id, ...keys.map((k) => (patch[k] === "" ? null : patch[k]))]);
  if (!t) throw new Error(`task ${id} not found`);
  await audit(actor, "update", "task", id, patch);
  return t;
}

export async function deleteTask(id: number, actor = "user") {
  await q("DELETE FROM app_task WHERE id=$1", [id]);
  await audit(actor, "delete", "task", id, null);
}

export async function updateCampaignPlan(id: string, patch: { status?: string; budget_inr?: number; spent_inr?: number; hours_per_week?: number; notes?: string }, actor = "user") {
  const allowed = ["status", "budget_inr", "spent_inr", "hours_per_week", "notes"];
  const keys = Object.keys(patch).filter((k) => allowed.includes(k) && (patch as Record<string, unknown>)[k] !== undefined);
  if (!keys.length) throw new Error("nothing to update");
  const vals = keys.map((k) => (patch as Record<string, unknown>)[k]);
  const [r] = await q(`UPDATE app_campaign_plan SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(",")}, updated_at=now() WHERE sponsor_campaign_id=$1 RETURNING *`, [id, ...vals]);
  if (!r) throw new Error(`campaign ${id} not found`);
  await audit(actor, "update", "campaign_plan", id, patch);
  return r;
}

export async function updateOpportunity(id: string, patch: { stage?: string; proposed_value_inr?: number; confirmed_value_inr?: number; owner_name?: string; note?: string }, actor = "user") {
  const [cur] = await q("SELECT * FROM opportunity_history WHERE opportunity_id=$1 ORDER BY effective_at DESC, history_id DESC LIMIT 1", [id]);
  const [opp] = await q("SELECT * FROM partner_opportunity WHERE opportunity_id=$1", [id]);
  if (!opp) throw new Error(`opportunity ${id} not found`);
  const stage = patch.stage ?? (cur?.stage as string) ?? "prospecting";
  if (!STAGES.includes(stage)) throw new Error(`invalid stage ${stage}`);
  const proposed = patch.proposed_value_inr ?? Number(cur?.proposed_value_inr ?? 0);
  let confirmed = patch.confirmed_value_inr ?? Number(cur?.confirmed_value_inr ?? 0);
  if (stage === "partner_confirmed" && !confirmed) confirmed = proposed;
  if (stage !== "partner_confirmed") confirmed = 0; // dataset rule: zero unless partner_confirmed
  const eff = await effectiveAtFor(id);
  const hid = `APP-${Date.now()}`;
  const ownerName = patch.owner_name ?? (cur?.owner_name as string) ?? null;
  await q(`INSERT INTO opportunity_history (history_id, opportunity_id, brand_id, stage, proposed_value_inr, confirmed_value_inr, owner_id, owner_name, effective_at, note, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'app')`,
    [hid, id, opp.brand_id, stage, proposed, confirmed, cur?.owner_id ?? null, ownerName, eff, patch.note ?? null]);
  await audit(actor, "new_version", "opportunity", id, { from: cur ? { stage: cur.stage, proposed: cur.proposed_value_inr } : null, to: { stage, proposed, confirmed }, effective_at: eff });
  return { history_id: hid, opportunity_id: id, stage, proposed_value_inr: proposed, confirmed_value_inr: confirmed, effective_at: eff };
}

export async function logPayment(input: { opportunity_id: string; amount_inr: number; received_at?: string; reference?: string }, actor = "user") {
  if (!(input.amount_inr > 0)) throw new Error("amount must be > 0");
  const received = input.received_at ? new Date(`${input.received_at}T12:00:00+05:30`) : await effectiveAtFor(null);
  const [p] = await q("INSERT INTO app_payment (opportunity_id, amount_inr, received_at, reference) VALUES ($1,$2,$3,$4) RETURNING *", [input.opportunity_id, Math.round(input.amount_inr), received, input.reference ?? null]);
  await audit(actor, "create", "payment", p.id as number, p);
  return p;
}

export async function updateSettings(patch: Record<string, unknown>, actor = "user") {
  const allowed = ["as_of", "stage_weights", "collection_rate_assumption", "confirmed_value_goal_inr", "stall_days", "thresholds"];
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.includes(k)) continue;
    await q("INSERT INTO app_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", [k, JSON.stringify(v)]);
  }
  await audit(actor, "update", "settings", null, patch);
}
