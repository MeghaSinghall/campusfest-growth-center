"use client";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, CircleAlert, Clock3, Banknote } from "lucide-react";
import { useApp } from "@/components/AppShell";
import { inr, lakh, pct, ACTION_DOT, ACTION_LABEL, CHANNEL_COLOR } from "@/lib/fmt";

const fmtDate = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/* Moment 1: a printed sponsor pass. Its barcode is the confirmed deals themselves, one bar per deal, width by value */
function SponsorPass() {
  const { snap } = useApp();
  if (!snap) return null;
  const f = snap.forecast, t = snap.targets;
  const deals = snap.opportunities.filter((o) => o.stage === "partner_confirmed").sort((a, b) => a.last_change.localeCompare(b.last_change));
  const max = Math.max(...deals.map((d) => d.confirmed_value_inr), 1);
  const collectedShare = f.confirmed_cash_value_inr ? f.cash_collected_inr / f.confirmed_cash_value_inr : 0;
  return (
    <div className="rise relative" style={{ ["--perf-bg" as string]: "var(--bg)" }}>
      <div className="perf grid h-full grid-cols-[1fr_auto] overflow-visible rounded-2xl " style={{ ["--perf-y" as string]: "50%", background: "var(--pass-bg)", color: "var(--pass-ink)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), var(--shadow-float)" }}>
        <div className="p-6 pr-8 min-w-0 flex flex-col">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[color:var(--pass-ink2)]">Cash collected before doors open</span>
            <span className="font-mono text-xs text-[color:var(--pass-ink2)]">Pass 2025 · Mumbai</span>
          </div>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[56px] leading-none whitespace-nowrap font-medium tracking-[-0.03em] tabular">{lakh(f.cash_collected_inr)}</span>
            <span className="text-[15px] text-[color:var(--pass-ink2)]">of {lakh(f.confirmed_cash_value_inr)} confirmed cash</span>
          </div>
          <div className="mt-auto pt-6"><div className="h-2 rounded-full bg-[color:var(--pass-ink)]/15 overflow-hidden">
            <div className="h-full rounded-full bg-[color:var(--pass-ink)] transition-[width] duration-500" style={{ width: `${Math.max(collectedShare * 100, 0.8)}%` }} />
          </div></div>
          <div className="mt-3 grid grid-cols-3 gap-4 font-mono text-xs text-[color:var(--pass-ink2)]">
            <div><div className="text-[color:var(--pass-ink2)]">Outstanding</div><div className="mt-1 text-[13px] text-[color:var(--pass-ink)]">{inr(f.cash_outstanding_inr)}</div></div>
            <div><div className="text-[color:var(--pass-ink2)]">Projected</div><div className="mt-1 text-[13px] text-[color:var(--pass-ink)]">{inr(f.projected_cash_collected_inr)}</div></div>
            <div><div className="text-[color:var(--pass-ink2)]">Receipts</div><div className="mt-1 text-[13px] text-[color:var(--pass-ink)]">logged in app only</div></div>
          </div>
        </div>
        <div className="w-[232px] border-l border-dashed border-[color:var(--pass-ink)]/30 p-6 flex flex-col">
          <div className="flex items-center justify-between font-mono text-xs text-[color:var(--pass-ink2)]"><span>Admit</span><span>{deals.length} sponsors</span></div>
          <div className="mt-3 flex h-[72px] items-end gap-[2px]" aria-label="One bar per confirmed deal, width by value">
            {deals.map((d) => (
              <div key={d.opportunity_id} title={`${d.brand_name} · ${inr(d.confirmed_value_inr)}`} className="h-full bg-[color:var(--pass-ink)]" style={{ width: `${2 + (d.confirmed_value_inr / max) * 7}px`, opacity: d.support_type === "in_kind" ? 0.35 : 1 }} />
            ))}
          </div>
          <div className="mt-2 font-mono text-[11px] text-[color:var(--pass-ink2)] truncate">{deals.map((d) => d.opportunity_id).join(" ")}</div>
          <div className="mt-auto pt-4 flex items-end justify-between">
            <div><div className="text-[13px] text-[color:var(--pass-ink2)]">Confirmed</div><div className="text-2xl font-medium tabular">{lakh(f.confirmed_value_inr)}</div></div>
            <div className="rounded-md border-2 border-[color:var(--pass-stamp)] px-2 py-1 font-mono text-[11px] text-[color:var(--pass-stamp)] -rotate-6">{t.confirmed_partnerships_actual}/{t.confirmed_partnerships_goal}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, delta, tone }: { label: string; value: string; delta: string; tone?: "pos" | "neg" | "warn" }) {
  const c = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : tone === "warn" ? "text-warn" : "text-fg3";
  return (
    <div className="card rise p-5 flex flex-col justify-between">
      <div className="label">{label}</div>
      <div className="mt-3 flex items-baseline justify-between gap-3"><span className="text-[30px] leading-none font-medium tabular">{value}</span><span className={`font-mono text-xs text-right ${c}`}>{delta}</span></div>
    </div>
  );
}

