import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    mode === 'development' && {
      name: 'pmtiles-range-middleware',
      configureServer(server: any) {
        server.middlewares.use(async (req: any, res: any, next: any) => {
          const url = req.url || '';
          if (!url.startsWith('/data/') || !url.endsWith('.pmtiles')) return next();

          const filePath = path.join(process.cwd(), 'public', url);
          if (!fs.existsSync(filePath)) {
            res.statusCode = 404;
            res.end('Not Found');
            return;
          }

          // CORS & Range headers
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, X-Requested-With, Content-Type, Accept');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Accept-Ranges', 'bytes');

          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
          }

          const stat = fs.statSync(filePath);
          const range = req.headers.range as string | undefined;

          if (!range) {
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Content-Type', 'application/octet-stream');
            fs.createReadStream(filePath).pipe(res);
            return;
          }

          const match = /^bytes=(\d+)-(\d+)?$/.exec(range);
          if (!match) {
            res.statusCode = 416;
            res.end('Invalid Range');
            return;
          }

          const start = parseInt(match[1], 10);
          let end = match[2] ? parseInt(match[2], 10) : stat.size - 1;

          if (start >= stat.size) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${stat.size}`);
            res.end();
            return;
          }

          end = Math.min(end, stat.size - 1);
          const chunkSize = end - start + 1;

          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
          res.setHeader('Content-Length', chunkSize);
          res.setHeader('Content-Type', 'application/octet-stream');

          fs.createReadStream(filePath, { start, end }).pipe(res);
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
