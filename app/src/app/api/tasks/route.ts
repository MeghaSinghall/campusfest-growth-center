import { createTask } from "@/lib/mutations";
import { q } from "@/lib/db";
import { handle } from "../_util";
export const dynamic = "force-dynamic";
export function GET() {
  return handle(() => q(`SELECT t.*, c.campaign_name, o.opportunity_name FROM app_task t
    LEFT JOIN sponsor_campaign c USING (sponsor_campaign_id) LEFT JOIN partner_opportunity o USING (opportunity_id)
    ORDER BY (t.status='done'), t.due_date NULLS LAST, t.id`));
}
export async function POST(req: Request) { const b = await req.json(); return handle(() => createTask(b, b.created_by === "copilot" ? "copilot" : "user")); }
