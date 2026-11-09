module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  parserOptions: { ecmaVersion: 2021, sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["react", "react-hooks"],
  extends: ["eslint:recommended"],
  settings: { react: { version: "detect" } },
  rules: {
    "no-undef": "error",
    "no-unused-vars": "warn",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "no-dupe-keys": "error",
    "no-redeclare": "error",
    "no-dupe-class-members": "error",
  },
  globals: {
    React: "readonly",
    __BUILD_ID__: "readonly",
  },
};
