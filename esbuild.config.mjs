import esbuild from "esbuild";

const production = process.argv.includes("production");

await esbuild.build({
	entryPoints: ["src/main.ts"],
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "es2020",
	external: ["obsidian"],
	outfile: "main.js",
	sourcemap: production ? false : "inline",
	minify: production,
	logLevel: "info",
});
