import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "supabase/functions/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["scripts/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        console: "readonly",
        fetch: "readonly",
        WebSocket: "readonly",
        Buffer: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
  },
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-undef": "off",
    },
  },
  {
    files: ["**/*.config.{js,mjs,ts}", "eslint.config.js"],
    languageOptions: {
      globals: {
        process: "readonly",
      },
    },
  },
);
