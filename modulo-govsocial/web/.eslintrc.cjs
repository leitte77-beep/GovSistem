/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["@typescript-eslint", "react-refresh", "jsx-a11y"],
  ignorePatterns: ["dist", "storybook-static", "node_modules", "playwright-report", "coverage"],
  rules: {
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    // Acesso a dado sensível não pode ir para o console (regra §1.4).
    "no-console": ["error", { allow: ["warn", "error"] }],
  },
  overrides: [
    {
      files: ["**/*.stories.tsx", "**/*.test.tsx", "**/*.test.ts", "e2e/**", "mock/**"],
      rules: { "no-console": "off" },
    },
    {
      // Providers co-localizam o Provider e seu hook de contexto (padrão
      // idiomático); o aviso de fast-refresh não se aplica ao nosso caso.
      files: [
        "src/**/*Provider.tsx",
        "src/tema/densidade.tsx",
        "src/ui/Toast.tsx",
      ],
      rules: { "react-refresh/only-export-components": "off" },
    },
  ],
};
