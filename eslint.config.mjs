import globals from "globals";

export default [
  {
    files: ["src/core.js", "src/demo.js", "src/app.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: { ...globals.browser, ...globals.es2021 }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { "args": "none", "caughtErrors": "none", "varsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { "args": "none" }]
    }
  }
];
