import { cpSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages project sites are served at /<repo-name>/ (set in CI via VITE_BASE_PATH)
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [
    react(),
    {
      name: "gh-pages-spa-fallback",
      closeBundle() {
        cpSync("dist/index.html", "dist/404.html");
      },
    },
  ],
});
