import { updateOpportunity } from "@/lib/mutations";
import { q } from "@/lib/db";
import { handle } from "../../_util";
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const body = await req.json();
  return handle(() => updateOpportunity(id, body));
}
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => ({
    history: await q("SELECT * FROM opportunity_history WHERE opportunity_id=$1 ORDER BY effective_at", [id]),
    payments: await q("SELECT * FROM app_payment WHERE opportunity_id=$1 ORDER BY received_at", [id]),
    interactions: await q(`SELECT i.occurred_at, i.event_type, i.outcome, i.summary, c.campaign_name FROM sponsor_interaction i JOIN sponsor_campaign c USING (sponsor_campaign_id)
       WHERE i.brand_id=(SELECT brand_id FROM partner_opportunity WHERE opportunity_id=$1) ORDER BY occurred_at`, [id]),
  }));
}
