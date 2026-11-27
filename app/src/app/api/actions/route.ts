/* Executes a copilot proposal ONLY after explicit user confirmation in the UI. */
import { createTask, updateTask, updateCampaignPlan, updateOpportunity, logPayment } from "@/lib/mutations";
import { handle } from "../_util";
import { normalizePayload } from "@/lib/copilot";
export async function POST(req: Request) {
  const { type, payload } = await req.json();
  return handle(async () => {
    const p = normalizePayload(type, payload) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    switch (type) {
      case "create_task": return createTask(p, "copilot");
      case "update_task": { const { id, ...rest } = p; return updateTask(Number(id), rest, "copilot"); }
      case "update_campaign": { const { sponsor_campaign_id, ...rest } = p; return updateCampaignPlan(sponsor_campaign_id, rest, "copilot"); }
      case "update_opportunity": { const { opportunity_id, ...rest } = p; return updateOpportunity(opportunity_id, rest, "copilot"); }
      case "log_payment": return logPayment(p, "copilot");
    }
    throw new Error(`unknown action ${type}`);
  });
}
