import { defineConfig } from "vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:4242",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("prosemirror") || id.includes("@tiptap/pm")) return "prosemirror";
            if (id.includes("@tiptap") || id.includes("tiptap-markdown")) return "tiptap";
            if (id.includes("@dnd-kit")) return "dndkit";
            if (id.includes("lowlight") || id.includes("highlight.js")) return "lowlight";
            if (id.includes("@xterm")) return "xterm";
          }
        },
      },
    },
  },
});
