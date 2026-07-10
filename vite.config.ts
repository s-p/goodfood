import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built app works from any static host (GitHub Pages,
// Netlify, a subfolder). Routing is hash-based, so no server config is needed.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
  },
});
