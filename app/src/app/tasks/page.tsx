"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, GripVertical, Trash2, CalendarDays, Link2, Sparkles, X } from "lucide-react";
import { useApp } from "@/components/AppShell";
import { Select, DatePicker, prettyDate, Donut, Legend } from "@/components/ui";
import { OWNERS, AVATAR } from "@/lib/fmt";

type Task = { id: number; title: string; description: string | null; owner_name: string | null; due_date: string | null; status: string; priority: string; sponsor_campaign_id: string | null; campaign_name: string | null; opportunity_id: string | null; opportunity_name: string | null; created_by: string };
const COLS: { key: string; label: string; color: string }[] = [
  { key: "todo", label: "To do", color: "#a7b8ad" }, { key: "in_progress", label: "In progress", color: "#2f6fde" },
  { key: "blocked", label: "Blocked", color: "#dc4a4a" }, { key: "done", label: "Done", color: "#16a34a" },
];
const PRI = [{ value: "high", label: "High", dot: "var(--neg)" }, { value: "medium", label: "Medium", dot: "var(--warn)" }, { value: "low", label: "Low", dot: "var(--fg3)" }];
const initials = (n?: string | null) => (n ?? "?").split(" ").map((p) => p[0]).join("").slice(0, 2);

export default function Tasks() {
  const { snap, version, asOf, openCopilot } = useApp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [owner, setOwner] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", owner_name: OWNERS[0], due_date: "", priority: "medium", sponsor_campaign_id: "" });
  const load = useCallback(() => fetch("/api/tasks", { cache: "no-store" }).then((r) => r.json()).then(setTasks), []);
  useEffect(() => { load(); }, [load, version]);

  const patch = async (id: number, body: Partial<Task>) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...body } : t))); // optimistic
    await fetch(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }); load();
  };
  const del = async (id: number) => { if (confirm("Delete this task?")) { await fetch(`/api/tasks/${id}`, { method: "DELETE" }); load(); } };
  const add = async () => {
    if (!form.title.trim()) return;
    const r = await fetch("/api/tasks", { method: "POST", body: JSON.stringify(form) }).then((r) => r.json());
    if (r.error) return alert(r.error);
    setForm({ ...form, title: "", description: "" }); setAdding(false); load();
  };
  const shown = tasks.filter((t) => !owner || t.owner_name === owner);
  const overdue = (t: Task) => t.status !== "done" && !!t.due_date && String(t.due_date).slice(0, 10) < asOf;
  const ownerLoad = useMemo(() => OWNERS.map((o) => ({ label: o, value: tasks.filter((t) => t.owner_name === o && t.status !== "done").length, color: AVATAR[o] })), [tasks]);
  const campOpts = [{ value: "", label: "No campaign" }, ...(snap?.campaigns.map((c) => ({ value: c.sponsor_campaign_id, label: c.campaign_name })) ?? [])];
  const open = tasks.filter((t) => t.status !== "done").length;
  const nOverdue = tasks.filter(overdue).length;

  return (
    <div className="@container space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-tight font-medium">Execution board</h1>
          <p className="mt-1 text-sm text-fg2">Drag cards between columns to change status. Overdue is measured against the snapshot date</p>
        </div>
        <div className="flex gap-2">
          <Select value={owner} onChange={setOwner} options={[{ value: "", label: "All owners" }, ...OWNERS.map((o) => ({ value: o, label: o, dot: AVATAR[o] }))]} className="w-44" />
          <button className="btn btn-ghost" onClick={() => openCopilot("Look at open tasks and pipeline. Which tasks are missing for our highest-value open deals? Propose them.")}><Sparkles size={16} strokeWidth={1.5} />Suggest tasks</button>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} strokeWidth={1.5} />New task</button>
        </div>
      </div>

      <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="card p-5 flex items-center gap-6">
          <div><div className="label">Open tasks</div><div className="mt-2 text-[30px] leading-none font-medium tabular">{open}</div><div className="mt-2 meta">{tasks.length - open} done</div></div>
          <div className="ml-auto"><div className="label">Overdue</div><div className={`mt-2 text-[30px] leading-none font-medium tabular ${nOverdue ? "text-neg" : ""}`}>{nOverdue}</div><div className="mt-2 meta">{tasks.filter((t) => t.created_by === "copilot").length} from analyst</div></div>
        </div>
        <div className="card p-5">
          <div className="label">Status mix</div>
          <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-raised">
            {COLS.map((c) => { const n = tasks.filter((t) => t.status === c.key).length; return n ? <div key={c.key} className="transition-[width] duration-300" style={{ width: `${(n / Math.max(tasks.length, 1)) * 100}%`, background: c.color }} title={`${c.label} ${n}`} /> : null; })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">{COLS.map((c) => <span key={c.key} className="chip"><span className="dot" style={{ background: c.color }} />{c.label}<span className="ml-auto font-mono">{tasks.filter((t) => t.status === c.key).length}</span></span>)}</div>
        </div>
        <div className="card p-5 flex items-center gap-5">
          <Donut data={ownerLoad.filter((o) => o.value)} size={104} thickness={12} center={String(open)} sub="open" />
          <div className="flex-1 min-w-0"><div className="label mb-2">Open tasks by owner</div><Legend items={ownerLoad.map((o) => ({ label: o.label, color: o.color, value: String(o.value) }))} /></div>
        </div>
      </div>

      {adding && (
        <div className="card rise p-5">
          <div className="flex items-center justify-between"><div className="text-[15px] font-medium">New task</div><button className="btn btn-quiet px-2" onClick={() => setAdding(false)} aria-label="Close"><X size={16} strokeWidth={1.5} /></button></div>
          <input autoFocus className="input mt-3 h-10 w-full text-[15px]" placeholder="What needs to happen" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
          <textarea className="input mt-2 w-full" rows={2} placeholder="Details" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select value={form.owner_name} onChange={(v) => setForm({ ...form, owner_name: v })} options={OWNERS.map((o) => ({ value: o, label: o, dot: AVATAR[o] }))} className="w-40" />
            <DatePicker value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} placeholder="Due date" className="w-40" clearable />
            <Select value={form.priority} onChange={(v) => setForm({ ...form, priority: v })} options={PRI} className="w-32" />
            <Select value={form.sponsor_campaign_id} onChange={(v) => setForm({ ...form, sponsor_campaign_id: v })} options={campOpts} className="w-56" />
            <button className="btn btn-primary ml-auto" onClick={add} disabled={!form.title.trim()}>Add task</button>
          </div>
        </div>
      )}

      <div className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-4">
        {COLS.map((col) => {
          const items = shown.filter((t) => t.status === col.key);
          const isOver = over === col.key;
          return (
            <section key={col.key}
              onDragOver={(e) => { e.preventDefault(); setOver(col.key); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
              onDrop={(e) => { e.preventDefault(); const id = Number(e.dataTransfer.getData("text/plain")); setOver(null); setDragId(null); const t = tasks.find((x) => x.id === id); if (t && t.status !== col.key) patch(id, { status: col.key }); }}
              className={`flex min-h-[420px] flex-col rounded-2xl border p-2 transition-colors ${isOver ? "border-accent bg-accent-soft" : "border-line bg-raised/60"}`}>
              <header className="flex h-9 items-center gap-2 px-2">
                <span className="dot" style={{ background: col.color }} />
                <span className="text-[13px] font-medium">{col.label}</span>
                <span className="meta">{items.length}</span>
                {col.key === "todo" && <button className="btn btn-quiet ml-auto h-7 w-7 justify-center px-0" onClick={() => setAdding(true)} aria-label="Add task"><Plus size={14} strokeWidth={1.5} /></button>}
              </header>
              <div className="flex-1 space-y-2">
                {items.map((t) => (
                  <article key={t.id} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(t.id)); e.dataTransfer.effectAllowed = "move"; setDragId(t.id); }} onDragEnd={() => { setDragId(null); setOver(null); }}
                    className={`group rounded-xl border bg-card p-3 cursor-grab active:cursor-grabbing transition-[opacity,border-color] ${dragId === t.id ? "opacity-40" : ""} ${overdue(t) ? "border-neg/40" : "border-line hover:border-line-strong"}`}
                    style={{ boxShadow: "var(--shadow)" }}>
                    <div className="flex items-start gap-1.5">
                      <GripVertical size={14} strokeWidth={1.5} className="mt-0.5 -ml-1 shrink-0 text-fg3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="flex-1 text-[13.5px] leading-5 font-medium">{t.title}</div>
                      <button className="shrink-0 text-fg3 opacity-0 group-hover:opacity-100 hover:text-neg transition-[opacity,color]" onClick={() => del(t.id)} aria-label="Delete task"><Trash2 size={14} strokeWidth={1.5} /></button>
                    </div>
                    {t.description && <p className="mt-1 text-xs leading-[18px] text-fg2 line-clamp-2">{t.description}</p>}
                    {(t.campaign_name || t.opportunity_name) && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-fg3"><Link2 size={12} strokeWidth={1.5} /><span className="truncate">{t.opportunity_name?.replace(" festival partnership", "") ?? t.campaign_name}</span></div>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <Select size="sm" value={t.priority} onChange={(v) => patch(t.id, { priority: v })} options={PRI} className="w-[104px]" />
                      <span className={`ml-auto flex items-center gap-1 whitespace-nowrap font-mono text-xs ${overdue(t) ? "text-neg" : "text-fg3"}`}><CalendarDays size={12} strokeWidth={1.5} />{t.due_date ? prettyDate(t.due_date).replace(/ \d{4}$/, "") : "No date"}</span>
                      <OwnerBadge name={t.owner_name} onChange={(v) => patch(t.id, { owner_name: v })} />
                    </div>
                    {t.created_by === "copilot" && <div className="mt-2 flex items-center gap-1 text-[11px] text-accent"><Sparkles size={11} strokeWidth={1.5} />Created by analyst</div>}
                  </article>
                ))}
                {!items.length && <div className={`flex h-24 items-center justify-center rounded-xl border border-dashed text-xs ${isOver ? "border-accent text-accent" : "border-line-strong text-fg3"}`}>Drop here</div>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function OwnerBadge({ name, onChange }: { name: string | null; onChange: (v: string) => void }) {
  const i = OWNERS.indexOf(name ?? "");
  return (
    <button title={`${name ?? "Unassigned"}, click to reassign`} onClick={() => onChange(OWNERS[(i + 1) % OWNERS.length])}
      className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-medium text-white" style={{ background: AVATAR[name ?? ""] ?? "var(--fg3)" }}>
      {initials(name)}
    </button>
  );
}
