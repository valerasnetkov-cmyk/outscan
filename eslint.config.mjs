import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

const nextAppFiles = ["apps/{admin,web}/**/*.{js,jsx,ts,tsx}"];

export default defineConfig(
  globalIgnores([
    "**/.next/**",
    "**/dist/**",
    "**/scanner-dist/**",
    "**/coverage/**",
    "node_modules/**",
  ]),
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...js.configs.recommended,
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  ...tseslint.configs.recommended,
  ...nextVitals.map((config) => ({
    ...config,
    files: nextAppFiles,
  })),
);
