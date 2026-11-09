import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index2.html';

  const cleanPath = reqPath.replace(/^\/+/, '');
  let filePath;

  if (cleanPath.startsWith('extension/')) {
    filePath = path.join(rootDir, cleanPath);
  } else {
    // Check web-demo first, then rootDir
    const demoPath = path.join(rootDir, 'web-demo', cleanPath);
    if (fs.existsSync(demoPath)) {
      filePath = demoPath;
    } else {
      filePath = path.join(rootDir, cleanPath);
    }
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`404 Not Found: ${reqPath}`);
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`FlatAudit Web Demo & Showcase running at http://localhost:${PORT}`);
  console.log(`- Showcase: http://localhost:${PORT}/index2.html`);
  console.log(`- Interactive Studio: http://localhost:${PORT}/index.html`);
});

