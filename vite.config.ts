import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { spawn } from "child_process";
import { resolve } from "path";

function parseHost(raw: string): string {
  if (raw.startsWith('[')) {
    const close = raw.indexOf(']');
    return close !== -1 ? raw.slice(1, close) : raw;
  }
  return raw.split(':')[0];
}

function localOpsPlugin(): Plugin {
  const isLocalHost = (h: string) =>
    h === 'localhost' || h === '127.0.0.1' || h === '::1'
    || h.startsWith('localhost:') || h.startsWith('127.0.0.1:');

  function spawnLocal(res: import('http').ServerResponse, scriptArgs: string[]) {
    const bin = resolve(process.cwd(), 'node_modules', '.bin');
    const sep = process.platform === 'win32' ? ';' : ':';
    const tsxBin = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
    const child = spawn(tsxBin, scriptArgs, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: { ...process.env, PATH: `${bin}${sep}${process.env.PATH ?? ''}` },
    });
    child.on('error', (err) => {
      console.error('[local-ops] falha ao iniciar processo:', err.message);
    });
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ started: true }));
  }

  function validateLocal(
    req: import('http').IncomingMessage,
    res: import('http').ServerResponse,
  ): boolean {
    if (req.method !== 'POST') { res.writeHead(405).end(); return false; }
    const host = parseHost(req.headers['host'] ?? '');
    const origin = req.headers['origin'] ?? '';
    if (!isLocalHost(host)) { res.writeHead(403).end('local only'); return false; }
    if (origin) {
      try {
        if (!isLocalHost(new URL(origin).hostname)) {
          res.writeHead(403).end('local origin only'); return false;
        }
      } catch {
        res.writeHead(403).end('invalid origin'); return false;
      }
    }
    return true;
  }

  return {
    name: 'local-ops',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/local/backup', (req, res) => {
        if (!validateLocal(req, res)) return;

        const url = new URL(req.url!, `http://${req.headers.host}`);
        const isAll = url.searchParams.has('all');
        const projectRef = url.searchParams.get('project-ref');
        const tenant = url.searchParams.get('tenant');
        if (!isAll && !projectRef && !tenant) { res.writeHead(400).end('missing param'); return; }

        const scriptArgs: string[] = ['scripts/backup-tenant-sql.ts', '--triggered-by=admin:ui'];
        if (isAll) scriptArgs.push('--all');
        else if (projectRef) scriptArgs.push(`--project-ref=${projectRef}`);
        else scriptArgs.push(`--tenant=${tenant!}`);

        spawnLocal(res, scriptArgs);
      });

      server.middlewares.use('/api/local/deploy-edge', (req, res) => {
        if (!validateLocal(req, res)) return;

        const url = new URL(req.url!, `http://${req.headers.host}`);
        const fn = url.searchParams.get('fn');
        const projectRef = url.searchParams.get('project-ref');
        if (!fn || !projectRef) { res.writeHead(400).end('missing fn or project-ref'); return; }

        spawnLocal(res, ['scripts/deploy-edge-function.ts', fn, `--ref=${projectRef}`]);
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    localOpsPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
