/* Tiny local web server for testing BirthdayBeat in a browser (localhost only). */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.xlsx': 'application/octet-stream', '.png': 'image/png', '.pdf': 'application/pdf', '.json': 'application/json' };
http.createServer((req, res) => {
  const p = path.normalize(path.join(ROOT, decodeURIComponent(req.url.split('?')[0])));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(5178, '127.0.0.1', () => console.log('BirthdayBeat test server on http://localhost:5178/BirthdayBeat/'));
