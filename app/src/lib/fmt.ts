export const inr = (n: number | null | undefined) => (n == null ? "—" : "₹" + Math.round(n).toLocaleString("en-IN"));
export const lakh = (n: number | null | undefined) => (n == null ? "—" : `₹${(n / 100000).toFixed(1)}L`);
export const pct = (n: number | null | undefined, d = 0) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);
export const stageLabel = (s: string) => { const t = s.replace(/_/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
export const ACTION_DOT: Record<string, string> = { scale: "bg-pos", change: "bg-warn", stop: "bg-neg", test_more: "bg-fg3", stopped: "bg-fg3" };
export const ACTION_LABEL: Record<string, string> = { scale: "Scale", change: "Change", stop: "Stop", test_more: "Test more", stopped: "Stopped" };
export const STAGES = ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed", "lost", "withdrawn"];
export const STAGE_COLOR: Record<string, string> = {
  prospecting: "#a7b8ad", contacted: "#6f9c84", proposal_sent: "#2f6fde", negotiating: "#e0a12e", partner_confirmed: "#16a34a", lost: "#dc4a4a", withdrawn: "#8a8f8c",
};
export const STAGE_DOT: Record<string, string> = Object.fromEntries(Object.entries(STAGE_COLOR).map(([k, v]) => [k, `bg-[${v}]`]));
// Channel colours: warm channels carry colour, cold channels stay muted
export const CHANNEL_COLOR: Record<string, string> = { SC02: "#e0a12e", SC05: "#16a34a", SC04: "#2f6fde", SC01: "var(--chart-muted)", SC03: "var(--chart-muted)", SC06: "var(--chart-muted)" };
export const OWNERS = ["Riya Kapoor", "Kabir Shah", "Meera Iyer", "Nisha Rao"];
export const AVATAR: Record<string, string> = { "Riya Kapoor": "#16a34a", "Kabir Shah": "#2f6fde", "Meera Iyer": "#e0a12e", "Nisha Rao": "#a855f7" };
