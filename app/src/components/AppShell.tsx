"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { LayoutGrid, Megaphone, Columns3, ListChecks, SlidersHorizontal, MessageSquareText, PanelRightClose, Sun, Moon } from "lucide-react";
import type { Snapshot } from "@/lib/metrics";
import Copilot from "./Copilot";
import { DatePicker } from "./ui";

type Theme = "light" | "dark";
type Ctx = { snap: Snapshot | null; asOf: string; setAsOf: (d: string) => void; refresh: () => Promise<void>; loading: boolean; version: number; openCopilot: (prompt?: string) => void; theme: Theme };
const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/settings", label: "Assumptions and data", icon: SlidersHorizontal },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [asOf, setAsOfState] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [copilotOpen, setCopilotOpen] = useState(true);
  const [seedPrompt, setSeedPrompt] = useState<string | undefined>();
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => { try { const t = localStorage.getItem("theme"); if (t === "dark" || t === "light") setTheme(t); } catch {} }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem("theme", theme); } catch {} }, [theme]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/snapshot", { cache: "no-store" }).then((r) => r.json());
    setSnap(r); setAsOfState(r.as_of); setLoading(false); setVersion((v) => v + 1);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const setAsOf = async (d: string) => { await fetch("/api/settings", { method: "PATCH", body: JSON.stringify({ as_of: d }) }); await refresh(); };
  const openCopilot = (p?: string) => { setCopilotOpen(true); setSeedPrompt(p ? `${p}␟${Date.now()}` : undefined); };

  const start = snap?.event ? String(snap.event.history_start).slice(0, 10) : "2025-01-15";
  const end = snap?.event ? String(snap.event.history_end).slice(0, 10) : "2025-04-20";
  const days = snap?.targets.days_to_event ?? 0;
  const stalled = snap?.stalled.length ?? 0;
  const marks = { "2025-04-12": "var(--accent)", "2025-04-13": "var(--accent)", "2025-03-15": "var(--warn)" };

  return (
    <AppCtx.Provider value={{ snap, asOf, setAsOf, refresh, loading, version, openCopilot, theme }}>
      <div className="flex h-screen overflow-hidden">
        <aside className="hidden md:flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-fg">
          <div className="flex h-16 items-center gap-2.5 px-5">
            <svg width="24" height="24" viewBox="0 0 22 22" aria-hidden><rect x="1" y="4" width="20" height="14" rx="3" fill="currentColor" /><circle cx="1" cy="11" r="3" fill="var(--sidebar)" /><circle cx="21" cy="11" r="3" fill="var(--sidebar)" /><path d="M8 4v14" stroke="var(--sidebar)" strokeWidth="1.2" strokeDasharray="1.5 1.5" /></svg>
            <div className="leading-tight">
              <div className="text-[15px] font-medium">Backstage</div>
              <div className="text-xs text-sidebar-fg2">CampusFest sponsor desk</div>
            </div>
          </div>
          <nav className="flex-1 px-3 pt-4">
            <div className="px-2 pb-2 text-xs text-sidebar-fg2">Desk</div>
            <div className="space-y-0.5">
              {NAV.map((n) => {
                const active = path === n.href;
                const Icon = n.icon;
                return (
                  <Link key={n.href} href={n.href} className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors ${active ? "bg-sidebar-raised text-sidebar-fg" : "text-sidebar-fg2 hover:text-sidebar-fg hover:bg-sidebar-raised"}`} style={active ? { boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" } : undefined}>
                    <Icon size={16} strokeWidth={1.5} />
                    <span className="flex-1">{n.label}</span>
                    {n.href === "/pipeline" && <span className="font-mono text-xs text-sidebar-fg2">{snap?.counts.open ?? ""}</span>}
                  </Link>
                );
              })}
            </div>
            <div className="px-2 pt-6 pb-2 text-xs text-sidebar-fg2">The show</div>
            <div className="mx-2 rounded-xl bg-sidebar-raised p-3">
              <div className="text-[28px] leading-none font-medium tabular">{days > 0 ? days : "Done"}</div>
              <div className="mt-1 text-xs text-sidebar-fg2">{days > 0 ? "days until doors open" : "Show ran 12–13 Apr"}</div>
              <div className="mt-3 flex justify-between font-mono text-xs text-sidebar-fg2"><span>Mumbai</span><span>12–13 Apr</span></div>
              <div className="mt-1 flex justify-between font-mono text-xs text-sidebar-fg2"><span>Stalled deals</span><span className={stalled ? "text-[#f5c451]" : ""}>{stalled}</span></div>
            </div>
          </nav>
          <div className="px-5 py-4 text-xs leading-5 text-sidebar-fg2">RISA sample data plus team-entered assumptions, each one labelled</div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-card px-6">
            <nav className="md:hidden flex gap-3 text-sm">{NAV.map((n) => <Link key={n.href} href={n.href} className={path === n.href ? "text-fg" : "text-fg3"}>{n.label.split(" ")[0]}</Link>)}</nav>
            <span className="text-[13px] text-fg2">As of</span>
            <DatePicker value={asOf} onChange={(d) => d && setAsOf(d)} min={start} max={end} marks={marks} className="w-40" />
            <span className="meta hidden lg:inline">End of day IST, later data hidden</span>
            {loading && <span className="meta">Syncing</span>}
            <div className="ml-auto flex items-center gap-2">
              <div className="seg" role="radiogroup" aria-label="Theme">
                <button data-on={theme === "light"} onClick={() => setTheme("light")} aria-label="Light theme"><Sun size={14} strokeWidth={1.5} /></button>
                <button data-on={theme === "dark"} onClick={() => setTheme("dark")} aria-label="Dark theme"><Moon size={14} strokeWidth={1.5} /></button>
              </div>
              <button className="btn btn-ghost" onClick={() => setCopilotOpen((o) => !o)}>
                {copilotOpen ? <PanelRightClose size={16} strokeWidth={1.5} /> : <MessageSquareText size={16} strokeWidth={1.5} />}
                Analyst
              </button>
            </div>
          </header>
          <div className="flex flex-1 min-h-0">
            <main className="flex-1 overflow-y-auto px-6 py-8 lg:px-8">
              <div className="mx-auto max-w-[1440px]">{snap ? children : <div className="meta">Loading</div>}</div>
            </main>
            {copilotOpen && <Copilot onClose={() => setCopilotOpen(false)} seedPrompt={seedPrompt} />}
          </div>
        </div>
      </div>
    </AppCtx.Provider>
  );
}
