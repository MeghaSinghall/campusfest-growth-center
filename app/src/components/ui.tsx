"use client";
/* Hand-built form controls: Select, DatePicker, Donut. No external UI library. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

/* ---------- Popover positioning ---------- */
function usePopover(open: boolean, setOpen: (v: boolean) => void) {
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; minWidth: number; up: boolean }>({ top: -9999, left: 0, minWidth: 0, up: false });
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const r = anchor.current!.getBoundingClientRect();
      const h = panel.current?.offsetHeight ?? 280;
      const w = panel.current?.offsetWidth ?? r.width;
      const up = r.bottom + h + 8 > window.innerHeight && r.top - h - 8 > 0;
      setPos(up ? { bottom: window.innerHeight - r.top + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), minWidth: r.width, up } : { top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), minWidth: r.width, up });
    };
    place();
    const raf = requestAnimationFrame(place); // re-place once the panel has its real size
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); anchor.current?.focus(); } };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, setOpen]);
  return { anchor, panel, pos };
}

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

/* ---------- Select ---------- */
export type Option = { value: string; label: string; dot?: string; hint?: string };
export function Select({ value, onChange, options, placeholder = "Select", className = "", size = "md", label }: {
  value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string; className?: string; size?: "sm" | "md"; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const { anchor, panel, pos } = usePopover(open, setOpen);
  const current = options.find((o) => o.value === value);
  useEffect(() => { if (open) setHi(Math.max(0, options.findIndex((o) => o.value === value))); }, [open, options, value]);
  const pick = (v: string) => { onChange(v); setOpen(false); anchor.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open && ["ArrowDown", "Enter", " "].includes(e.key)) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(options.length - 1, h + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    if (e.key === "Enter") { e.preventDefault(); pick(options[hi].value); }
  };
  return (
    <>
      <button ref={anchor} type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onKeyDown={onKey} onClick={() => setOpen((o) => !o)}
        className={`input inline-flex items-center gap-2 text-left ${size === "sm" ? "h-7 text-xs" : ""} ${open ? "border-accent" : ""} ${className}`}>
        {current?.dot && <span className="dot" style={{ background: current.dot }} />}
        <span className={`flex-1 truncate ${current ? "" : "text-fg3"}`}>{current?.label ?? placeholder}</span>
        <ChevronDown size={14} strokeWidth={1.5} className={`shrink-0 text-fg3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <Portal>
          <div ref={panel} role="listbox" className="pop fixed z-[100] max-h-72 overflow-y-auto rounded-xl border border-line bg-card p-1" style={{ top: pos.top, bottom: pos.bottom, left: pos.left, minWidth: Math.max(pos.minWidth, 160), boxShadow: "var(--shadow-float)", transformOrigin: pos.up ? "bottom" : "top" }}>
            {options.map((o, i) => (
              <button key={o.value} type="button" role="option" aria-selected={o.value === value} onMouseEnter={() => setHi(i)} onClick={() => pick(o.value)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${i === hi ? "bg-raised" : ""}`}>
                {o.dot ? <span className="dot" style={{ background: o.dot }} /> : null}
                <span className="flex-1 whitespace-nowrap">{o.label}</span>
                {o.hint && <span className="meta">{o.hint}</span>}
                <Check size={14} strokeWidth={1.75} className={o.value === value ? "text-accent" : "invisible"} />
              </button>
            ))}
          </div>
        </Portal>
      )}
    </>
  );
}

/* ---------- DatePicker (ISO yyyy-mm-dd) ---------- */
const WD = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s?: string | null) => (s ? new Date(`${s.slice(0, 10)}T00:00:00`) : null);
export const prettyDate = (s?: string | null) => { const d = parse(s); return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""; };

