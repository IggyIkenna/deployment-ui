// SSOT ESLint rules for all UI repos — owned by unified-trading-pm.
// Do NOT edit per-repo. Edit this file and propagate via:
//   python3 unified-trading-pm/scripts/propagation/rollout-quality-gates-unified.py --ui-only
//
// ESLint 9 flat-config format, `.cjs` extension (always CommonJS regardless of a consuming
// repo's package.json `"type"` — unified-trading-system-ui defaults to CommonJS, deployment-ui
// declares `"type": "module"`; a plain `.js` file would parse inconsistently across the two,
// which is why the prior `.eslintrc`-style `eslint.config.base.js` was never actually importable
// by either repo's real flat config — see
// plans/active/issues/ui_repos_eslint_base_config_never_wired_no_explicit_any_unenforced_2026_07_21.md).
//
// RULES-ONLY export (no parser/plugins/extends) — spread `.rules` into a consumer's own flat-config
// array. A full standalone config object here would risk re-declaring plugin instances ESLint 9
// requires to be a single shared reference per rule namespace (each repo already registers
// @typescript-eslint/react-hooks itself via its own tseslint.config()/plugin setup).
//
// Usage in a consumer's eslint.config.{js,mjs}:
//   import uiBaseRules from "./eslint.config.base.cjs";
//   export default tseslint.config(..., { rules: { ...uiBaseRules.rules } }, ...);
//
// Rule philosophy (matches Python zero-warning policy):
//   - no-explicit-any    → error  (agents must use specific types)
//   - no-unused-vars     → error  (dead code is noise; _-prefixed args/vars are the escape hatch)
//   - no-console         → error  (enforced by base-ui.sh [3.5] codex check too)
//
// Per-repo exceptions: use an inline eslint-disable comment + document it in
// QUALITY_GATE_BYPASS_AUDIT.md. Never weaken a rule's severity per-repo — override the specific
// line, not the SSOT.
module.exports = {
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "no-console": "error",
  },
};
