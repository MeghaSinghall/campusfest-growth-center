/* Single source of truth for every number in the dashboard AND the AI copilot.
 * Snapshot rules (from the dataset Read me):
 *  - A selected date = end of that day in Asia/Kolkata. Only records with timestamp < next-day 00:00 IST are eligible.
 *  - History tables are full-state: take the latest version <= cutoff per entity. Never sum history.
 *  - Duplicated import retries are removed at load time.
 *  - Planned dates are plans; completed interactions are actuals.
 */
import { q, getSettings, type Settings } from "./db";

export const OPEN_STAGES = ["prospecting", "contacted", "proposal_sent", "negotiating"] as const;
export const CLOSED_STAGES = ["partner_confirmed", "lost", "withdrawn"] as const;
export const STAGE_ORDER = ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed", "lost", "withdrawn"];
const DAY = 86400000;

export function cutoffFor(asOf: string): Date {
  // end of selected day in IST == next day 00:00 +05:30
  const d = new Date(`${asOf}T00:00:00+05:30`);
  return new Date(d.getTime() + DAY);
}
export function isoDateIST(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
}

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function loadAll() {
  const [event, targets, brands, campaigns, plans, inter, qual, opps, ohist, acts, payments, settings] = await Promise.all([
    q("SELECT * FROM event LIMIT 1"),
    q("SELECT * FROM target_plan ORDER BY effective_at"),
    q("SELECT * FROM brand"),
    q("SELECT * FROM sponsor_campaign ORDER BY sponsor_campaign_id"),
    q("SELECT * FROM app_campaign_plan"),
    q("SELECT * FROM sponsor_interaction"),
    q("SELECT * FROM brand_qualification ORDER BY effective_at, history_id"),
    q("SELECT * FROM partner_opportunity"),
    q("SELECT * FROM opportunity_history ORDER BY effective_at, history_id"),
    q("SELECT * FROM sponsor_activation"),
    q("SELECT * FROM app_payment"),
    getSettings(),
  ]);
  return { event: event[0] as Row, targets, brands, campaigns, plans, inter, qual, opps, ohist, acts, payments, settings };
}
export type Data = Awaited<ReturnType<typeof loadAll>>;

function latestBy<T extends Row>(rows: T[], key: string, cutoff: Date): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) {
    if (new Date(r.effective_at) >= cutoff) continue;
    const prev = m.get(r[key]);
    if (!prev || new Date(r.effective_at) >= new Date(prev.effective_at)) m.set(r[key], r);
  }
  return m;
}
const pct = (a: number, b: number) => (b > 0 ? a / b : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + (Number(b) || 0), 0);

