import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    // Explicitly target your TypeScript files
    files: ["**/*.ts", "**/*.tsx"],
    
    // Explicitly inject the TypeScript plugin
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    
    // Explicitly configure the parser without Next.js interfering
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true, 
        },
      },
    },
    
    // Apply the standard TypeScript rules
    rules: {
      ...tsPlugin.configs.recommended.rules,
    },
  },
  {
    // Keep your global ignores
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "next-env.d.ts",
    ],
  },
];