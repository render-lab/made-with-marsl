'use strict';

const http = require('node:http');

const HOST = '0.0.0.0';
const HEALTH_BODY = JSON.stringify({ ok: true, example: 'made-with-marsl' });

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hello MARSL</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #f5f6f8;
    color: #1d2330;
  }
  main {
    text-align: center;
    padding: 3rem 2.5rem;
    margin: 1.5rem;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 8px 30px rgba(20, 30, 50, 0.08);
    max-width: 40rem;
  }
  h1 { margin: 0 0 0.75rem; font-size: clamp(1.6rem, 5vw, 2.25rem); letter-spacing: -0.02em; }
  p { margin: 0; color: #5b6475; line-height: 1.5; }
  code { background: #eef0f4; padding: 0.1rem 0.35rem; border-radius: 4px; }
  @media (prefers-color-scheme: dark) {
    body { background: #12151b; color: #e8ebf1; }
    main { background: #1c2028; box-shadow: none; }
    p { color: #a3abba; }
    code { background: #2a303b; }
  }
</style>
</head>
<body>
<main>
  <h1>Hello from made-with-marsl</h1>
  <p>A tiny release-verification example. Health check: <code>/health</code></p>
</main>
</body>
</html>
`;

function send(res, status, type, body, method) {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(method === 'HEAD' ? undefined : body);
}

function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return send(res, 405, 'text/plain; charset=utf-8', 'Method Not Allowed\n', req.method);
  }
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/') return send(res, 200, 'text/html; charset=utf-8', PAGE, req.method);
  if (path === '/health') return send(res, 200, 'application/json', HEALTH_BODY, req.method);
  return send(res, 404, 'text/plain; charset=utf-8', 'Not Found\n', req.method);
}

function createServer() {
  return http.createServer(handler);
}

function start(port = Number(process.env.PORT) || 3000, host = HOST) {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

module.exports = { createServer, start };

if (require.main === module) {
  start().then((server) => {
    const { address, port } = server.address();
    console.log(`made-with-marsl listening on http://${address}:${port}`);
    const shutdown = (signal) => {
      console.log(`${signal} received, shutting down`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
