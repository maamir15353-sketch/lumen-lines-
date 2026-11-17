// Serves a built output directory (out/game) on port 8081 for verification only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = process.argv[2] ?? '/home/hatch/workspace/make-fun-best-game/out/game';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost:8081');
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = join(root, decodeURIComponent(path));
    if (!file.startsWith(root)) { response.writeHead(403); response.end(); return; }
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(8081, () => console.log('ready'));
