import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
	base: command === "build" ? "/oceanmodel/" : "/",
	server: {
		watch: {
			usePolling: true, // force vite to watch for the updates
		},
		host: "0.0.0.0",
		port: 5173,
	},
	// BabylonJS uses conditional dynamic import() calls for shaders (e.g. rgbdDecode).
	// Vite's esbuild pre-bundler flattens node_modules into chunks in .vite/deps/,
	// which breaks those relative paths at runtime — the browser fetches a missing URL
	// and receives the HTML 404 fallback, which then appears as the shader source.
	// Excluding these packages from pre-bundling keeps the original file layout intact
	// so dynamic imports resolve correctly.
	optimizeDeps: {
		exclude: ["@babylonjs/core", "@babylonjs/gui", "@babylonjs/loaders", "@babylonjs/materials"],
	},
}));
