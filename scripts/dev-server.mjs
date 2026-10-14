import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../public-site', import.meta.url)));
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml']
]);

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || '/', `http://${host}:${port}`).pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    let details = await stat(filePath);
    if (details.isDirectory()) {
      filePath = resolve(filePath, 'index.html');
      details = await stat(filePath);
    }
    if (!details.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'content-type': contentTypes.get(extname(filePath)) || 'application/octet-stream',
      'content-length': details.size,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`GodSend local preview: http://${host}:${port}`);
  console.log('Press Ctrl+C to stop. This server is available only on this computer.');
});
