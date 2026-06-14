import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import net from 'net';

function parseCIDR(cidr) {
  const [base, prefixStr] = cidr.trim().split('/');
  const prefix = prefixStr ? parseInt(prefixStr, 10) : 24;
  const parts = base.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) throw new Error('bad ip');
  const baseInt = (parts[0] << 24 | parts[1] << 16 | parts[2] << 8 | parts[3]) >>> 0;
  const size = 1 << (32 - prefix);
  const hosts = [];
  for (let i = 1; i < size - 1; i++) {
    const n = (baseInt + i) >>> 0;
    hosts.push(`${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`);
  }
  return hosts;
}

function probePort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const start = Date.now();
    let done = false;
    const finish = (open) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ open, latencyMs: open ? Date.now() - start : null });
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
    socket.connect(port, host);
  });
}

function networkScannerPlugin() {
  return {
    name: 'network-scanner',
    configureServer(server) {
      server.middlewares.use('/api/scan', async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const subnet = url.searchParams.get('subnet') || '172.20.10.0/28';
        const port   = parseInt(url.searchParams.get('port') || '1935', 10);

        if (isNaN(port) || port < 1 || port > 65535) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid port' }));
          return;
        }

        let hosts;
        try { hosts = parseCIDR(subnet); }
        catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid subnet' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        const results = await Promise.all(
          hosts.map(async (ip) => {
            const { open, latencyMs } = await probePort(ip, port);
            return { ip, open, latencyMs };
          }),
        );
        res.end(JSON.stringify({ subnet, port, results }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), networkScannerPlugin()],
});