export function snapshot(D: Data, asOf: string) {
  const S: Settings = D.settings;
  const cutoff = cutoffFor(asOf);
  const before = (t: unknown) => new Date(t as string) < cutoff;

  const brands = D.brands.filter((b) => before(b.created_at));
  const brandName = new Map(D.brands.map((b) => [b.brand_id, b.brand_name]));
  const inter = D.inter.filter((i) => before(i.occurred_at));
  const qualLatest = latestBy(D.qual, "brand_id", cutoff);
  const opps = D.opps.filter((o) => before(o.created_at));
  const oppLatest = latestBy(D.ohist, "opportunity_id", cutoff);
  const payments = D.payments.filter((p) => before(p.received_at));
  const target = [...D.targets].filter((t) => before(t.effective_at)).pop() ?? D.targets[0];
  const campName = new Map(D.campaigns.map((c) => [c.sponsor_campaign_id, c.campaign_name]));

  // ---------- Opportunity table (latest state) ----------
  const paidByOpp = new Map<string, number>();
  for (const p of payments) paidByOpp.set(p.opportunity_id, (paidByOpp.get(p.opportunity_id) ?? 0) + Number(p.amount_inr));
  const oppRows = opps.map((o) => {
    const h = oppLatest.get(o.opportunity_id);
    const stage = h?.stage ?? "prospecting";
    const lastChange = h ? new Date(h.effective_at) : new Date(o.created_at);
    const daysSinceChange = Math.floor((cutoff.getTime() - lastChange.getTime()) / DAY);
    return {
      opportunity_id: o.opportunity_id, opportunity_name: o.opportunity_name, brand_id: o.brand_id, brand_name: brandName.get(o.brand_id),
      campaign_id: o.sponsor_campaign_id, campaign_name: campName.get(o.sponsor_campaign_id), support_type: o.support_type,
      stage, proposed_value_inr: Number(h?.proposed_value_inr ?? 0), confirmed_value_inr: Number(h?.confirmed_value_inr ?? 0),
      owner_name: h?.owner_name ?? null, last_change: lastChange.toISOString(), days_since_change: daysSinceChange,
      created_at: o.created_at, cash_collected_inr: paidByOpp.get(o.opportunity_id) ?? 0,
      weight: S.stage_weights[stage] ?? 0,
      stalled: (OPEN_STAGES as readonly string[]).includes(stage) && daysSinceChange > S.stall_days,
    };
  });
  const confirmed = oppRows.filter((o) => o.stage === "partner_confirmed");
  const open = oppRows.filter((o) => (OPEN_STAGES as readonly string[]).includes(o.stage));
  const closedLost = oppRows.filter((o) => o.stage === "lost" || o.stage === "withdrawn");

  // ---------- Brand funnel ----------
  const set = (pred: (i: Row) => boolean) => new Set(inter.filter(pred).map((i) => i.brand_id));
  const touched = set((i) => ["outreach_sent", "introduction_received", "web_inbound"].includes(i.event_type));
  const engaged = set((i) => (i.event_type === "replied" && i.outcome === "positive") || ["introduction_received", "web_inbound", "meeting_booked"].includes(i.event_type));
  const met = set((i) => i.event_type === "meeting_held");
  const qualifiedBrands = [...qualLatest.values()].filter((v) => v.qualification_status === "qualified");
  const proposalPlus = oppRows.filter((o) => ["proposal_sent", "negotiating", "partner_confirmed"].includes(o.stage) || ((o.stage === "lost" || o.stage === "withdrawn") && o.proposed_value_inr > 0));
  const confirmedValue = sum(confirmed.map((o) => o.confirmed_value_inr));
  const confirmedCash = sum(confirmed.filter((o) => o.support_type === "cash").map((o) => o.confirmed_value_inr));
  const collected = sum(payments.map((p) => Number(p.amount_inr)));

  const funnel = [
    { stage: "Brands in universe", unit: "brands", count: brands.length },
    { stage: "Brands touched", unit: "brands", count: touched.size },
    { stage: "Brands positively engaged", unit: "brands", count: engaged.size },
    { stage: "Brands met (meeting held)", unit: "brands", count: met.size },
    { stage: "Brands qualified (latest status)", unit: "brands", count: qualifiedBrands.length },
    { stage: "Opportunities created", unit: "opportunities", count: opps.length },
    { stage: "Reached proposal or later", unit: "opportunities", count: proposalPlus.length },
    { stage: "Partner confirmed", unit: "opportunities", count: confirmed.length },
  ].map((f, i, arr) => ({ ...f, conv_from_prev: i === 0 ? null : pct(f.count, arr[i - 1].count) }));

  // ---------- Forecast ----------
  const weightedOpen = sum(open.map((o) => o.proposed_value_inr * o.weight));
  const weightedOpenCount = sum(open.map((o) => o.weight));
  const outstandingCash = Math.max(0, confirmedCash - collected);
  const forecast = {
    confirmed_value_inr: confirmedValue,
    weighted_open_pipeline_inr: Math.round(weightedOpen),
    projected_value_inr: Math.round(confirmedValue + weightedOpen),
    projected_confirmed_count: +(confirmed.length + weightedOpenCount).toFixed(1),
    unweighted_open_pipeline_inr: sum(open.map((o) => o.proposed_value_inr)),
    confirmed_cash_value_inr: confirmedCash,
    confirmed_in_kind_value_inr: confirmedValue - confirmedCash,
    cash_collected_inr: collected,
    cash_outstanding_inr: outstandingCash,
    projected_cash_collected_inr: Math.round(collected + outstandingCash * S.collection_rate_assumption),
    assumptions: { stage_weights: S.stage_weights, collection_rate: S.collection_rate_assumption },
  };

  // ---------- Targets ----------
  const targets = {
    version: target?.target_version, effective_at: target?.effective_at,
    qualified_brands_goal: Number(target?.qualified_brands_goal), qualified_brands_actual: qualifiedBrands.length,
    confirmed_partnerships_goal: Number(target?.confirmed_partnerships_goal), confirmed_partnerships_actual: confirmed.length,
    confirmed_value_goal_inr: S.confirmed_value_goal_inr, confirmed_value_actual_inr: confirmedValue,
    value_goal_is_assumption: true,
    days_to_event: Math.ceil((new Date(D.event.event_starts_at).getTime() - cutoff.getTime()) / DAY),
  };

  // ---------- Campaign performance ----------
  const planBy = new Map(D.plans.map((p) => [p.sponsor_campaign_id, p]));
  const campaigns = D.campaigns.map((c) => {
    const id = c.sponsor_campaign_id;
    const ci = inter.filter((i) => i.sponsor_campaign_id === id);
    const cnt = (t: string, o?: string) => ci.filter((i) => i.event_type === t && (!o || i.outcome === o)).length;
    const roots = ci.filter((i) => ["outreach_sent", "introduction_received", "web_inbound"].includes(i.event_type));
    const brandsReached = new Set(roots.map((i) => i.brand_id)).size;
    const replies = cnt("replied");
    const positive = cnt("replied", "positive");
    const inboundish = cnt("introduction_received") + cnt("web_inbound");
    const co = oppRows.filter((o) => o.campaign_id === id);
    const cConf = co.filter((o) => o.stage === "partner_confirmed");
    const cLost = co.filter((o) => o.stage === "lost" || o.stage === "withdrawn");
    const cOpen = co.filter((o) => (OPEN_STAGES as readonly string[]).includes(o.stage));
    const qualified = qualifiedBrands.filter((b) => b.sponsor_campaign_id === id).length;
    const plan = planBy.get(id) ?? {};
    const spent = Number(plan.spent_inr ?? 0);
    const confValue = sum(cConf.map((o) => o.confirmed_value_inr));
    const winRate = pct(cConf.length, cConf.length + cLost.length);
    const posRate = pct(positive, cnt("outreach_sent"));
    const m = {
      sponsor_campaign_id: id, campaign_name: c.campaign_name, channel: c.channel, channel_group: ["SC02", "SC04", "SC05"].includes(id) ? "warm" : "cold", owner_name: c.owner_name,
      status: plan.status ?? "active", budget_inr: Number(plan.budget_inr ?? 0), spent_inr: spent, hours_per_week: Number(plan.hours_per_week ?? 0),
      outreach_sent: cnt("outreach_sent"), delivered: cnt("delivered"), replies, positive_replies: positive, inbound_or_intro: inboundish,
      meetings_booked: cnt("meeting_booked"), meetings_held: cnt("meeting_held"), opt_outs: cnt("opt_out"),
      brands_reached: brandsReached, qualified_brands: qualified,
      opportunities: co.length, open_opportunities: cOpen.length, confirmed: cConf.length, lost_or_withdrawn: cLost.length,
      confirmed_value_inr: confValue, open_pipeline_inr: sum(cOpen.map((o) => o.proposed_value_inr)),
      weighted_pipeline_inr: Math.round(sum(cOpen.map((o) => o.proposed_value_inr * o.weight))),
      positive_reply_rate: posRate, meeting_show_rate: pct(cnt("meeting_held"), cnt("meeting_booked")),
      brand_to_opp_rate: pct(co.length, brandsReached), win_rate: winRate,
      avg_deal_inr: cConf.length ? Math.round(confValue / cConf.length) : null,
      cost_per_confirmed_inr: cConf.length ? Math.round(spent / cConf.length) : null,
      value_per_rupee: spent ? +(confValue / spent).toFixed(2) : null,
    };
    return { ...m, recommendation: recommend(m, S) };
  });

  // ---------- Weekly trend ----------
  const start = new Date(`${String(D.event.history_start instanceof Date ? isoDateIST(D.event.history_start) : D.event.history_start).slice(0, 10)}T00:00:00+05:30`);
  const oppCamp = new Map(D.opps.map((o) => [o.opportunity_id, o.sponsor_campaign_id]));
  const weeks: Row[] = [];
  for (let ws = start; ws < cutoff; ws = new Date(ws.getTime() + 7 * DAY)) {
    const we = new Date(Math.min(ws.getTime() + 7 * DAY, cutoff.getTime()));
    const wi = inter.filter((i) => new Date(i.occurred_at) >= ws && new Date(i.occurred_at) < we);
    const lat = latestBy(D.ohist, "opportunity_id", we);
    const conf = [...lat.values()].filter((h) => h.stage === "partner_confirmed");
    const tgt = [...D.targets].filter((t) => new Date(t.effective_at) < we).pop();
    weeks.push({
      week_start: isoDateIST(ws), outreach: wi.filter((i) => i.event_type === "outreach_sent").length,
      positive_replies: wi.filter((i) => i.event_type === "replied" && i.outcome === "positive").length,
      inbound_intros: wi.filter((i) => ["introduction_received", "web_inbound"].includes(i.event_type)).length,
      meetings_held: wi.filter((i) => i.event_type === "meeting_held").length,
      cum_confirmed: conf.length, cum_confirmed_value_inr: sum(conf.map((h) => Number(h.confirmed_value_inr))),
      ...Object.fromEntries(D.campaigns.map((c) => [`v_${c.sponsor_campaign_id}`, sum(conf.filter((h) => oppCamp.get(h.opportunity_id) === c.sponsor_campaign_id).map((h) => Number(h.confirmed_value_inr)))])),
      target_confirmed: tgt ? Number(tgt.confirmed_partnerships_goal) : null,
    });
  }

  // ---------- Bottlenecks (overall stage conversion vs. benchmarks) ----------
  const bottlenecks = funnel.slice(1).map((f, i) => ({ from: funnel[i].stage, to: f.stage, rate: f.conv_from_prev }))
    .filter((b) => b.rate != null).sort((a, b) => (a.rate! - b.rate!)).slice(0, 3);

  // ---------- Owners ----------
  const owners = new Map<string, Row>();
  for (const o of oppRows) {
    const k = o.owner_name ?? "Unassigned";
    const r = owners.get(k) ?? { owner_name: k, open: 0, stalled: 0, confirmed: 0, confirmed_value_inr: 0, open_pipeline_inr: 0 };
    if ((OPEN_STAGES as readonly string[]).includes(o.stage)) { r.open++; r.open_pipeline_inr += o.proposed_value_inr; }
    if (o.stalled) r.stalled++;
    if (o.stage === "partner_confirmed") { r.confirmed++; r.confirmed_value_inr += o.confirmed_value_inr; }
    owners.set(k, r);
  }

  const industries = new Map<string, Row>();
  for (const b of brands) {
    const r = industries.get(b.industry) ?? { industry: b.industry, brands: 0, opportunities: 0, confirmed: 0, confirmed_value_inr: 0 };
    r.brands++; industries.set(b.industry, r);
  }
  for (const o of oppRows) {
    const ind = D.brands.find((b) => b.brand_id === o.brand_id)?.industry;
    const r = industries.get(ind); if (!r) continue;
    r.opportunities++; if (o.stage === "partner_confirmed") { r.confirmed++; r.confirmed_value_inr += o.confirmed_value_inr; }
  }

  return {
    as_of: asOf, cutoff_exclusive: cutoff.toISOString(), event: D.event,
    funnel, forecast, targets, campaigns, weekly: weeks, bottlenecks,
    owners: [...owners.values()], industries: [...industries.values()],
    opportunities: oppRows.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || b.proposed_value_inr - a.proposed_value_inr),
    stalled: oppRows.filter((o) => o.stalled),
    stage_summary: STAGE_ORDER.map((s) => ({ stage: s, count: oppRows.filter((o) => o.stage === s).length, proposed_value_inr: sum(oppRows.filter((o) => o.stage === s).map((o) => o.proposed_value_inr)) })),
    activations: D.acts,
    data_gaps: [
      "No marketing spend in source data — budgets/spend are app-entered planning assumptions.",
      "No bank-receipt data in source — 'cash collected' only counts receipts logged in this app.",
      "Opportunity values are face values; confirmed value is not cash collected.",
      "Sponsor activations record associations only; they do not prove attendee uplift.",
      "Campaign attribution is observational (originating campaign at opportunity creation).",
    ],
    counts: { closed_lost_or_withdrawn: closedLost.length, open: open.length, confirmed: confirmed.length },
  };
}

