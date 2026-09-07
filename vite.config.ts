/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Dev-server only: label the gzip-on-disk vector tiles so DevTools shows them
 * sensibly. In production vercel.json sets these headers.
 */
const pbfHeaders = (): Plugin => ({
  name: "pbf-headers",
  configureServer(server) {
    server.middlewares.use("/data/tiles", (req, res, next) => {
      if (req.url?.endsWith(".pbf")) {
        res.setHeader("Content-Type", "application/x-protobuf");
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Cache-Control", "public, max-age=3600");
      }
      next();
    });
  },
});

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), pbfHeaders()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    // Keep the shipped bundle quiet; errors still surface via the Map/Supabase error paths.
    drop: process.env.NODE_ENV === "production" ? ["console", "debugger"] : [],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/maplibre-gl")) return "maplibre";
          if (id.includes("node_modules/@deck.gl") || id.includes("node_modules/@luma.gl")) return "deck";
          if (id.includes("node_modules/@turf")) return "turf";
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
