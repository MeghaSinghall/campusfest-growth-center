"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend as RLegend } from "recharts";
import { LayoutGrid, Rows3, Sparkles, Pencil, Stethoscope } from "lucide-react";
import { useApp } from "@/components/AppShell";
import { Select, Donut, Legend } from "@/components/ui";
import { inr, lakh, pct, ACTION_DOT, ACTION_LABEL, CHANNEL_COLOR } from "@/lib/fmt";

type Camp = NonNullable<ReturnType<typeof useApp>["snap"]>["campaigns"][number];
const STATUS = [
  { value: "active", label: "Active", dot: "var(--fg3)" }, { value: "scaling", label: "Scaling", dot: "var(--pos)" },
  { value: "fixing", label: "Fixing", dot: "var(--warn)" }, { value: "paused", label: "Paused", dot: "var(--fg3)" }, { value: "stopped", label: "Stopped", dot: "var(--neg)" },
];
const SHORT: Record<string, string> = { SC01: "Cold email", SC02: "Warm intros", SC03: "LinkedIn", SC04: "Inbound form", SC05: "Creators", SC06: "Revival" };
const colorOf = (id: string) => (CHANNEL_COLOR[id]?.startsWith("#") ? CHANNEL_COLOR[id] : ({ SC01: "#8fa398", SC03: "#6b7f74", SC06: "#b8c6bd" } as Record<string, string>)[id]);

