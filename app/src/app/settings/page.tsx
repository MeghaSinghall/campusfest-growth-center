"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";

type S = { settings: Record<string, any>; import_issues: { source_table: string; source_id: string; issue: string }[] }; // eslint-disable-line @typescript-eslint/no-explicit-any

export default function SettingsPage() {
  const { refresh, version, snap } = useApp();
  const [s, setS] = useState<S | null>(null);
  const [audit, setAudit] = useState<Record<string, string>[]>([]);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => { setS(d); const { as_of, ...rest } = d.settings; void as_of; setDraft(JSON.stringify(rest, null, 2)); }); // eslint-disable-line @typescript-eslint/no-unused-vars
    fetch("/api/audit").then((r) => r.json()).then(setAudit);
  }, [version]);
  if (!s) return null;

  const save = async () => {
    let body; try { body = JSON.parse(draft); } catch { return alert("Invalid JSON"); }
    const r = await fetch("/api/settings", { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.json());
    if (r.error) return alert(r.error);
    await refresh();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-[32px] leading-tight font-medium">Assumptions and data</h1>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-6">
          <div className="text-[15px] font-medium">Model assumptions</div>
          <p className="text-xs text-fg3 mb-2">Drives weighted forecast, projected cash, stall alerts and scale/change/stop signals. Changes re-compute every view and the AI analyst&apos;s answers.</p>
          <textarea className="input w-full font-mono text-xs h-80" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="btn btn-primary mt-2" onClick={save}>Save assumptions</button>
        </div>
        <div className="space-y-4">
          <div className="card p-6">
            <div className="text-[15px] font-medium mb-3">Sourced facts vs assumptions</div>
            <ul className="text-xs space-y-1 text-fg2 list-disc pl-4">
              <li><b>Sourced (RISA dataset):</b> brands, contacts, 6 campaigns, 950 interactions, qualification history, 58 opportunities + stage history, targets (40→55 qualified, 20→28 confirmed), 3 activations.</li>
              <li><b>Assumed (app-entered):</b> campaign budgets/spend/hours, stage win-probabilities, cash collection rate, ₹30L value goal, scale/stop thresholds, cash receipts logged by the team.</li>
              {snap?.data_gaps.map((g) => <li key={g}>{g}</li>)}
            </ul>
          </div>
          <div className="card p-6">
            <div className="text-[15px] font-medium mb-3">Import data-quality log</div>
            <ul className="text-xs text-fg2 list-disc pl-4">{s.import_issues.map((i, k) => <li key={k}>{i.source_table}: {i.issue}</li>)}</ul>
          </div>
        </div>
      </div>
      <div className="card p-6">
        <div className="text-[15px] font-medium mb-3">Audit log (latest 100 changes)</div>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-xs"><tbody>
            {audit.map((a) => <tr key={a.id} className="border-b border-line"><td className="py-1 pr-2 whitespace-nowrap text-fg3">{new Date(a.at).toLocaleString("en-IN")}</td><td className={`pr-2 ${a.actor === "copilot" ? "text-accent" : ""}`}>{a.actor}</td><td className="pr-2">{a.action} {a.entity} {a.entity_id}</td><td className="text-fg3 font-mono truncate max-w-md">{JSON.stringify(a.details)}</td></tr>)}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}
