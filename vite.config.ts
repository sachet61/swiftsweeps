import http from 'node:http';
import https from 'node:https';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

function isSelfHostedAuthPath(url: string | undefined): boolean {
  if (!url) return false;
  const pathname = url.split('?')[0] || '';
  return (
    pathname === '/api/auth' ||
    pathname.startsWith('/api/auth/') ||
    pathname === '/api/healthz' ||
    pathname === '/api/readyz'
  );
}

function selfHostedApiProxyPlugin(): Plugin {
  return {
    name: 'self-hosted-auth-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!isSelfHostedAuthPath(req.url)) {
          return next();
        }

        const rawTarget = (
          process.env.SELF_HOSTED_API_TARGET ||
          `http://127.0.0.1:${process.env.PORT || '4000'}`
        ).trim();

        let targetUrl: URL;
        try {
          targetUrl = new URL(req.url || '/', rawTarget);
        } catch {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              code: 'API_UNAVAILABLE',
              message: 'Authentication API proxy target is invalid.',
            })
          );
          return;
        }

        const client = targetUrl.protocol === 'https:' ? https : http;
        const headers: http.OutgoingHttpHeaders = { ...req.headers };
        headers.host = targetUrl.host;

        const proxyReq = client.request(
          {
            protocol: targetUrl.protocol,
            hostname: targetUrl.hostname,
            port: targetUrl.port,
            path: `${targetUrl.pathname}${targetUrl.search}`,
            method: req.method,
            headers,
            timeout: 15000,
          },
          (proxyRes) => {
            res.statusCode = proxyRes.statusCode || 502;
            for (const [key, value] of Object.entries(proxyRes.headers)) {
              if (value !== undefined) {
                res.setHeader(key, value);
              }
            }
            proxyRes.pipe(res);
          }
        );

        proxyReq.on('timeout', () => {
          proxyReq.destroy(new Error('Upstream timeout'));
        });

        proxyReq.on('error', () => {
          if (!res.headersSent) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                code: 'API_UNAVAILABLE',
                message: 'Authentication service is currently unavailable.',
              })
            );
          } else {
            res.end();
          }
        });

        req.pipe(proxyReq);
      });
    },
  };
}

function vercelApiDevPlugin(): Plugin {
  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || (req.url !== '/api' && !req.url.startsWith('/api/') && !req.url.startsWith('/api?'))) {
          return next();
        }
        try {
          const chunks: Buffer[] = [];
          await new Promise<void>((resolve, reject) => {
            req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            req.on('end', resolve);
            req.on('error', reject);
          });
          const rawBody = Buffer.concat(chunks).toString('utf8');
          const contentType = String(req.headers['content-type'] || '');
          let parsedBody: any = rawBody;
          if (rawBody && contentType.includes('application/json')) {
            try {
              parsedBody = JSON.parse(rawBody);
            } catch {
              parsedBody = rawBody;
            }
          } else if (!rawBody) {
            parsedBody = {};
          }

          const parsedUrl = new URL(req.url, 'http://localhost');
          const query: Record<string, string> = {};
          parsedUrl.searchParams.forEach((v, k) => {
            query[k] = v;
          });

          const vercelReq = Object.assign(req, {body: parsedBody, query});
          const vercelRes = Object.assign(res, {
            status(code: number) {
              res.statusCode = code;
              return vercelRes;
            },
            json(payload: unknown) {
              if (!res.headersSent) {
                res.setHeader('Content-Type', 'application/json');
              }
              res.end(JSON.stringify(payload));
              return vercelRes;
            },
            send(payload: unknown) {
              if (Buffer.isBuffer(payload) || typeof payload === 'string') {
                res.end(payload);
              } else {
                if (!res.headersSent) {
                  res.setHeader('Content-Type', 'application/json');
                }
                res.end(JSON.stringify(payload));
              }
              return vercelRes;
            },
          });

          const mod = await server.ssrLoadModule('/api/index.ts');
          await mod.default(vercelReq, vercelRes);
        } catch (err: any) {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({error: err?.message || 'Dev API handler error'}));
          }
        }
      });
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, val] of Object.entries(env)) {
    if (val && !process.env[key]) {
      process.env[key] = val;
    }
  }

  return {
    plugins: [react(), tailwindcss(), selfHostedApiProxyPlugin(), vercelApiDevPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