export default function Campaigns() {
  const { snap, openCopilot } = useApp();
  const [view, setView] = useState<"cards" | "table">("cards");
  if (!snap) return null;
  const C = snap.campaigns;
  const totalBudget = C.reduce((a, c) => a + c.budget_inr, 0);
  const totalSpent = C.reduce((a, c) => a + c.spent_inr, 0);
  const valueShare = C.filter((c) => c.confirmed_value_inr > 0).map((c) => ({ label: c.campaign_name, value: c.confirmed_value_inr, color: colorOf(c.sponsor_campaign_id) }));
  const spendShare = C.map((c) => ({ label: c.campaign_name, value: c.spent_inr, color: colorOf(c.sponsor_campaign_id) }));
  const bars = C.map((c) => ({ name: SHORT[c.sponsor_campaign_id], Budget: c.budget_inr, Spent: c.spent_inr, Confirmed: c.confirmed_value_inr }));
  const coldSpend = C.filter((c) => c.confirmed === 0).reduce((a, c) => a + c.spent_inr, 0);

  return (
    <div className="@container space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-tight font-medium">Acquisition campaigns</h1>
          <p className="mt-1 text-sm text-fg2">{inr(totalSpent)} spent of {inr(totalBudget)}. Budget and spend are team-entered assumptions, the source data has none</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => openCopilot("We have ₹1,00,000 of unspent budget and 10 days left. How should we reallocate it across campaigns? Show the math.")}><Sparkles size={14} strokeWidth={1.5} />Reallocate budget</button>
          <div className="seg">
            <button data-on={view === "cards"} onClick={() => setView("cards")}><LayoutGrid size={14} strokeWidth={1.5} />Cards</button>
            <button data-on={view === "table"} onClick={() => setView("table")}><Rows3 size={14} strokeWidth={1.5} />Table</button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="card p-6">
          <div className="flex items-baseline justify-between">
            <div><div className="label">Spend against what it brought in</div><div className="mt-2 text-[30px] leading-none font-medium tabular">{inr(coldSpend)}</div><div className="mt-2 meta text-neg">spent on campaigns with zero confirmed deals</div></div>
          </div>
          <div className="mt-4 h-[240px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars} barGap={2} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--fg3)" }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tickFormatter={(v) => `${v / 100000}L`} tick={{ fontSize: 11, fill: "var(--fg3)", fontFamily: "var(--font-geist-mono)" }} axisLine={false} tickLine={false} width={36} />
                <Tooltip cursor={{ fill: "var(--raised)" }} contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 }} formatter={(v) => inr(Number(v))} />
                <RLegend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 12, color: "var(--fg2)" }} />
                <Bar dataKey="Budget" fill="var(--chart-muted)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Spent" fill="#8fa398" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Confirmed" fill="var(--accent)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="grid gap-4">
          <div className="card p-5 flex items-center gap-5">
            <Donut data={valueShare} size={120} thickness={13} center={lakh(snap.forecast.confirmed_value_inr)} sub="confirmed" />
            <div className="min-w-0 flex-1"><div className="label mb-3">Where confirmed value came from</div><Legend items={valueShare.map((v) => ({ label: v.label, color: v.color, value: pct(v.value / snap.forecast.confirmed_value_inr) }))} /></div>
          </div>
          <div className="card p-5 flex items-center gap-5">
            <Donut data={spendShare} size={120} thickness={13} center={lakh(totalSpent)} sub="spent" />
            <div className="min-w-0 flex-1"><div className="label mb-3">Where the money went</div><Legend items={spendShare.map((v) => ({ label: v.label, color: v.color, value: pct(v.value / totalSpent) }))} /></div>
          </div>
        </div>
      </div>

      {view === "cards" ? (
        <div className="grid gap-4 @2xl:grid-cols-2 @6xl:grid-cols-3">{C.map((c) => <CampaignCard key={c.sponsor_campaign_id} c={c} />)}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr>{["Campaign", "Status", "Touches", "Pos. replies", "Meetings", "Opps", "Won / lost", "Win rate", "Confirmed", "Spent", "Cost per deal", "Signal"].map((h, i) => <th key={h} className={`th ${i >= 2 && i < 11 ? "text-right" : ""} ${i === 0 ? "pl-5" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>{C.map((c) => (
              <tr key={c.sponsor_campaign_id} className="hover:bg-raised/60 transition-colors">
                <td className="td pl-5"><span className="chip text-fg text-[13px]"><span className="dot" style={{ background: colorOf(c.sponsor_campaign_id) }} />{c.campaign_name}</span></td>
                <td className="td text-fg2">{STATUS.find((s) => s.value === c.status)?.label}</td>
                <td className="td text-right font-mono">{c.outreach_sent + c.inbound_or_intro}</td><td className="td text-right font-mono">{c.positive_replies}</td>
                <td className="td text-right font-mono">{c.meetings_held}</td><td className="td text-right font-mono">{c.opportunities}</td>
                <td className="td text-right font-mono">{c.confirmed} / {c.lost_or_withdrawn}</td><td className="td text-right font-mono">{pct(c.win_rate)}</td>
                <td className="td text-right font-mono">{lakh(c.confirmed_value_inr)}</td><td className="td text-right font-mono">{lakh(c.spent_inr)}</td>
                <td className="td text-right font-mono">{inr(c.cost_per_confirmed_inr)}</td>
                <td className="td" title={c.recommendation.reasons.join(" ")}><span className="chip"><span className={`dot ${ACTION_DOT[c.recommendation.action]}`} />{ACTION_LABEL[c.recommendation.action]}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CampaignCard({ c }: { c: Camp }) {
  const { refresh, openCopilot } = useApp();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ status: c.status, budget_inr: String(c.budget_inr), spent_inr: String(c.spent_inr), hours_per_week: String(c.hours_per_week) });
  const color = colorOf(c.sponsor_campaign_id);
  const steps = [
    { k: "Touches", v: c.outreach_sent + c.inbound_or_intro }, { k: "Positive", v: c.positive_replies + (c.outreach_sent ? 0 : 0) },
    { k: "Meetings", v: c.meetings_held }, { k: "Opps", v: c.opportunities }, { k: "Won", v: c.confirmed },
  ];
  const top = Math.max(steps[0].v, 1);
  const used = c.budget_inr ? c.spent_inr / c.budget_inr : 0;
  const save = async () => {
    const r = await fetch(`/api/campaigns/${c.sponsor_campaign_id}`, { method: "PATCH", body: JSON.stringify({ status: f.status, budget_inr: Number(f.budget_inr), spent_inr: Number(f.spent_inr), hours_per_week: Number(f.hours_per_week) }) }).then((r) => r.json());
    if (r.error) return alert(r.error);
    setEditing(false); await refresh();
  };

  return (
    <div className="card rise flex flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} /><span className="truncate text-[15px] font-medium">{c.campaign_name}</span></div>
          <div className="mt-1 meta">{c.sponsor_campaign_id} · {c.channel.replace("_", " ")} · {c.owner_name}</div>
        </div>
        <span className={`chip shrink-0 rounded-full border px-2 py-0.5 ${c.recommendation.action === "scale" ? "border-pos/30 text-pos" : c.recommendation.action === "stop" ? "border-neg/30 text-neg" : "border-line text-fg2"}`}>
          <span className={`dot ${ACTION_DOT[c.recommendation.action]}`} />{ACTION_LABEL[c.recommendation.action]}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4">
        <div><div className="text-xs text-fg3">Confirmed</div><div className="mt-1 text-[22px] leading-none font-medium tabular">{lakh(c.confirmed_value_inr)}</div></div>
        <div><div className="text-xs text-fg3">Win rate</div><div className={`mt-1 text-[22px] leading-none font-medium tabular ${c.win_rate === 0 ? "text-neg" : ""}`}>{pct(c.win_rate)}</div></div>
        <div><div className="text-xs text-fg3">Cost per deal</div><div className="mt-1 text-[22px] leading-none font-medium tabular">{c.cost_per_confirmed_inr == null ? "—" : lakh(c.cost_per_confirmed_inr)}</div></div>
      </div>

      <div className="mt-5">
        <div className="text-xs text-fg3 mb-2">Funnel</div>
        <div className="space-y-1.5">
          {steps.map((s) => (
            <div key={s.k} className="grid grid-cols-[64px_1fr_32px] items-center gap-2 text-xs">
              <span className="text-fg3">{s.k}</span>
              <div className="h-2 rounded-full bg-raised"><div className="h-2 rounded-full transition-[width] duration-500" style={{ width: `${Math.max((s.v / top) * 100, s.v ? 3 : 0)}%`, background: s.k === "Won" ? "var(--accent)" : color, opacity: s.k === "Won" ? 1 : 0.75 }} /></div>
              <span className="text-right font-mono tabular">{s.v}</span>
            </div>
          ))}
        </div>
      </div>

      <ul className="mt-4 space-y-1 text-xs leading-[18px] text-fg2">{c.recommendation.reasons.map((r, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-fg3" />{r.replace(/\.$/, "")}</li>)}</ul>

      <div className="mt-5 rounded-xl bg-raised p-3">
        <div className="flex items-center justify-between text-xs"><span className="text-fg2">Budget used</span><span className="font-mono">{inr(c.spent_inr)} / {inr(c.budget_inr)}</span></div>
        <div className="mt-2 h-1.5 rounded-full bg-card"><div className="h-1.5 rounded-full" style={{ width: `${Math.min(used * 100, 100)}%`, background: used > 0.9 ? "var(--warn)" : "var(--fg2)" }} /></div>
        <div className="mt-2 flex justify-between meta"><span>{STATUS.find((s) => s.value === c.status)?.label}</span><span>{c.hours_per_week} team hrs a week</span></div>
      </div>

      {editing && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-fg3">Status<Select value={f.status} onChange={(v) => setF({ ...f, status: v })} options={STATUS} /></label>
          <label className="flex flex-col gap-1.5 text-xs text-fg3">Team hours a week<input className="input font-mono" type="number" value={f.hours_per_week} onChange={(e) => setF({ ...f, hours_per_week: e.target.value })} /></label>
          <label className="flex flex-col gap-1.5 text-xs text-fg3">Budget<input className="input font-mono" type="number" value={f.budget_inr} onChange={(e) => setF({ ...f, budget_inr: e.target.value })} /></label>
          <label className="flex flex-col gap-1.5 text-xs text-fg3">Spent<input className="input font-mono" type="number" value={f.spent_inr} onChange={(e) => setF({ ...f, spent_inr: e.target.value })} /></label>
        </div>
      )}
      <div className="mt-auto flex gap-2 pt-5">
        {editing ? (<><button className="btn btn-primary" onClick={save}>Save</button><button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button></>)
          : <button className="btn btn-ghost" onClick={() => setEditing(true)}><Pencil size={14} strokeWidth={1.5} />Edit plan</button>}
        <button className="btn btn-quiet ml-auto" onClick={() => openCopilot(`Diagnose ${c.campaign_name}: where does its funnel leak versus the other campaigns, and what should we change?`)}><Stethoscope size={14} strokeWidth={1.5} />Diagnose</button>
      </div>
    </div>
  );
}
