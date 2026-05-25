// Shared icons (SVG) and tiny helpers. Pre-React-import safe — uses globals.
// Icons are minimal lucide-style strokes inline so we don't pull a network dep.

const { useState, useEffect, useMemo, useRef, useCallback } = React;

const cls = (...xs) => xs.filter(Boolean).join(" ");

const Icon = ({ d, size = 14, stroke = 1.6, fill, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill || "none"}
    stroke={fill ? "none" : "currentColor"}
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    {d}
  </svg>
);

const Icons = {
  Server:   (p) => <Icon {...p} d={<><rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/><path d="M7 7h.01M7 17h.01"/></>}/>,
  Database: (p) => <Icon {...p} d={<><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6"/></>}/>,
  Activity: (p) => <Icon {...p} d={<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>}/>,
  Cloud:    (p) => <Icon {...p} d={<path d="M17.5 19a4.5 4.5 0 0 0 0-9 5 5 0 0 0-9.7-1.4A4 4 0 0 0 6.5 19"/>}/>,
  Calendar: (p) => <Icon {...p} d={<><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>}/>,
  Filter:   (p) => <Icon {...p} d={<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>}/>,
  Search:   (p) => <Icon {...p} d={<><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>}/>,
  Refresh:  (p) => <Icon {...p} d={<><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></>}/>,
  Download: (p) => <Icon {...p} d={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>}/>,
  ChevronDown:  (p) => <Icon {...p} d={<polyline points="6 9 12 15 18 9"/>}/>,
  ChevronRight: (p) => <Icon {...p} d={<polyline points="9 18 15 12 9 6"/>}/>,
  ChevronLeft:  (p) => <Icon {...p} d={<polyline points="15 18 9 12 15 6"/>}/>,
  X:        (p) => <Icon {...p} d={<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}/>,
  Alert:    (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}/>,
  AlertTri: (p) => <Icon {...p} d={<><path d="m10.29 3.86 1.83-2.97a2 2 0 0 1 3.43 0L20.84 18a2 2 0 0 1-1.71 3H4.87a2 2 0 0 1-1.71-3l8.13-14.14z" transform="translate(-1,1)"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>}/>,
  Check:    (p) => <Icon {...p} d={<polyline points="20 6 9 17 4 12"/>}/>,
  Settings: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>}/>,
  Eye:      (p) => <Icon {...p} d={<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}/>,
  Rocket:   (p) => <Icon {...p} d={<><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></>}/>,
  Hash:     (p) => <Icon {...p} d={<><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></>}/>,
  Layers:   (p) => <Icon {...p} d={<><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>}/>,
  Clock:    (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}/>,
  Zap:      (p) => <Icon {...p} d={<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>}/>,
  Grid:     (p) => <Icon {...p} d={<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>}/>,
  BarChart: (p) => <Icon {...p} d={<><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></>}/>,
  ChartCal: (p) => <Icon {...p} d={<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></>}/>,
  Play:     (p) => <Icon {...p} d={<polygon points="5 3 19 12 5 21 5 3"/>}/>,
  Wrench:   (p) => <Icon {...p} d={<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>}/>,
  Wave:     (p) => <Icon {...p} d={<path d="M2 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0 2 0 2 0"/>}/>,
  TrendUp:  (p) => <Icon {...p} d={<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>}/>,
  Dot:      (p) => <Icon {...p} d={<circle cx="12" cy="12" r="4" fill="currentColor"/>} fill/>,
  Compass:  (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></>}/>,
  Info:     (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>}/>,
  ListFilter: (p) => <Icon {...p} d={<><path d="M3 6h18M7 12h10M10 18h4"/></>}/>,
  Sparkles: (p) => <Icon {...p} d={<><path d="M12 3l1.5 4 4 1.5-4 1.5L12 14l-1.5-4-4-1.5 4-1.5z"/><path d="M19 14l.7 1.8 1.8.7-1.8.7L19 19l-.7-1.8-1.8-.7 1.8-.7z"/><path d="M5 14l.7 1.8 1.8.7-1.8.7L5 19l-.7-1.8-1.8-.7 1.8-.7z"/></>}/>,
};

/* ───── date helpers ───── */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDateShort(s) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${parseInt(d, 10)} ${MONTH_SHORT[parseInt(m, 10) - 1]}`;
}
function fmtDateFull(s) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${parseInt(d, 10)} ${MONTH_SHORT[parseInt(m, 10) - 1]} ${y}`;
}

const fmtNumber = (n) => {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
};
const fmtPct = (p) => `${(p * 100).toFixed(1)}%`;
const ago = (date) => {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

/* ───── seeded RNG (deterministic) ───── */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

Object.assign(window, { cls, Icon, Icons, ymd, parseYmd, addDays, daysBetween, fmtNumber, fmtPct, ago, mulberry32, fmtDateShort, fmtDateFull, useState, useEffect, useMemo, useRef, useCallback });
