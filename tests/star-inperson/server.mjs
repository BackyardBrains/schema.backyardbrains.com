// server.mjs — test/dev static server for static/ plus an in-memory mock of Flask's POST /data.
// Library:  const srv = await startServer({ corrupt: ['star-inperson/img/face_blindfold_R.png'] });
//           srv.url -> 'http://127.0.0.1:<port>'; srv.payloads -> [{experiment, UUID, data}, ...]; await srv.close()
// CLI:      node tests/star-inperson/server.mjs [port]   (serves http://127.0.0.1:<port>/star-inperson/, prints each POST)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..', '..');
export const STATIC_ROOT = path.join(REPO, 'static');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
};

export function startServer({ root = STATIC_ROOT, corrupt = [], postStatus = null, log = false, port = 0 } = {}) {
  const payloads = [];
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    requests.push({ method: req.method, path: url.pathname });
    if (req.method === 'POST' && url.pathname === '/data') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        let env = null;
        try { env = JSON.parse(body.toString('utf8')); } catch (e) { env = null; }
        if (!env || typeof env !== 'object') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', error: 'invalid JSON' }));
          return;
        }
        const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
        const name = `${env.experiment || 'exp'}_${env.UUID || 'nouuid'}_${ts}.json`;
        payloads.push({ ...env, _bytes: body.length, _name: name });
        if (log) console.log(`POST /data ${name} ${body.length} bytes reason=${env.data?.session?.save_reason}`);
        if (postStatus) { res.writeHead(postStatus, { 'Content-Type': 'application/json' }); res.end('{"status":"error"}'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', saved: `uploads/${name}` }));
      });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) {
        if (fs.existsSync(file + '/index.html')) { res.writeHead(301, { Location: url.pathname + '/' }); res.end(); return; }
        res.writeHead(404); res.end('not found'); return;
      }
      if (corrupt.some((c) => file.endsWith(path.normalize(c)))) {
        buf = Buffer.from(buf);
        for (let i = 100; i < buf.length; i += 997) buf[i] ^= 0xff;   // flip bytes -> hash mismatch / decode failure
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: p } = server.address();
      resolve({
        port: p, url: `http://127.0.0.1:${p}`, payloads, requests,
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
      });
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.argv[2] || 8765);
  startServer({ port, log: true }).then((s) => console.log(`serving ${STATIC_ROOT} at ${s.url}/star-inperson/ (POST /data mocked in memory)`));
}
