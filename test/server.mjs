/* Static file server + mock AJAX cart endpoint for browser checks. */
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';

const root = process.cwd();
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml',
};

export const cartLines = [];

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/cart/add.js') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const line = JSON.parse(body);
      cartLines.push(line);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: line.id, quantity: line.quantity, properties: line.properties }));
    } catch {
      res.writeHead(422, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ description: 'bad payload' }));
    }
    return;
  }
  if (req.method === 'GET' && req.url === '/__cart') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cartLines));
    return;
  }
  const path = normalize(join(root, decodeURIComponent(req.url.split('?')[0])));
  if (!path.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found: ' + req.url);
  }
});

const port = Number(process.env.PORT || 4173);
server.listen(port, () => console.log(`harness server on http://127.0.0.1:${port}`));
