// @ts-check
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Architecture boundaries (see CLAUDE.md):
 *   shared → routes → services → domain → ports → adapters / client
 * @param {string[]} files
 * @param {{ group: string[]; message: string }[]} patterns
 */
const restrict = (files, patterns) => ({
  files,
  rules: { "no-restricted-imports": ["error", { patterns }] },
});

const ADAPTERS = { group: ["**/adapters", "**/adapters/**"], message: "Only the composition root (index.ts) may import adapters." };
const INFRA_LIBS = { group: ["node:sqlite", "@anthropic-ai/*"], message: "Infrastructure libraries belong in adapters." };
const EXPRESS = { group: ["express"], message: "HTTP concerns belong in routes/http." };

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["eslint.config.js"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  { files: ["**/*.js"], ...tseslint.configs.disableTypeChecked, languageOptions: { globals: globals.node } },
  { files: ["apps/server/**/*.ts", "**/*.config.ts"], languageOptions: { globals: globals.node } },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ...reactHooks.configs.flat.recommended,
    languageOptions: { globals: globals.browser },
  },

  // --- Layer boundaries ---
  restrict(["packages/shared/src/**"], [
    { group: ["@mdiw/*", "express", "react", "react-dom", "node:*", "@anthropic-ai/*", "**/apps/**"], message: "packages/shared may only depend on zod." },
  ]),
  restrict(["apps/server/src/domain/**"], [
    ADAPTERS, INFRA_LIBS, EXPRESS,
    { group: ["node:*", "**/ports", "**/ports/**", "**/services/**", "**/routes/**", "**/http/**"], message: "domain is pure: no I/O, ports, services or HTTP." },
  ]),
  restrict(["apps/server/src/ports/**"], [ADAPTERS, INFRA_LIBS, EXPRESS]),
  restrict(["apps/server/src/services/**"], [
    ADAPTERS, INFRA_LIBS, EXPRESS,
    { group: ["**/routes/**", "**/http/**"], message: "services must not depend on HTTP." },
  ]),
  restrict(["apps/server/src/routes/**", "apps/server/src/http/**"], [ADAPTERS, INFRA_LIBS]),
  restrict(["apps/server/src/adapters/**"], [
    EXPRESS,
    { group: ["**/routes/**", "**/services/**", "**/http/**"], message: "adapters must not depend on routes/services/http." },
  ]),
  restrict(["apps/web/src/**"], [
    { group: ["@mdiw/server", "**/apps/server/**", "node:*"], message: "The web client may only share code via @mdiw/shared." },
  ]),
);
