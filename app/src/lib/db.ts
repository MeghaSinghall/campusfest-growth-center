import { Pool, types } from "pg";

// Return DATE columns as plain "YYYY-MM-DD" strings (no timezone shift to the previous day)
types.setTypeParser(1082, (v: string) => v);

const g = globalThis as unknown as { __pool?: Pool };
export const pool = g.__pool ?? new Pool({ connectionString: process.env.DATABASE_URL || "postgres://localhost/campusfest", max: 5, ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined });
if (process.env.NODE_ENV !== "production") g.__pool = pool;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function q<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(sql, params);
  return r.rows as T[];
}

export async function audit(actor: string, action: string, entity: string, entityId: string | number | null, details: unknown) {
  await q("INSERT INTO app_audit_log (actor, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5)", [actor, action, entity, entityId == null ? null : String(entityId), JSON.stringify(details ?? null)]);
}

export async function getSettings(): Promise<Settings> {
  const rows = await q<{ key: string; value: unknown }>("SELECT key, value FROM app_settings");
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as unknown as Settings;
}

export type Settings = {
  as_of: string;
  stage_weights: Record<string, number>;
  collection_rate_assumption: number;
  confirmed_value_goal_inr: number;
  stall_days: number;
  thresholds: { scale_win_rate: number; stop_win_rate: number; min_positive_reply_rate: number; max_cost_per_confirmed_inr: number; min_sample_opps: number };
};
