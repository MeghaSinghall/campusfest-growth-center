import { NextResponse } from "next/server";
export function handle(fn: () => Promise<unknown>) {
  return fn().then((r) => NextResponse.json(r ?? { ok: true })).catch((e: Error) => NextResponse.json({ error: e.message }, { status: 400 }));
}
