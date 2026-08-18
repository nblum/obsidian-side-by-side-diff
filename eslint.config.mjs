import eslint from "@eslint/js";
import obsidian from "eslint-plugin-obsidianmd";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: ["main.js", "node_modules/**", ".idea/**", ".claude/**"],
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
		files: ["src/**/*.ts"],
	})),
	{
		files: ["src/**/*.ts"],
		plugins: {
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
			"@typescript-eslint/explicit-function-return-type": "error",
			"@typescript-eslint/explicit-module-boundary-types": "error",
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/no-misused-promises": "error",
			"@typescript-eslint/strict-boolean-expressions": "error",
			"obsidianmd/no-static-styles-assignment": "error",
		},
	},
);
