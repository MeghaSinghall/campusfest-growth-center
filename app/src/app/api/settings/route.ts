import { getSettings, q } from "@/lib/db";
import { updateSettings } from "@/lib/mutations";
import { handle } from "../_util";
export const dynamic = "force-dynamic";
export function GET() {
  return handle(async () => ({ settings: await getSettings(), import_issues: await q("SELECT source_table, source_id, issue FROM app_import_issue"), event: (await q("SELECT * FROM event"))[0] }));
}
export async function PATCH(req: Request) { const b = await req.json(); return handle(() => updateSettings(b)); }
