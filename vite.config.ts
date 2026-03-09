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
}));
