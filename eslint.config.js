import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import eslintConfigPrettier from "eslint-config-prettier";
import uiBaseRules from "./eslint.config.base.cjs";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // SSOT (unified-trading-pm/scripts/quality-gates-base/eslint.config.base.cjs) — was
      // hardcoded here at weaker levels ("warn" for no-explicit-any, no no-console at all)
      // before this file actually imported it; see
      // plans/active/issues/ui_repos_eslint_base_config_never_wired_no_explicit_any_unenforced_2026_07_21.md.
      ...uiBaseRules.rules,
    },
  },
  eslintConfigPrettier,
);
