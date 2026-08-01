#!/usr/bin/env node
/**
 * Orphan-route audit — React Router (Vite) variant.
 *
 * Ported from unified-trading-system-ui/scripts/orphan-audit.ts 2026-04-22.
 * Shares the whitelist / baseline / blocking contract but discovers routes
 * from `<Route path="...">` declarations in the router tree instead of the
 * Next.js `app/` filesystem convention. SSOT for the policy itself lives in
 * unified-trading-pm/codex/06-coding-standards/orphan-audit.md.
 *
 * Usage:
 *   tsx scripts/orphan-audit.ts                  # advisory (exit 0)
 *   tsx scripts/orphan-audit.ts --advisory       # same
 *   tsx scripts/orphan-audit.ts --blocking       # exit 1 on new orphans vs baseline
 *   tsx scripts/orphan-audit.ts --write-baseline # rewrite .orphan-audit-baseline.json
 *   tsx scripts/orphan-audit.ts --json           # machine-readable report only
 *
 * Route discovery: walks src/** for `<Route path="..." .../>` JSX. Recognises
 * React Router v6 segments:
 *   `:param`     → single segment wildcard
 *   `*`          → catch-all (zero or more segments)
 * The catch-all route `<Route path="*">` is intentional (renders the main
 * deployment shell) and is therefore detected + whitelisted by default.
 *
 * Reachability sources:
 *   1. <Link to="...">, <Link to={`...`}>     — react-router navigation (string or template)
 *   2. navigate("..."), navigate(`...`)       — programmatic redirects (string or template)
 *   3. <a href="...">                         — plain anchors
 *   4. Generic "/..." literals in source      — permissive catch-all
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");
const SRC_DIR = join(REPO_ROOT, "src");

const BASELINE_PATH = join(__dirname, ".orphan-audit-baseline.json");
const WHITELIST_PATH = join(__dirname, ".orphan-audit-whitelist.json");
const REPORT_PATH = join(__dirname, ".orphan-audit-report.json");

interface WhitelistEntry {
  readonly path: string;
  readonly reason: string;
}

interface WhitelistFile {
  readonly version: number;
  readonly entries: readonly WhitelistEntry[];
}

interface BaselineFile {
  readonly version: number;
  readonly generated_at: string;
  readonly orphans: readonly string[];
}

interface Report {
  readonly orphans: readonly string[];
  readonly whitelisted: readonly string[];
  readonly reachable_count: number;
  readonly total_count: number;
  readonly timestamp: string;
}

// ─── CLI args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const MODE = argv.includes("--blocking")
  ? "blocking"
  : argv.includes("--write-baseline")
    ? "write-baseline"
    : "advisory";
const JSON_ONLY = argv.includes("--json");
const VERBOSE = argv.includes("--verbose");

// ─── Source walk ─────────────────────────────────────────────────────────────
const SOURCE_FILE_PATTERN = /\.(tsx?|jsx?|mjs|cjs)$/;

function walkAll(dir: string, acc: string[]): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "build") continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      walkAll(p, acc);
    } else if (SOURCE_FILE_PATTERN.test(p)) {
      acc.push(p);
    }
  }
  return acc;
}

const sourceFiles = walkAll(SRC_DIR, []);

// ─── Declared routes — <Route path="..." /> ──────────────────────────────────
const ROUTE_JSX_RE = /<Route\b[^>]*\spath\s*=\s*["']([^"']+)["']/g;
const declaredRoutesSet = new Set<string>();
const fileContents = new Map<string, string>();

for (const file of sourceFiles) {
  // Skip test files — they often declare mock <MemoryRouter><Route/> trees
  // whose paths aren't real app routes.
  if (/\.test\.(tsx?|jsx?)$/.test(file)) continue;
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  fileContents.set(file, content);
  ROUTE_JSX_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROUTE_JSX_RE.exec(content)) !== null) {
    declaredRoutesSet.add(m[1]);
  }
}
const declaredRoutes = [...declaredRoutesSet].sort();

function routeToMatcher(route: string): RegExp {
  // React Router v6 patterns:
  //   `:param`  — single segment
  //   `*`       — catch-all (zero or more segments, trailing)
  const escaped = route
    .split("/")
    .map((seg) => {
      if (seg === "*") return ".*";
      if (seg.startsWith(":")) return "[^/]+";
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp("^" + escaped + "/?$");
}

// ─── Harvest reachability — to=, href=, navigate(...), generic literals ──────
const TO_STRING_RE = /\bto\s*=\s*\{?\s*["']([^"']+?)["']/g;
const HREF_STRING_RE = /\bhref\s*[:=]\s*\{?\s*["']([^"']+?)["']/g;
const NAV_CALL_RE = /\b(?:navigate|router\.(?:push|replace))\s*\(\s*["']([^"']+?)["']/g;
const TO_TEMPLATE_RE = /\bto\s*=\s*\{\s*`([^`]+)`\s*\}/g;
// Dynamic `navigate(\`/service/${id}\`)` calls — same shape as TO_TEMPLATE_RE but for
// imperative navigation instead of a JSX `to=` attribute (added 2026-08-01: the
// per-service home shell moved off a single regex-sniffed catch-all onto real
// `/service/:serviceName(/:tab)` routes reached via useNavigate() template literals,
// which NAV_CALL_RE's string-literal-only match couldn't see).
const NAV_TEMPLATE_RE = /\b(?:navigate|router\.(?:push|replace))\s*\(\s*`([^`]+)`/g;
// Generic "/..." literals — over-matches intentionally; reduces false
// positives at the cost of a few false negatives.
const GENERIC_PATH_STRING_RE = /["']\/([a-zA-Z][\w\-\/\[\]:*]*)["']/g;

const CONST_STRING_RE = /\b(?:const|let|var)\s+([A-Z_][A-Z0-9_]*)\s*(?::\s*[^=]+)?=\s*["']([^"']+)["']/g;
const CONST_TEMPLATE_RE = /\b(?:const|let|var)\s+([A-Z_][A-Z0-9_]*)\s*(?::\s*[^=]+)?=\s*`([^`]*)`/g;

const constMap = new Map<string, string>();

// Pass 1 — const map for template-literal resolution.
for (const [, content] of fileContents) {
  CONST_STRING_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CONST_STRING_RE.exec(content)) !== null) {
    const [, name, value] = m;
    if (value.startsWith("/")) constMap.set(name, value);
  }
  CONST_TEMPLATE_RE.lastIndex = 0;
  while ((m = CONST_TEMPLATE_RE.exec(content)) !== null) {
    const [, name, rawValue] = m;
    const value = rawValue.replace(/\$\{([^}]+)\}/g, (_, expr: string) => {
      const ident = expr.trim();
      return constMap.get(ident) ?? "__PARAM__";
    });
    if (value.startsWith("/")) constMap.set(name, value);
  }
}

function resolveTemplate(rawTpl: string): string {
  return rawTpl.replace(/\$\{([^}]+)\}/g, (_, expr: string) => {
    const ident = expr.trim();
    return constMap.get(ident) ?? "__PARAM__";
  });
}

const rawHrefs = new Set<string>();

// Strip `<Route path="...">` declarations from content before harvesting.
// Otherwise the declaration's own path literal satisfies the generic path-
// string match and every declared route looks "reachable" via itself.
// React Router declarations are route-source-of-truth, not references.
function scrubRouteDecls(content: string): string {
  return content.replace(/<Route\b[^>]*\spath\s*=\s*["'][^"']+["'][^>]*>/g, "<Route/>");
}

// Pass 2 — harvest hrefs from the source tree (with Route decls scrubbed).
for (const [, original] of fileContents) {
  const content = scrubRouteDecls(original);
  for (const re of [TO_STRING_RE, HREF_STRING_RE, NAV_CALL_RE, GENERIC_PATH_STRING_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const href = re === GENERIC_PATH_STRING_RE ? "/" + m[1] : m[1];
      if (href.startsWith("/")) rawHrefs.add(href);
    }
  }
  for (const re of [TO_TEMPLATE_RE, NAV_TEMPLATE_RE]) {
    re.lastIndex = 0;
    let tm: RegExpExecArray | null;
    while ((tm = re.exec(content)) !== null) {
      const resolved = resolveTemplate(tm[1]);
      if (resolved.startsWith("/")) rawHrefs.add(resolved);
    }
  }
}

// ─── Whitelist ───────────────────────────────────────────────────────────────
let whitelist: readonly WhitelistEntry[] = [];
if (existsSync(WHITELIST_PATH)) {
  try {
    const raw = readFileSync(WHITELIST_PATH, "utf8");
    const parsed = JSON.parse(raw) as WhitelistFile;
    whitelist = parsed.entries ?? [];
  } catch (err) {
    console.error(`[orphan-audit] Failed to parse whitelist at ${WHITELIST_PATH}:`, err);
    process.exit(2);
  }
}
const whitelistSet = new Set(whitelist.map((e) => e.path));

// ─── Diff ────────────────────────────────────────────────────────────────────
const orphans: string[] = [];
const reachable: string[] = [];

for (const route of declaredRoutes) {
  const matcher = routeToMatcher(route);
  let isReachable = false;
  for (const href of rawHrefs) {
    const normalized = href.replace(/__PARAM__/g, "__p__");
    if (matcher.test(normalized)) {
      isReachable = true;
      break;
    }
  }
  if (isReachable) {
    reachable.push(route);
  } else {
    orphans.push(route);
  }
}

const nonWhitelistedOrphans = orphans.filter((o) => !whitelistSet.has(o));
const whitelistedHits = orphans.filter((o) => whitelistSet.has(o));

const report: Report = {
  orphans: nonWhitelistedOrphans,
  whitelisted: whitelistedHits,
  reachable_count: reachable.length,
  total_count: declaredRoutes.length,
  timestamp: new Date().toISOString(),
};

writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");

// ─── Mode dispatch ───────────────────────────────────────────────────────────
function printReport(): void {
  if (JSON_ONLY) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const pct = ((reachable.length / Math.max(1, declaredRoutes.length)) * 100).toFixed(1);
  console.log("");
  console.log("═══ Orphan-route audit (React Router) ═══");
  console.log(
    `Declared routes: ${declaredRoutes.length}   Reachable: ${reachable.length} (${pct}%)   Whitelisted: ${whitelistedHits.length}   Orphans: ${nonWhitelistedOrphans.length}`,
  );
  if (nonWhitelistedOrphans.length > 0) {
    console.log("");
    console.log("Orphans (unreachable, not whitelisted):");
    for (const o of nonWhitelistedOrphans) console.log(`  - ${o}`);
  }
  if (VERBOSE && whitelistedHits.length > 0) {
    console.log("");
    console.log("Whitelisted (documented direct-URL-only):");
    for (const o of whitelistedHits) {
      const reason = whitelist.find((w) => w.path === o)?.reason ?? "(no reason)";
      console.log(`  - ${o}  —  ${reason}`);
    }
  }
  console.log("");
  console.log(`Full machine-readable report: ${relative(REPO_ROOT, REPORT_PATH)}`);
}

if (MODE === "write-baseline") {
  const baseline: BaselineFile = {
    version: 1,
    generated_at: new Date().toISOString(),
    orphans: nonWhitelistedOrphans.slice().sort(),
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n", "utf8");
  if (!JSON_ONLY) {
    console.log(
      `[orphan-audit] Wrote baseline with ${baseline.orphans.length} orphans to ${relative(REPO_ROOT, BASELINE_PATH)}`,
    );
  }
  printReport();
  process.exit(0);
}

if (MODE === "blocking") {
  if (!existsSync(BASELINE_PATH)) {
    console.error(
      `[orphan-audit] --blocking requested but baseline not found at ${BASELINE_PATH}. ` +
        `Run 'npm run orphan-audit -- --write-baseline' first.`,
    );
    process.exit(2);
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as BaselineFile;
  const baselineSet = new Set(baseline.orphans);
  const newOrphans = nonWhitelistedOrphans.filter((o) => !baselineSet.has(o));
  printReport();
  if (newOrphans.length > 0) {
    console.log("");
    console.log(`[orphan-audit] ❌ ${newOrphans.length} NEW orphan(s) introduced since baseline:`);
    for (const o of newOrphans) console.log(`  - ${o}`);
    console.log("");
    console.log("Fix options:");
    console.log("  1. WIRE — add a <Link to=...> from an already-reachable page or");
    console.log("            a navigate() call from a button handler.");
    console.log("  2. DELETE — remove the <Route .../> if obsolete.");
    console.log("  3. WHITELIST — add to scripts/.orphan-audit-whitelist.json with a reason.");
    console.log("");
    process.exit(1);
  }
  console.log("[orphan-audit] ✅ No new orphans vs baseline.");
  process.exit(0);
}

// advisory
printReport();
process.exit(0);