export default function Overview() {
  const { snap, openCopilot } = useApp();
  if (!snap) return null;
  const { targets: t, forecast: f } = snap;
  const warm = ["SC02", "SC05", "SC04"], cold = ["SC01", "SC03", "SC06"];
  const name = (id: string) => snap.campaigns.find((c) => c.sponsor_campaign_id === id)?.campaign_name ?? id;
  const dealGap = t.confirmed_partnerships_goal - t.confirmed_partnerships_actual;
  const ranked = [...snap.campaigns].sort((a, b) => b.confirmed_value_inr - a.confirmed_value_inr);
  const maxVal = Math.max(...ranked.map((c) => c.confirmed_value_inr), 1);
  const alerts = [
    ...snap.campaigns.filter((c) => c.recommendation.action === "stop").map((c) => ({ icon: CircleAlert, tone: "text-neg", text: `${c.campaign_name}: ${c.confirmed} of ${c.opportunities} deals won`, ask: `Should we stop ${c.campaign_name}? Show the evidence.` })),
    ...(snap.stalled.length ? [{ icon: Clock3, tone: "text-warn", text: `${snap.stalled.length} open deals untouched for 14+ days, ${lakh(snap.stalled.reduce((a, o) => a + o.proposed_value_inr, 0))} face value`, ask: "List the stalled deals by value and suggest follow-up tasks." }] : []),
    ...(f.cash_outstanding_inr > 0 ? [{ icon: Banknote, tone: "text-warn", text: `${inr(f.cash_outstanding_inr)} confirmed but not received`, ask: "How much confirmed sponsor cash is still uncollected, and from whom?" }] : []),
  ];

  return (
    <div className="@container space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-tight font-medium tracking-[-0.01em]">CampusFest 2025 <span className="text-fg3">{fmtDate(snap.as_of)}</span></h1>
          <p className="mt-1 text-sm text-fg2">Plan in force: {t.version}, {t.confirmed_partnerships_goal} sponsors and {t.qualified_brands_goal} qualified brands</p>
        </div>
        <button className="btn btn-ghost" onClick={() => openCopilot("Give me a 5-bullet status briefing for today's standup with the top 2 actions.")}>Standup brief</button>
      </div>

      <div className="grid gap-4 @5xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <SponsorPass />
        <div className="grid gap-4 @xl:grid-cols-3 @5xl:grid-cols-1">
        <Stat label="Sponsors confirmed" value={`${t.confirmed_partnerships_actual}`} delta={dealGap > 0 ? `${dealGap} short of ${t.confirmed_partnerships_goal}` : `${-dealGap} over target of ${t.confirmed_partnerships_goal}`} tone={dealGap > 0 ? "warn" : "pos"} />
        <Stat label="Projected value" value={lakh(f.projected_value_inr)} delta={`${pct(f.projected_value_inr / t.confirmed_value_goal_inr)} of ₹${t.confirmed_value_goal_inr / 100000}L goal`} />
        <Stat label="Qualified brands" value={`${t.qualified_brands_actual}`} delta={`${t.qualified_brands_actual - t.qualified_brands_goal >= 0 ? "+" : ""}${t.qualified_brands_actual - t.qualified_brands_goal} vs goal of ${t.qualified_brands_goal}`} tone={t.qualified_brands_actual >= t.qualified_brands_goal ? "pos" : "warn"} />
        </div>
      </div>

      <div className="grid gap-4 @3xl:grid-cols-3">
        {/* Moment 2: the main chart, one colour per warm channel, cold channels stay grey */}
        <div className="card p-6 @3xl:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="label">Confirmed value by source</div>
              <div className="mt-2 text-[30px] leading-none font-medium tabular">{lakh(f.confirmed_value_inr)}</div>
              <div className="mt-2 font-mono text-xs text-fg3">{pct(f.confirmed_value_inr / t.confirmed_value_goal_inr)} of ₹{t.confirmed_value_goal_inr / 100000}L goal, goal is an assumption</div>
            </div>
            <div className="flex flex-col gap-1.5">
              {warm.map((id) => <span key={id} className="chip"><span className="dot" style={{ background: CHANNEL_COLOR[id] }} />{name(id)}</span>)}
              <span className="chip"><span className="dot bg-[color:var(--chart-muted)]" />Cold channels</span>
            </div>
          </div>
          <div className="mt-6 h-[320px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={snap.weekly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  {warm.map((id) => (
                    <linearGradient key={id} id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHANNEL_COLOR[id]} stopOpacity={0.35} /><stop offset="100%" stopColor={CHANNEL_COLOR[id]} stopOpacity={0.04} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="week_start" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: "var(--fg3)", fontFamily: "var(--font-geist-mono)" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${v / 100000}L`} tick={{ fontSize: 11, fill: "var(--fg3)", fontFamily: "var(--font-geist-mono)" }} axisLine={false} tickLine={false} width={40} domain={[0, (dm: number) => Math.max(dm, t.confirmed_value_goal_inr * 1.05)]} />
                <Tooltip cursor={{ stroke: "var(--line-strong)" }} contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12, boxShadow: "var(--shadow-float)" }} labelFormatter={(l) => `Week of ${fmtDate(String(l))}`} formatter={(v, n) => [inr(Number(v)), name(String(n).replace("v_", ""))]} />
                <ReferenceLine y={t.confirmed_value_goal_inr} stroke="var(--fg3)" strokeDasharray="4 4" label={{ value: "Goal", position: "insideTopRight", fill: "var(--fg3)", fontSize: 11 }} />
                {[...cold, ...warm].map((id) => (
                  <Area key={id} type="monotone" dataKey={`v_${id}`} stackId="1" stroke={warm.includes(id) ? CHANNEL_COLOR[id] : "var(--chart-muted)"} strokeWidth={warm.includes(id) ? 2 : 1} fill={warm.includes(id) ? `url(#g${id})` : "transparent"} animationDuration={600} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6 flex flex-col">
          <div className="label">Where the money came from</div>
          <ol className="mt-4 space-y-4">
            {ranked.map((c) => (
              <li key={c.sponsor_campaign_id}>
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate">{c.campaign_name}</span>
                  <span className="font-mono tabular">{lakh(c.confirmed_value_inr)}</span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-raised"><div className="h-1 rounded-full" style={{ width: `${(c.confirmed_value_inr / maxVal) * 100}%`, background: warm.includes(c.sponsor_campaign_id) ? CHANNEL_COLOR[c.sponsor_campaign_id] : "var(--chart-muted)" }} /></div>
                <div className="mt-1 font-mono text-xs text-fg3">{c.confirmed} won · {c.lost_or_withdrawn} lost · {c.open_opportunities} open</div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="card p-6">
          <div className="label">Funnel</div>
          <ol className="mt-4 space-y-3">
            {snap.funnel.map((s) => (
              <li key={s.stage} className="grid grid-cols-[1fr_auto_48px] items-center gap-3 text-[13px]">
                <div className="min-w-0">
                  <div className="truncate text-fg2">{s.stage.replace(" (latest status)", "").replace(" (meeting held)", "")}</div>
                  <div className="mt-1 h-1 rounded-full bg-raised"><div className="h-1 rounded-full bg-fg2" style={{ width: `${(s.count / snap.funnel[0].count) * 100}%` }} /></div>
                </div>
                <span className="font-mono tabular">{s.count}</span>
                <span className="font-mono text-xs text-fg3 text-right">{s.conv_from_prev == null ? "" : pct(s.conv_from_prev)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="card p-6">
          <div className="label">Needs a decision</div>
          <ul className="mt-4 divide-y divide-line">
            {alerts.map((a, i) => (
              <li key={i}>
                <button onClick={() => openCopilot(a.ask)} className="group flex w-full items-start gap-3 py-3 text-left text-[13px]">
                  <a.icon size={16} strokeWidth={1.5} className={`mt-0.5 shrink-0 ${a.tone}`} />
                  <span className="flex-1 text-fg2 group-hover:text-fg transition-colors">{a.text}</span>
                  <ArrowUpRight size={16} strokeWidth={1.5} className="text-fg3 group-hover:text-fg transition-colors" />
                </button>
              </li>
            ))}
            {!alerts.length && <li className="py-3 text-[13px] text-fg3">Nothing flagged at this date</li>}
          </ul>
        </div>

        <div className="card p-6">
          <div className="label">Owners</div>
          <table className="mt-2 w-full">
            <thead><tr><th className="th pl-0">Name</th><th className="th text-right">Open</th><th className="th text-right">Stalled</th><th className="th pr-0 text-right">Won</th></tr></thead>
            <tbody>{snap.owners.map((o) => (
              <tr key={o.owner_name}><td className="td pl-0">{o.owner_name}</td><td className="td text-right font-mono">{o.open}</td><td className={`td text-right font-mono ${o.stalled ? "text-warn" : "text-fg3"}`}>{o.stalled}</td><td className="td pr-0 text-right font-mono">{lakh(o.confirmed_value_inr)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-baseline justify-between"><div className="label">Campaign signals</div><span className="meta">Rules from Assumptions and data</span></div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full">
            <thead><tr>{["Campaign", "Owner", "Won / deals", "Win rate", "Confirmed", "Weighted pipeline", "Cost per deal", "Signal"].map((h, i) => <th key={h} className={`th ${i > 1 ? "text-right" : ""} ${i === 0 ? "pl-0" : ""} ${i === 7 ? "pr-0" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>{ranked.map((c) => (
              <tr key={c.sponsor_campaign_id} className="hover:bg-raised/40 transition-colors">
                <td className="td pl-0">{c.campaign_name}</td><td className="td text-fg2">{c.owner_name}</td>
                <td className="td text-right font-mono">{c.confirmed}/{c.opportunities}</td><td className="td text-right font-mono">{pct(c.win_rate)}</td>
                <td className="td text-right font-mono">{lakh(c.confirmed_value_inr)}</td><td className="td text-right font-mono">{lakh(c.weighted_pipeline_inr)}</td>
                <td className="td text-right font-mono">{inr(c.cost_per_confirmed_inr)}</td>
                <td className="td pr-0 text-right" title={c.recommendation.reasons.join(" ")}><span className="chip justify-end"><span className={`dot ${ACTION_DOT[c.recommendation.action]}`} />{ACTION_LABEL[c.recommendation.action]}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <p className="meta leading-5">Not in the data: {snap.data_gaps.map((g) => g.replace(/\.$/, "")).join(" · ")}</p>
    </div>
  );
}
