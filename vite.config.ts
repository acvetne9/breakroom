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
        server.middlewares.use('/data', (req: any, res: any, next: any) => {
          if (!req.url?.endsWith('.pmtiles')) return next();

          const filePath = path.join(process.cwd(), 'public/data', req.url);
          
          // CORS headers
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, X-Requested-With, Content-Type, Accept');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Accept-Ranges', 'bytes');

          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
          }

          if (!fs.existsSync(filePath)) {
            res.statusCode = 404;
            res.end('Not Found');
            return;
          }

          const stat = fs.statSync(filePath);
          const range = req.headers.range;

          if (!range) {
            // No range requested, send full file
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Length', stat.size.toString());
            res.statusCode = 200;
            fs.createReadStream(filePath).pipe(res);
            return;
          }

          // Parse range header
          const rangeMatch = range.match(/bytes=(\d+)-(\d*)/);
          if (!rangeMatch) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${stat.size}`);
            res.end('Invalid Range');
            return;
          }

          const start = parseInt(rangeMatch[1], 10);
          const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : stat.size - 1;

          if (start >= stat.size || end >= stat.size || start > end) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${stat.size}`);
            res.end('Range Not Satisfiable');
            return;
          }

          const chunkSize = end - start + 1;
          
          res.statusCode = 206;
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Length', chunkSize.toString());
          res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
          
          const stream = fs.createReadStream(filePath, { start, end });
          stream.pipe(res);
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
