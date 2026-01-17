/**
 * Simple static file server for testing the embedded score editor
 * Serves:
 * - /score-editor/* -> ../out/*
 * - /* -> test-embed/*
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.mscz': 'application/octet-stream',
  '.xml': 'text/xml',
  '.musicxml': 'text/xml',
  '.mxl': 'application/vnd.recordare.musicxml',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
  '.pdf': 'application/pdf',
  '.wav': 'audio/wav',
  '.sf2': 'application/octet-stream',
  '.sf3': 'application/octet-stream',
};

const server = http.createServer((req, res) => {
  let filePath;

  // Route /score-editor/* to out/*
  if (req.url.startsWith('/score-editor/')) {
    filePath = path.join(__dirname, '..', 'out', req.url.substring('/score-editor/'.length));
  } else if (req.url === '/') {
    // Root -> index.html
    filePath = path.join(__dirname, 'index.html');
  } else {
    // Everything else -> test-embed/
    filePath = path.join(__dirname, req.url);
  }

  // Remove query string
  filePath = filePath.split('?')[0];

  // Default to index.html for directories
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // Get file extension and MIME type
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  // Read and serve file
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`404 Not Found: ${req.url}`, 'utf-8');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`, 'utf-8');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Test server running at http://localhost:${PORT}/`);
  console.log(`\nServing:`);
  console.log(`  - http://localhost:${PORT}/               -> test-embed/index.html`);
  console.log(`  - http://localhost:${PORT}/score-editor/  -> out/ (embedded build)`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
