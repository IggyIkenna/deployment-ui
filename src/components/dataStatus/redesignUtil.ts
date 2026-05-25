/**
 * Date / number / RNG helpers for the redesigned Data Status tab.
 *
 * Ported verbatim (semantics-preserving) from the prototype's
 * `design/data-status-redesign/js/util.jsx`. Pure functions only — no React.
 */

export const cls = (...xs: (string | false | null | undefined)[]): string =>
  xs.filter(Boolean).join(" ");

const pad = (n: number): string => String(n).padStart(2, "0");

/** Date -> "YYYY-MM-DD" (local calendar date, like the prototype). */
export const ymd = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseYmd = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const daysBetween = (a: string, b: string): number =>
  Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86_400_000);

export const enumerateDates = (start: string, end: string): string[] => {
  const out: string[] = [];
  let d = parseYmd(start);
  const ed = parseYmd(end);
  while (d <= ed) {
    out.push(ymd(d));
    d = addDays(d, 1);
  }
  return out;
};

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const MONTHS = MONTH_SHORT;

export function fmtDateShort(s: string): string {
  if (!s) return "";
  const [, m, d] = s.split("-");
  return `${parseInt(d, 10)} ${MONTH_SHORT[parseInt(m, 10) - 1]}`;
}

export function fmtDateFull(s: string): string {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${parseInt(d, 10)} ${MONTH_SHORT[parseInt(m, 10) - 1]} ${y}`;
}

export const fmtNumber = (n: number | undefined | null): string => {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
};

export const fmtPct = (p: number): string => `${(p * 100).toFixed(1)}%`;

/** Seeded RNG (deterministic) — used to synthesise illustrative leaf detail. */
export function mulberry32(seed: number): () => number {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Human-readable axis label — mirrors the prototype's AXIS_LABEL map. */
const AXIS_LABEL: Record<string, string> = {
  venue: "Venue",
  chain: "Chain",
  data_type: "Data type",
  instrument_type: "Inst. type",
  instrument_id: "Instrument",
  feature_group: "Feature group",
  timeframe: "Timeframe",
  league_id: "League",
  source: "Source",
  fixture_id: "Fixture",
  model_family: "Model family",
  training_period: "Training period",
  strategy_id: "Strategy",
  instruction_type: "Instruction",
  archetype: "Archetype",
  canonical_question_group: "Question group",
  job_id: "Job",
  client_id: "Client",
  asset_group: "Asset group",
  date: "Date",
};

export const axisLabel = (a: string): string => AXIS_LABEL[a] ?? a;

export type Tone = "good" | "warn" | "bad";

export const toneFor = (pct: number): Tone =>
  pct >= 95 ? "good" : pct >= 80 ? "warn" : "bad";

export const toneColor = (tone: Tone): string =>
  tone === "good"
    ? "var(--color-accent-green)"
    : tone === "warn"
      ? "var(--color-accent-amber)"
      : "var(--color-accent-red)";
