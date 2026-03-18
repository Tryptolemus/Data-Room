import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'pdf-proxy',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith('/api/proxy-pdf')) {
              try {
                const urlObj = new URL(req.url, `http://${req.headers.host}`);
                const targetUrl = urlObj.searchParams.get('url');

                if (!targetUrl) {
                  res.statusCode = 400;
                  res.end('Missing URL parameter');
                  return;
                }

                console.log(`[Vite-Proxy] Fetching URL: ${targetUrl}`);

                const response = await fetch(targetUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/pdf, */*'
                  }
                });

                if (!response.ok) {
                  res.statusCode = response.status;
                  res.end(`Failed to fetch PDF: ${response.statusText}`);
                  return;
                }

                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Length', buffer.length.toString());
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(buffer);
              } catch (error) {
                console.error('[Vite-Proxy] Error:', error);
                res.statusCode = 500;
                res.end('Failed to proxy PDF');
              }
              return;
            }
            next();
          });
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