export type Snapshot = ReturnType<typeof snapshot>;

export function recommend(m: Row, S: Settings) {
  const t = S.thresholds;
  const reasons: string[] = [];
  const closed = m.confirmed + m.lost_or_withdrawn;
  if (m.status === "stopped") return { action: "stopped", reasons: ["Campaign marked stopped by team."] };
  if (closed < t.min_sample_opps && m.opportunities < t.min_sample_opps) {
    return { action: "test_more", reasons: [`Only ${closed} closed opportunities (< ${t.min_sample_opps}); evidence insufficient to scale or stop.`] };
  }
  const wr = m.win_rate ?? 0;
  const cpc = m.cost_per_confirmed_inr;
  if (wr >= t.scale_win_rate && (cpc == null || cpc <= t.max_cost_per_confirmed_inr)) {
    reasons.push(`Win rate ${(wr * 100).toFixed(0)}% ≥ ${(t.scale_win_rate * 100).toFixed(0)}% scale threshold.`);
    if (cpc != null) reasons.push(`Cost per confirmed ₹${cpc.toLocaleString("en-IN")} ≤ ₹${t.max_cost_per_confirmed_inr.toLocaleString("en-IN")}.`);
    return { action: "scale", reasons };
  }
  if (wr < t.stop_win_rate) {
    reasons.push(`Win rate ${(wr * 100).toFixed(0)}% < ${(t.stop_win_rate * 100).toFixed(0)}% stop threshold.`);
    return { action: "stop", reasons };
  }
  if (m.positive_reply_rate != null && m.outreach_sent > 30 && m.positive_reply_rate < t.min_positive_reply_rate) reasons.push(`Positive reply rate ${(m.positive_reply_rate * 100).toFixed(0)}% below ${(t.min_positive_reply_rate * 100).toFixed(0)}% — fix targeting/message.`);
  if (cpc != null && cpc > t.max_cost_per_confirmed_inr) reasons.push(`Cost per confirmed ₹${cpc.toLocaleString("en-IN")} above ₹${t.max_cost_per_confirmed_inr.toLocaleString("en-IN")} ceiling.`);
  if (wr < t.scale_win_rate) reasons.push(`Win rate ${(wr * 100).toFixed(0)}% between stop and scale thresholds.`);
  return { action: "change", reasons };
}

export async function getSnapshot(asOf?: string) {
  const D = await loadAll();
  return snapshot(D, asOf || D.settings.as_of);
}
