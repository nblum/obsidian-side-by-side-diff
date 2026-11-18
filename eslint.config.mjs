import eslint from "@eslint/js";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import obsidian from "eslint-plugin-obsidianmd";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: ["main.js", "node_modules/**", ".idea/**", ".claude/**", ".obsidian-cache/**", "e2e-results/**"],
	},
	eslint.configs.recommended,
	{
		files: ["**/*.mjs"],
		languageOptions: {
			globals: globals.node,
		},
	},
	...tseslint.configs.strictTypeChecked.map((config) => ({
		...config,
		files: ["src/**/*.ts", "tests/e2e/**/*.ts", "wdio*.conf.mts"],
	})),
	{
		files: ["tests/e2e/**/*.ts", "wdio*.conf.mts"],
		languageOptions: {
			parserOptions: { projectService: true },
		},
	},
	{
		files: ["src/**/*.ts"],
		plugins: {
			"eslint-comments": eslintComments,
			obsidianmd: obsidian,
		},
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				projectService: true,
			},
		},
		rules: {
			"@typescript-eslint/no-deprecated": "warn",
			"@typescript-eslint/explicit-function-return-type": "error",
			"@typescript-eslint/explicit-module-boundary-types": "error",
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/no-misused-promises": "error",
			"@typescript-eslint/no-unnecessary-type-assertion": "warn",
			"@typescript-eslint/strict-boolean-expressions": "error",
			"eslint-comments/no-restricted-disable": ["error", "@typescript-eslint/no-deprecated"],
			"eslint-comments/require-description": "error",
			"obsidianmd/detach-leaves": "error",
			"obsidianmd/no-unsupported-api": "error",
			"obsidianmd/no-static-styles-assignment": "error",
			"obsidianmd/prefer-create-el": "warn",
			"obsidianmd/prefer-instanceof": "warn",
		},
	},
);
