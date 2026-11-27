import { logPayment } from "@/lib/mutations";
import { handle } from "../_util";
export async function POST(req: Request) { const b = await req.json(); return handle(() => logPayment(b)); }
