import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import stylistic from "@stylistic/eslint-plugin"

export default tseslint.config({
    extends: [
        eslint.configs.recommended,
        ...tseslint.configs.recommended,
        stylistic.configs.customize({
            semi: false,
            indent: 4,
            quotes: "double",
        }),
    ],
    rules: {
        "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        "@typescript-eslint/no-explicit-any": "off",
        "@stylistic/new-parens": "off",
        "@stylistic/brace-style": ["error", "1tbs", { allowSingleLine: true }],
    },
})
