"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Check, X, Database, RotateCcw } from "lucide-react";
import { useApp } from "./AppShell";

type Proposal = { id: string; type: string; payload: Record<string, unknown>; rationale: string; state?: "pending" | "done" | "dismissed" | "error"; result?: string };
type Msg = { role: "user" | "model"; text: string; trace?: { tool: string; args: unknown; ok: boolean; summary: string }[]; proposals?: Proposal[]; asOf?: string };

const STARTERS = [
  "Are we on track for our sponsorship targets? What's the biggest gap?",
  "Which campaigns should we scale, fix or stop, and why?",
  "Which open deals are stalled and who owns them?",
  "How much cash have we actually collected from sponsors?",
  "What changed between 1 March and 1 April?",
];
const KEY = "copilot-thread-v1";
const LABEL: Record<string, string> = { create_task: "Create task", update_task: "Update task", update_campaign: "Update campaign", update_opportunity: "Move deal", log_payment: "Log cash receipt" };

export default function Copilot({ onClose, seedPrompt }: { onClose: () => void; seedPrompt?: string }) {
  const { refresh, asOf } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { try { const s = localStorage.getItem(KEY); if (s) setMsgs(JSON.parse(s)); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))); } catch {} end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => { if (seedPrompt) send(seedPrompt.split("␟")[0]); }, [seedPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const history = next.slice(-16).map((m) => ({ role: m.role, text: m.text + (m.proposals?.length ? `\n[proposals: ${m.proposals.map((p) => `${p.type} → ${p.state ?? "pending"}`).join("; ")}]` : "") }));
      const r = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ messages: history }) }).then((r) => r.json());
      if (r.error) throw new Error(r.error);
      setMsgs([...next, { role: "model", text: r.text || "No answer", trace: r.trace, proposals: r.proposals?.map((p: Proposal) => ({ ...p, state: "pending" })), asOf: r.as_of }]);
    } catch (e) {
      setMsgs([...next, { role: "model", text: `**Couldn't answer.** ${(e as Error).message}` }]);
    } finally { setBusy(false); }
  }

  async function decide(mi: number, pid: string, ok: boolean) {
    const p = msgs[mi].proposals!.find((x) => x.id === pid)!;
    let patch: Partial<Proposal> = { state: "dismissed" };
    if (ok) {
      const r = await fetch("/api/actions", { method: "POST", body: JSON.stringify({ type: p.type, payload: p.payload }) }).then((r) => r.json());
      patch = r.error ? { state: "error", result: r.error } : { state: "done" };
      if (!r.error) await refresh();
    }
    setMsgs((all) => all.map((x, i) => (i !== mi ? x : { ...x, proposals: x.proposals!.map((y) => (y.id === pid ? { ...y, ...patch } : y)) })));
  }

  return (
    <aside className="w-full sm:w-[400px] shrink-0 border-l border-line bg-card flex flex-col">
      <div className="flex h-14 items-center justify-between border-b border-line px-4">
        <div>
          <div className="text-sm font-medium">Analyst</div>
          <div className="meta">Reads the live desk data as of {asOf}</div>
        </div>
        <div className="flex gap-1">
          <button className="btn px-2 text-fg3 hover:text-fg" title="New chat" onClick={() => setMsgs([])}><RotateCcw size={16} strokeWidth={1.5} /></button>
          <button className="btn px-2 text-fg3 hover:text-fg" title="Close" onClick={onClose}><X size={16} strokeWidth={1.5} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {!msgs.length && (
          <div>
            <p className="text-[13px] leading-5 text-fg2">Ask about the numbers on this desk. Every answer is computed from the current data, so change something and ask again.</p>
            <div className="mt-4 space-y-1">
              {STARTERS.map((s) => <button key={s} onClick={() => send(s)} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] text-fg2 hover:bg-raised hover:text-fg transition-colors">{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            {m.role === "user" ? (
              <div className="max-w-[85%] rounded-xl bg-raised border border-line px-3 py-2 text-[13.5px] leading-5 whitespace-pre-wrap">{m.text}</div>
            ) : (
              <div className="space-y-3">
                <div className="prose-chat"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown></div>
                {m.proposals?.map((p) => (
                  /* Signature: a ticket stub. Nothing is saved until someone tears it */
                  <div key={p.id} className="perf rounded-xl bg-bg border border-line" style={{ ["--perf-bg" as string]: "var(--card)", ["--perf-y" as string]: "44px" }}>
                    <div className="flex h-11 items-center justify-between px-4">
                      <span className="text-[13px] font-medium">{LABEL[p.type] ?? p.type}</span>
                      <span className="meta">Needs your OK</span>
                    </div>
                    <div className="border-t border-dashed border-line-strong px-4 py-3">
                      <p className="text-[13px] leading-5 text-fg2">{p.rationale}</p>
                      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
                        {Object.entries(p.payload).flatMap(([k, v]) => [<dt key={`k${k}`} className="text-fg3">{k.replace(/_/g, " ")}</dt>, <dd key={`v${k}`} className="text-fg truncate">{typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}</dd>])}
                      </dl>
                      {p.state === "pending" ? (
                        <div className="mt-4 flex gap-2">
                          <button className="btn btn-accent" onClick={() => decide(i, p.id, true)}><Check size={16} strokeWidth={1.5} />Confirm</button>
                          <button className="btn btn-ghost" onClick={() => decide(i, p.id, false)}>Dismiss</button>
                        </div>
                      ) : <div className={`mt-4 font-mono text-xs ${p.state === "done" ? "text-pos" : p.state === "error" ? "text-neg" : "text-fg3"}`}>{p.state === "done" ? "Saved, desk updated" : p.state === "error" ? `Error: ${p.result}` : "Dismissed"}</div>}
                    </div>
                  </div>
                ))}
                {!!m.trace?.length && (
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-2 meta hover:text-fg2 transition-colors"><Database size={14} strokeWidth={1.5} />{m.trace.length} data {m.trace.length > 1 ? "calls" : "call"}{m.asOf ? ` · as of ${m.asOf}` : ""}</summary>
                    <ul className="mt-2 space-y-1.5 border-l border-line pl-3">{m.trace.map((t, j) => <li key={j} className="font-mono text-[11px] leading-4 text-fg3 break-all"><span className={t.ok ? "text-fg2" : "text-neg"}>{t.tool}</span> {JSON.stringify(t.args)}</li>)}</ul>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && <Thinking />}
        <div ref={end} />
      </div>
      <form className="border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-bg p-1.5 pl-3 focus-within:border-line-strong transition-colors">
          <input className="flex-1 bg-transparent text-[13.5px] placeholder:text-fg3 focus:outline-none" placeholder="Ask" value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn btn-primary h-7 w-7 justify-center px-0" disabled={busy || !input.trim()} aria-label="Send"><ArrowUp size={16} strokeWidth={1.5} /></button>
        </div>
      </form>
    </aside>
  );
}

const STEPS = ["Thinking", "Reading the question", "Pulling the snapshot", "Checking the pipeline", "Querying the database", "Crunching the numbers", "Cross-checking figures", "Writing the answer"];
function Thinking() {
  const [t, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT((x) => x + 1), 1000); return () => clearInterval(id); }, []);
  const i = Math.min(Math.floor(t / 2), STEPS.length - 1);
  return (
    <div className="rounded-xl border border-line bg-bg p-3" aria-live="polite">
      <div className="flex items-center gap-2 text-[13px] text-fg">
        <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" /></span>
        <span key={i} className="font-medium">{STEPS[i]}…</span>
        <span className="ml-auto meta tabular-nums">{t}s</span>
      </div>
      <ul className="mt-2 space-y-1 border-l border-line pl-3">
        {STEPS.slice(0, i).slice(-3).map((s) => <li key={s} className="meta">✓ {s}</li>)}
      </ul>
    </div>
  );
}
