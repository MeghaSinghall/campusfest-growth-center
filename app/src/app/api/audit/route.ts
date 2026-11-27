import { q } from "@/lib/db";
import { handle } from "../_util";
export const dynamic = "force-dynamic";
export function GET() { return handle(() => q("SELECT * FROM app_audit_log ORDER BY id DESC LIMIT 100")); }
