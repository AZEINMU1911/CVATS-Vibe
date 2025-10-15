import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...args) => {
  if (
    (typeof warning === "string" && warning.includes(".eslintignore")) ||
    (warning && typeof warning === "object" && "name" in warning && warning.name === "ESLintIgnoreWarning")
  ) {
    return;
  }

  originalEmitWarning(warning, ...args);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      ".vercel/**",
      "dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "tests/fixtures/**",
    ],
  },
  {
    files: ["next-env.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "warn",
    },
  },
];

export default eslintConfig;
