/** Shared esbuild options that must stay aligned across builds and bundle tests. */
export const PLUGIN_BUNDLE_OPTIONS = {
	entryPoints: ["src/main.ts"],
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "es2020",
	external: ["obsidian", "electron"],
	loader: {
		".md": "text",
		".png": "dataurl",
		".webp": "dataurl"
	}
};
