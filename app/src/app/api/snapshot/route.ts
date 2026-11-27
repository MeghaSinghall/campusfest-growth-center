import { getSnapshot } from "@/lib/metrics";
import { handle } from "../_util";
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  const asOf = new URL(req.url).searchParams.get("asOf") || undefined;
  return handle(() => getSnapshot(asOf));
}
