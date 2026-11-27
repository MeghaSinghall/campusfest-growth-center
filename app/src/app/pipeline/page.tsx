"use client";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Columns3, Rows3, X, Banknote, Sparkles, Clock3, Plus } from "lucide-react";
import { useApp } from "@/components/AppShell";
import { Select, Donut, Legend } from "@/components/ui";
import { inr, lakh, stageLabel, STAGES, STAGE_COLOR, OWNERS, AVATAR } from "@/lib/fmt";

type Opp = NonNullable<ReturnType<typeof useApp>["snap"]>["opportunities"][number];
const OPEN = ["prospecting", "contacted", "proposal_sent", "negotiating"];
const stageOpts = STAGES.map((s) => ({ value: s, label: stageLabel(s), dot: STAGE_COLOR[s] }));

export default function Pipeline() {
  const { snap, refresh, openCopilot } = useApp();
  const [view, setView] = useState<"board" | "table">("board");
  const [stage, setStage] = useState("");
  const [campaign, setCampaign] = useState("");
  const [stalledOnly, setStalledOnly] = useState(false);
  const [sel, setSel] = useState<Opp | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [moved, setMoved] = useState<Record<string, string>>({}); // optimistic stage
  const rows = useMemo(() => (snap?.opportunities ?? []).map((o) => (moved[o.opportunity_id] ? { ...o, stage: moved[o.opportunity_id] } : o))
    .filter((o) => (!stage || o.stage === stage) && (!campaign || o.campaign_id === campaign) && (!stalledOnly || o.stalled)), [snap, stage, campaign, stalledOnly, moved]);
  useEffect(() => setMoved({}), [snap]);
  if (!snap) return null;

  const move = async (id: string, to: string) => {
    setMoved((m) => ({ ...m, [id]: to }));
    const r = await fetch(`/api/opportunities/${id}`, { method: "PATCH", body: JSON.stringify({ stage: to, note: "Moved on board" }) }).then((r) => r.json());
    if (r.error) { alert(r.error); setMoved((m) => { const n = { ...m }; delete n[id]; return n; }); return; }
    await refresh();
  };

  const openVal = snap.stage_summary.filter((s) => OPEN.includes(s.stage));
  const weighted = snap.forecast.weighted_open_pipeline_inr;
  const campOpts = [{ value: "", label: "All campaigns" }, ...snap.campaigns.map((c) => ({ value: c.sponsor_campaign_id, label: c.campaign_name }))];
  const supportMix = ["cash", "in_kind"].map((t) => ({ label: t === "cash" ? "Cash" : "In kind", value: snap.opportunities.filter((o) => o.stage === "partner_confirmed" && o.support_type === t).reduce((a, o) => a + o.confirmed_value_inr, 0), color: t === "cash" ? "#16a34a" : "#e0a12e" }));

  return (
    <div className="@container space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-tight font-medium">Sponsor pipeline</h1>
          <p className="mt-1 text-sm text-fg2">Drag a deal to another stage. Every move is saved as a new dated version, so earlier snapshots stay the same</p>
        </div>
        <div className="seg">
          <button data-on={view === "board"} onClick={() => setView("board")}><Columns3 size={14} strokeWidth={1.5} />Board</button>
          <button data-on={view === "table"} onClick={() => setView("table")}><Rows3 size={14} strokeWidth={1.5} />Table</button>
        </div>
      </div>

      <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="card p-5">
          <div className="flex items-baseline justify-between"><div className="label">Value by stage</div><span className="meta">Click a bar to filter</span></div>
          <div className="mt-2 h-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={snap.stage_summary} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }} barCategoryGap={5}>
                <XAxis type="number" hide /><YAxis type="category" dataKey="stage" tickFormatter={stageLabel} width={110} tick={{ fontSize: 11, fill: "var(--fg3)" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "var(--raised)" }} contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 }} formatter={(v, _n, p) => [`${inr(Number(v))} · ${(p.payload as { count: number }).count} deals`, "Value"]} labelFormatter={(l) => stageLabel(String(l))} />
                <Bar dataKey="proposed_value_inr" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d) => { const s = (d as unknown as { stage: string }).stage; setStage(stage === s ? "" : s); }}>
                  {snap.stage_summary.map((s) => <Cell key={s.stage} fill={STAGE_COLOR[s.stage]} fillOpacity={!stage || stage === s.stage ? 1 : 0.3} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <Donut data={openVal.map((s) => ({ label: stageLabel(s.stage), value: s.proposed_value_inr, color: STAGE_COLOR[s.stage] }))} size={112} thickness={12} center={lakh(openVal.reduce((a, s) => a + s.proposed_value_inr, 0))} sub="open" />
          <div className="min-w-0 flex-1">
            <div className="label">Open pipeline</div>
            <div className="mt-1 meta">{lakh(weighted)} weighted</div>
            <div className="mt-3"><Legend items={openVal.map((s) => ({ label: stageLabel(s.stage), color: STAGE_COLOR[s.stage], value: String(s.count) }))} /></div>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <Donut data={supportMix} size={112} thickness={12} center={lakh(snap.forecast.confirmed_value_inr)} sub="confirmed" />
          <div className="min-w-0 flex-1">
            <div className="label">Confirmed mix</div>
            <div className="mt-1 meta">{snap.stalled.length} open deals stalled</div>
            <div className="mt-3"><Legend items={supportMix.map((s) => ({ label: s.label, color: s.color, value: lakh(s.value) }))} /></div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={campaign} onChange={setCampaign} options={campOpts} className="w-56" />
        <Select value={stage} onChange={setStage} options={[{ value: "", label: "All stages" }, ...stageOpts]} className="w-44" />
        <button className="btn btn-ghost" onClick={() => setStalledOnly((s) => !s)} style={stalledOnly ? { borderColor: "var(--warn)", color: "var(--warn)" } : undefined}><Clock3 size={14} strokeWidth={1.5} />Stalled only</button>
        <span className="meta ml-2">{rows.length} deals · {inr(rows.reduce((a, o) => a + o.proposed_value_inr, 0))}</span>
      </div>

      {view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.filter((s) => !stage || s === stage).map((s) => {
            const items = rows.filter((o) => o.stage === s);
            return (
              <section key={s} onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); setOver(null); setDragId(null); const o = rows.find((x) => x.opportunity_id === id); if (o && o.stage !== s) move(id, s); }}
                className={`flex w-[248px] shrink-0 flex-col rounded-2xl border p-2 transition-colors ${over === s ? "border-accent bg-accent-soft" : "border-line bg-raised/60"}`}>
                <header className="px-2 pb-2 pt-1">
                  <div className="flex items-center gap-2"><span className="dot" style={{ background: STAGE_COLOR[s] }} /><span className="text-[13px] font-medium">{stageLabel(s)}</span><span className="meta ml-auto">{items.length}</span></div>
                  <div className="mt-1 font-mono text-xs text-fg3">{lakh(items.reduce((a, o) => a + (s === "partner_confirmed" ? o.confirmed_value_inr : o.proposed_value_inr), 0))}</div>
                </header>
                <div className="flex-1 space-y-2 max-h-[620px] overflow-y-auto">
                  {items.map((o) => (
                    <article key={o.opportunity_id} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.opportunity_id); setDragId(o.opportunity_id); }} onDragEnd={() => { setDragId(null); setOver(null); }}
                      onClick={() => setSel(o)} className={`cursor-grab rounded-xl border bg-card p-3 transition-[opacity,border-color] hover:border-line-strong active:cursor-grabbing ${dragId === o.opportunity_id ? "opacity-40" : ""} ${o.stalled ? "border-warn/50" : "border-line"}`} style={{ boxShadow: "var(--shadow)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><div className="truncate text-[13.5px] font-medium">{o.brand_name}</div><div className="truncate text-xs text-fg3">{o.campaign_name}</div></div>
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-medium text-white" style={{ background: AVATAR[o.owner_name ?? ""] ?? "var(--fg3)" }} title={o.owner_name ?? ""}>{(o.owner_name ?? "?").split(" ").map((p: string) => p[0]).join("")}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="font-mono text-[13px] tabular">{inr(o.stage === "partner_confirmed" ? o.confirmed_value_inr : o.proposed_value_inr)}</span>
                        <span className={`flex items-center gap-1 font-mono text-xs ${o.stalled ? "text-warn" : "text-fg3"}`}>{o.stalled && <Clock3 size={12} strokeWidth={1.5} />}{o.days_since_change}d</span>
                      </div>
                      {o.support_type === "in_kind" && <div className="mt-1 text-[11px] text-fg3">In kind</div>}
                    </article>
                  ))}
                  {!items.length && <div className={`flex h-20 items-center justify-center rounded-xl border border-dashed text-xs ${over === s ? "border-accent text-accent" : "border-line-strong text-fg3"}`}>Drop here</div>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full"><thead><tr>
            {["Opportunity", "Campaign", "Stage", "Proposed", "Confirmed", "Cash received", "Owner", "Idle days"].map((h, i) => <th key={h} className={`th ${i >= 3 && i !== 6 ? "text-right" : ""} ${i === 0 ? "pl-5" : ""}`}>{h}</th>)}
          </tr></thead><tbody>
            {rows.map((o) => (
              <tr key={o.opportunity_id} className="cursor-pointer hover:bg-raised/60 transition-colors" onClick={() => setSel(o)}>
                <td className="td pl-5"><div className="font-medium">{o.brand_name}</div><div className="meta">{o.opportunity_id} · {o.support_type === "cash" ? "Cash" : "In kind"}</div></td>
                <td className="td text-fg2">{o.campaign_name}</td>
                <td className="td"><span className="chip"><span className="dot" style={{ background: STAGE_COLOR[o.stage] }} />{stageLabel(o.stage)}</span></td>
                <td className="td text-right font-mono">{inr(o.proposed_value_inr)}</td><td className="td text-right font-mono">{o.confirmed_value_inr ? inr(o.confirmed_value_inr) : "—"}</td>
                <td className="td text-right font-mono">{o.cash_collected_inr ? inr(o.cash_collected_inr) : "—"}</td>
                <td className="td text-fg2">{o.owner_name}</td>
                <td className={`td text-right font-mono ${o.stalled ? "text-warn" : "text-fg3"}`}>{o.days_since_change}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
      {sel && <OppDrawer opp={sel} onClose={() => setSel(null)} onSaved={async () => { await refresh(); setSel(null); }} ask={(p) => { setSel(null); openCopilot(p); }} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5 text-xs text-fg3">{label}{children}</div>;
}

function OppDrawer({ opp, onClose, onSaved, ask }: { opp: Opp; onClose: () => void; onSaved: () => Promise<void>; ask: (p: string) => void }) {
  const [stage, setStage] = useState(opp.stage);
  const [proposed, setProposed] = useState(String(opp.proposed_value_inr));
  const [owner, setOwner] = useState(opp.owner_name ?? OWNERS[0]);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [task, setTask] = useState("");
  const [taskDone, setTaskDone] = useState(false);
  const [detail, setDetail] = useState<{ history: Record<string, string>[]; interactions: Record<string, string>[]; payments: Record<string, string>[] } | null>(null);
  useEffect(() => { fetch(`/api/opportunities/${opp.opportunity_id}`).then((r) => r.json()).then(setDetail); }, [opp.opportunity_id]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector('[role="listbox"]')) onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const post = async (url: string, method: string, body: unknown) => {
    const r = await fetch(url, { method, body: JSON.stringify(body) }).then((r) => r.json());
    if (r.error) { alert(r.error); return false; } return true;
  };
  const events = [
    ...(detail?.history.map((h) => ({ at: h.effective_at, kind: "stage", text: `${stageLabel(h.stage)} · ${inr(Number(h.proposed_value_inr))}`, sub: `${h.owner_name ?? ""}${h.source === "app" ? " · app edit" : ""}${h.note ? ` · ${h.note}` : ""}`, color: STAGE_COLOR[h.stage] })) ?? []),
    ...(detail?.interactions.map((i) => ({ at: i.occurred_at, kind: "touch", text: `${i.event_type.replace(/_/g, " ")} · ${i.outcome.replace(/_/g, " ")}`, sub: i.campaign_name, color: "var(--fg3)" })) ?? []),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)));

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[#0b1f16]/40 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rise h-full w-full max-w-[480px] overflow-y-auto border-l border-line bg-bg" style={{ boxShadow: "var(--shadow-float)" }}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-card px-6 py-5">
          <div className="min-w-0">
            <div className="chip"><span className="dot" style={{ background: STAGE_COLOR[opp.stage] }} />{stageLabel(opp.stage)} · {opp.days_since_change} days in stage</div>
            <div className="mt-2 text-[22px] leading-tight font-medium">{opp.brand_name}</div>
            <div className="mt-1 text-[13px] text-fg2">{opp.campaign_name} · {opp.support_type === "cash" ? "Cash" : "In kind"} · {opp.opportunity_id}</div>
          </div>
          <button className="btn btn-quiet px-2" onClick={onClose} aria-label="Close"><X size={16} strokeWidth={1.5} /></button>
        </div>
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-3 gap-2">
            {[["Proposed", inr(opp.proposed_value_inr)], ["Confirmed", opp.confirmed_value_inr ? inr(opp.confirmed_value_inr) : "—"], ["Cash in", opp.cash_collected_inr ? inr(opp.cash_collected_inr) : "—"]].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line bg-card p-3"><div className="text-xs text-fg3">{k}</div><div className="mt-1 font-mono text-[15px] tabular">{v}</div></div>
            ))}
          </div>

          <section className="card p-5 space-y-3">
            <div className="text-[15px] font-medium">Update deal</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stage"><Select value={stage} onChange={setStage} options={stageOpts} /></Field>
              <Field label="Proposed value"><input className="input font-mono" type="number" value={proposed} onChange={(e) => setProposed(e.target.value)} /></Field>
              <Field label="Owner"><Select value={owner} onChange={setOwner} options={OWNERS.map((o) => ({ value: o, label: o, dot: AVATAR[o] }))} /></Field>
              <Field label="Note"><input className="input" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            </div>
            <button className="btn btn-primary" onClick={async () => { if (await post(`/api/opportunities/${opp.opportunity_id}`, "PATCH", { stage, proposed_value_inr: Number(proposed), owner_name: owner, note })) await onSaved(); }}>Save new version</button>
          </section>

          <section className="card p-5 space-y-3">
            <div className="flex items-center gap-2 text-[15px] font-medium"><Banknote size={16} strokeWidth={1.5} className="text-accent" />Log cash received</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount"><input className="input font-mono" type="number" placeholder="₹" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Field label="UTR or reference"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
            </div>
            <button className="btn btn-primary" disabled={!amount} onClick={async () => { if (await post("/api/payments", "POST", { opportunity_id: opp.opportunity_id, amount_inr: Number(amount), reference: ref })) await onSaved(); }}>Log receipt</button>
            {!!detail?.payments.length && <ul className="space-y-1 font-mono text-xs text-fg2">{detail.payments.map((p, i) => <li key={i}>{String(p.received_at).slice(0, 10)} · {inr(Number(p.amount_inr))} · {p.reference}</li>)}</ul>}
          </section>

          <section className="card p-5 space-y-3">
            <div className="text-[15px] font-medium">Follow-up</div>
            <div className="flex gap-2"><input className="input flex-1" placeholder="Send contract and invoice" value={task} onChange={(e) => { setTask(e.target.value); setTaskDone(false); }} />
              <button className="btn btn-primary" disabled={!task} onClick={async () => { if (await post("/api/tasks", "POST", { title: task, opportunity_id: opp.opportunity_id, sponsor_campaign_id: opp.campaign_id, owner_name: opp.owner_name, priority: "high" })) { setTask(""); setTaskDone(true); } }}><Plus size={14} strokeWidth={1.5} />Add</button></div>
            {taskDone && <div className="text-xs text-pos">Task added to the board</div>}
            <button className="btn btn-ghost" onClick={() => ask(`What's the history of the ${opp.brand_name} deal (${opp.opportunity_id}) and what should we do next?`)}><Sparkles size={14} strokeWidth={1.5} />Ask the analyst about this deal</button>
          </section>

          <section className="card p-5">
            <div className="text-[15px] font-medium">Timeline</div>
            <ol className="mt-4 space-y-3 border-l border-line pl-4">
              {events.map((e, k) => (
                <li key={k} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full" style={{ background: e.color, boxShadow: "0 0 0 2px var(--card)" }} />
                  <div className={`text-[13px] ${e.kind === "stage" ? "font-medium" : "text-fg2"}`}>{e.text.charAt(0).toUpperCase() + e.text.slice(1)}</div>
                  <div className="meta">{new Date(e.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {e.sub}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
