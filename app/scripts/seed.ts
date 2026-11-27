/* Loads the original RISA sponsorship dataset into local Postgres.
 * - All naive source timestamps are interpreted as Asia/Kolkata (+05:30), per the dataset Read me.
 * - Rows repeated with the same stable ID and identical payload are import retries -> dropped.
 * - Same ID with a different payload -> first kept, conflict logged in app_import_issue.
 * Usage: npm run db:reset   (drop + recreate + seed original data)
 *        npm run db:init    (seed only if the database is empty; used at deploy start)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { Client } from "pg";

const SRC = path.join(__dirname, "..", "db", "source");
const IST = (s: string) => (s ? `${s.replace(" ", "T")}+05:30` : null);
const num = (s: string) => (s === "" || s == null ? null : Math.round(Number(s)));
const nul = (s: string) => (s === "" ? null : s);

function read(file: string): Record<string, string>[] {
  return parse(readFileSync(path.join(SRC, file)), { columns: true, skip_empty_lines: true });
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL || "postgres://localhost/campusfest", ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined });
  await db.connect();
  // --if-empty: used on every deploy start; seeds only a fresh database so the team's edits survive restarts
  if (process.argv.includes("--if-empty")) {
    const r = await db.query("SELECT to_regclass('public.event') IS NOT NULL AS ok");
    if (r.rows[0].ok && (await db.query("SELECT count(*)::int n FROM event")).rows[0].n > 0) {
      console.log("Database already seeded, skipping (run `npm run db:reset` to restore the original dataset).");
      await db.end(); return;
    }
  }
  await db.query(readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8"));

  const issues: { t: string; id: string; issue: string; payload: unknown }[] = [];
  function dedupe(t: string, rows: Record<string, string>[], key: string) {
    const seen = new Map<string, string>();
    const out: Record<string, string>[] = [];
    let retries = 0;
    for (const r of rows) {
      const sig = JSON.stringify(r);
      const prev = seen.get(r[key]);
      if (prev === undefined) { seen.set(r[key], sig); out.push(r); }
      else if (prev === sig) retries++;
      else issues.push({ t, id: r[key], issue: "same id, different payload (kept first)", payload: r });
    }
    if (retries) issues.push({ t, id: "*", issue: `${retries} identical import-retry rows dropped`, payload: null });
    return out;
  }

  async function insert(table: string, cols: string[], rows: unknown[][]) {
    for (const r of rows) {
      await db.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})`, r);
    }
    console.log(`${table}: ${rows.length}`);
  }

  await db.query("BEGIN");
  const ev = read("event.csv")[0];
  await insert("event", ["event_name", "history_start", "history_end", "event_starts_at", "event_ends_at", "timezone", "currency", "fictional"],
    [[ev.event_name, ev.history_start.slice(0, 10), ev.history_end.slice(0, 10), IST(ev.event_starts_at), IST(ev.event_ends_at), ev.timezone, ev.currency, ev.fictional === "True"]]);

  await insert("target_plan", ["target_version", "effective_at", "qualified_brands_goal", "confirmed_partnerships_goal"],
    read("targets.csv").map((r) => [r.target_version, IST(r.effective_at), num(r.qualified_brands_goal), num(r.confirmed_partnerships_goal)]));

  await insert("brand", ["brand_id", "brand_name", "industry", "owner_id", "owner_name", "created_at"],
    dedupe("brands", read("brands.csv"), "brand_id").map((r) => [r.brand_id, r.brand_name, r.industry, r.owner_id, r.owner_name, IST(r.created_at)]));

  await insert("sponsor_contact", ["contact_id", "contact_name", "job_title", "brand_id", "created_at"],
    dedupe("contacts", read("sponsor_contacts.csv"), "contact_id").map((r) => [r.contact_id, r.contact_name, r.job_title, r.brand_id, IST(r.created_at)]));

  await insert("sponsor_campaign", ["sponsor_campaign_id", "campaign_name", "channel", "objective", "audience", "owner_id", "owner_name", "planned_start_at", "planned_end_at", "created_at"],
    read("sponsor_campaigns.csv").map((r) => [r.sponsor_campaign_id, r.campaign_name, r.channel, r.objective, r.audience, r.owner_id, r.owner_name, IST(r.planned_start_at), IST(r.planned_end_at), IST(r.created_at)]));

  await insert("sponsor_interaction", ["interaction_id", "attempt_id", "origin_interaction_id", "brand_id", "contact_id", "sponsor_campaign_id", "owner_id", "channel", "event_type", "outcome", "summary", "occurred_at"],
    dedupe("sponsor_interactions", read("sponsor_interactions.csv"), "interaction_id").map((r) => [r.interaction_id, r.attempt_id, nul(r.origin_interaction_id), r.brand_id, nul(r.contact_id), r.sponsor_campaign_id, r.owner_id, r.channel, r.event_type, r.outcome, r.summary, IST(r.occurred_at)]));

  await insert("brand_qualification", ["history_id", "brand_id", "qualification_status", "reason", "sponsor_campaign_id", "effective_at"],
    dedupe("brand_qualification", read("brand_qualification.csv"), "history_id").map((r) => [r.history_id, r.brand_id, r.qualification_status, r.reason, r.sponsor_campaign_id, IST(r.effective_at)]));

  await insert("partner_opportunity", ["opportunity_id", "opportunity_name", "brand_id", "primary_contact_id", "sponsor_campaign_id", "support_type", "created_at"],
    dedupe("partner_opportunities", read("partner_opportunities.csv"), "opportunity_id").map((r) => [r.opportunity_id, r.opportunity_name, r.brand_id, r.primary_contact_id, r.sponsor_campaign_id, r.support_type, IST(r.created_at)]));

  await insert("opportunity_history", ["history_id", "opportunity_id", "brand_id", "stage", "proposed_value_inr", "confirmed_value_inr", "owner_id", "owner_name", "effective_at"],
    dedupe("opportunity_history", read("opportunity_history.csv"), "history_id").map((r) => [r.history_id, r.opportunity_id, r.brand_id, r.stage, num(r.proposed_value_inr), num(r.confirmed_value_inr), r.owner_id, r.owner_name, IST(r.effective_at)]));

  await insert("sponsor_activation", ["activation_id", "brand_id", "opportunity_id", "attendee_campaign_id", "attendee_campaign_name", "activation_note", "linked_at"],
    read("sponsor_activations.csv").map((r) => [r.activation_id, r.brand_id, r.opportunity_id, r.attendee_campaign_id, r.attendee_campaign_name, r.activation_note, IST(r.linked_at)]));

  for (const i of issues) await db.query("INSERT INTO app_import_issue (source_table, source_id, issue, payload) VALUES ($1,$2,$3,$4)", [i.t, i.id, i.issue, i.payload]);
  console.log("import issues:", issues.map((i) => `${i.t}: ${i.issue}`));

  // ---- App defaults (ASSUMPTIONS — clearly labelled in UI and README; editable in the app) ----
  // Source data has no spend. Budgets below are a planning assumption for a ₹6L sponsor-acquisition budget.
  const plans: [string, number, number, number][] = [
    // id, budget, spent-to-date, team hours/week
    ["SC01", 120000, 95000, 12], // cold email: tooling + data + 1 SDR
    ["SC02", 60000, 30000, 6],   // warm intros: alumni dinners, gifts
    ["SC03", 150000, 130000, 10],// LinkedIn: Sales Navigator + InMail + content
    ["SC04", 80000, 55000, 3],   // inbound form: deck, landing page, ads
    ["SC05", 90000, 60000, 6],   // creator referrals: referral fees
    ["SC06", 40000, 25000, 4],   // revival email
  ];
  for (const [id, b, s, h] of plans) {
    await db.query("INSERT INTO app_campaign_plan (sponsor_campaign_id, budget_inr, spent_inr, hours_per_week, notes) VALUES ($1,$2,$3,$4,$5)",
      [id, b, s, h, "Budget/spend are planning assumptions (not in source data)."]);
  }
  const settings: Record<string, unknown> = {
    as_of: "2025-04-20",
    // Stage win-probabilities for weighted forecast (assumption; calibrated to source close rates in README)
    stage_weights: { prospecting: 0.1, contacted: 0.2, proposal_sent: 0.4, negotiating: 0.65, partner_confirmed: 1, lost: 0, withdrawn: 0 },
    // Cash-collection assumption when no receipt is logged: share of confirmed cash value expected before the event
    collection_rate_assumption: 0.8,
    confirmed_value_goal_inr: 3000000,
    stall_days: 14,
    thresholds: { scale_win_rate: 0.6, stop_win_rate: 0.25, min_positive_reply_rate: 0.15, max_cost_per_confirmed_inr: 40000, min_sample_opps: 5 },
  };
  for (const [k, v] of Object.entries(settings)) await db.query("INSERT INTO app_settings VALUES ($1,$2)", [k, JSON.stringify(v)]);

  const seedTasks: [string, string, string, string, string, string | null, string | null][] = [
    ["Send revised deck to negotiating brands", "Attach the activation menu and attendee profile.", "Riya Kapoor", "2025-03-25", "high", "SC03", null],
    ["Clean bounced email list", "Remove wrong-contact and opt-out contacts from Brand Discovery Email.", "Kabir Shah", "2025-03-20", "medium", "SC01", null],
    ["Alumni sponsor dinner", "Host 8 alumni founders; ask each for 2 warm intros.", "Riya Kapoor", "2025-03-28", "high", "SC02", null],
  ];
  for (const t of seedTasks) await db.query("INSERT INTO app_task (title, description, owner_name, due_date, priority, sponsor_campaign_id, opportunity_id, created_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'seed','todo')", t);

  await db.query("COMMIT");
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
