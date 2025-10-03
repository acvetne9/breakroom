import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    hmr: false,
    host: "::",
    port: 8081,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
    // Custom plugin to handle .pbf files with proper headers
    {
      name: 'pbf-headers',
      configureServer(server: any) {
        server.middlewares.use('/data/tiles', (req: any, res: any, next: any) => {
          if (req.url?.endsWith('.pbf')) {
            console.log('🔧 Setting headers for .pbf file:', req.url);
            res.setHeader('Content-Type', 'application/x-protobuf');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            // Don't set Content-Encoding unless files are actually gzipped
          }
          next();
        });
      }
    }
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
