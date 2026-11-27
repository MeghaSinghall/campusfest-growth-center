import { chat } from "@/lib/copilot";
import { handle } from "../_util";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const { messages, asOf } = await req.json();
  return handle(() => chat(messages, asOf));
}
