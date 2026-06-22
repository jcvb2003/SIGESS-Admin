import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { spawn } from "child_process";
import { resolve } from "path";

function localBackupPlugin(): Plugin {
  const isLocalHost = (h: string) =>
    h === 'localhost' || h === '127.0.0.1' || h === '::1'
    || h.startsWith('localhost:') || h.startsWith('127.0.0.1:');

  return {
    name: 'local-backup',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/local/backup', (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405).end(); return; }

        const host = (req.headers['host'] ?? '').split(':')[0];
        const origin = req.headers['origin'] ?? '';
        if (!isLocalHost(host)) { res.writeHead(403).end('local only'); return; }
        if (origin) {
          try {
            if (!isLocalHost(new URL(origin).hostname)) {
              res.writeHead(403).end('local origin only');
              return;
            }
          } catch {
            res.writeHead(403).end('invalid origin');
            return;
          }
        }

        const url = new URL(req.url!, `http://${req.headers.host}`);
        const isAll = url.searchParams.has('all');
        const projectRef = url.searchParams.get('project-ref');
        const tenant = url.searchParams.get('tenant');
        if (!isAll && !projectRef && !tenant) { res.writeHead(400).end('missing param'); return; }

        const scriptArgs: string[] = ['scripts/backup-tenant-sql.ts', '--triggered-by=admin:ui'];
        if (isAll) scriptArgs.push('--all');
        else if (projectRef) scriptArgs.push(`--project-ref=${projectRef}`);
        else scriptArgs.push(`--tenant=${tenant}`);

        // tsx está em node_modules/.bin — adicionamos ao PATH do processo filho
        const bin = resolve(process.cwd(), 'node_modules', '.bin');
        const sep = process.platform === 'win32' ? ';' : ':';
        const tsxBin = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
        const child = spawn(tsxBin, scriptArgs, {
          cwd: process.cwd(),
          stdio: 'inherit',
          env: { ...process.env, PATH: `${bin}${sep}${process.env.PATH ?? ''}` },
        });
        // Impedir que erro no spawn derrube o Vite
        child.on('error', (err) => {
          console.error('[local-backup] falha ao iniciar backup:', err.message);
        });
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ started: true }));
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
    localBackupPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