export function DatePicker({ value, onChange, min, max, placeholder = "Pick a date", className = "", size = "md", marks, clearable }: {
  value: string; onChange: (v: string) => void; min?: string; max?: string; placeholder?: string; className?: string; size?: "sm" | "md";
  marks?: Record<string, string>; clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { anchor, panel, pos } = usePopover(open, setOpen);
  const sel = parse(value);
  const [view, setView] = useState(() => sel ?? parse(max) ?? new Date());
  useEffect(() => { if (open) setView(sel ?? parse(max) ?? new Date()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [view]);
  const lo = parse(min), hi = parse(max);
  const disabled = (d: Date) => (lo && d < lo) || (hi && d > hi);
  const shift = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));
  const today = iso(new Date());
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen((o) => !o)} className={`input inline-flex items-center gap-2 ${size === "sm" ? "h-7 text-xs" : ""} ${open ? "border-accent" : ""} ${className}`}>
        <CalendarDays size={14} strokeWidth={1.5} className="text-fg3 shrink-0" />
        <span className={`flex-1 text-left font-mono tabular whitespace-nowrap ${value ? "" : "text-fg3 font-sans"}`}>{value ? prettyDate(value) : placeholder}</span>
      </button>
      {open && (
        <Portal>
          <div ref={panel} className="pop fixed z-[100] w-[272px] rounded-2xl border border-line bg-card p-3" style={{ top: pos.top, bottom: pos.bottom, left: pos.left, boxShadow: "var(--shadow-float)", transformOrigin: pos.up ? "bottom" : "top" }}>
            <div className="flex items-center justify-between pb-2">
              <button type="button" className="btn btn-quiet h-7 w-7 justify-center px-0" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={16} strokeWidth={1.5} /></button>
              <div className="text-sm font-medium">{view.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</div>
              <button type="button" className="btn btn-quiet h-7 w-7 justify-center px-0" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={16} strokeWidth={1.5} /></button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WD.map((w) => <div key={w} className="h-7 text-[11px] leading-7 text-fg3">{w}</div>)}
              {days.map((d) => {
                const k = iso(d), out = d.getMonth() !== view.getMonth(), isSel = k === value, dis = disabled(d);
                return (
                  <button key={k} type="button" disabled={!!dis} onClick={() => { onChange(k); setOpen(false); }}
                    className={`relative h-8 rounded-lg text-[13px] tabular transition-colors ${isSel ? "bg-accent text-accent-ink font-medium" : dis ? "text-fg3/40" : out ? "text-fg3/70 hover:bg-raised" : "hover:bg-raised"} ${k === today && !isSel ? "text-accent font-medium" : ""}`}>
                    {d.getDate()}
                    {marks?.[k] && !isSel && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full" style={{ background: marks[k] }} />}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
              {clearable ? <button type="button" className="btn btn-quiet h-7" onClick={() => { onChange(""); setOpen(false); }}>Clear</button> : <span />}
              {max && <button type="button" className="btn btn-quiet h-7" onClick={() => { onChange(max); setOpen(false); }}>Latest data</button>}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

/* ---------- Donut chart (SVG, no library) ---------- */
export function Donut({ data, size = 148, thickness = 16, center, sub }: { data: { label: string; value: number; color: string }[]; size?: number; thickness?: number; center?: string; sub?: string }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const r = (size - thickness) / 2, c = 2 * Math.PI * r;
  let acc = 0;
  const [hover, setHover] = useState<number | null>(null);
  const h = hover != null ? data[hover] : null;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--raised)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const len = (d.value / total) * c;
          const gap = data.length > 1 && len > 3 ? 2 : 0;
          const el = <circle key={d.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={hover === i ? thickness + 4 : thickness}
            strokeDasharray={`${Math.max(len - gap, 0)} ${c}`} strokeDashoffset={-acc} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            style={{ transition: "stroke-width 150ms var(--ease)" }} />;
          acc += len;
          return el;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4">
        <div className="text-lg font-medium tabular leading-tight">{h ? `${Math.round((h.value / total) * 100)}%` : center}</div>
        <div className="mt-0.5 text-[11px] leading-tight text-fg3 line-clamp-2">{h ? h.label : sub}</div>
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="space-y-1.5 min-w-0">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2 text-[13px]">
          <span className="dot" style={{ background: i.color }} />
          <span className="flex-1 truncate text-fg2">{i.label}</span>
          {i.value && <span className="font-mono text-xs tabular">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}
