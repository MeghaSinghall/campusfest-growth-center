import { updateCampaignPlan } from "@/lib/mutations";
import { handle } from "../../_util";
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const body = await req.json();
  return handle(() => updateCampaignPlan(id, body));
}
