'use strict';

const http = require('node:http');

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT) || 3000;

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hello publishing</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: linear-gradient(135deg, #eef2ff 0%, #f8fafc 100%);
    color: #1e293b; padding: 1.5rem;
  }
  main {
    background: #fff; max-width: 32rem; width: 100%; text-align: center;
    padding: 2.5rem 2rem; border-radius: 1rem;
    box-shadow: 0 10px 30px rgba(30, 41, 59, 0.08);
  }
  h1 { margin: 0 0 0.75rem; font-size: 2rem; letter-spacing: -0.02em; }
  p { margin: 0 0 1.75rem; line-height: 1.6; color: #475569; }
  .count { font-size: 3.5rem; font-weight: 700; color: #4f46e5; margin-bottom: 1.25rem; font-variant-numeric: tabular-nums; }
  button {
    font: inherit; font-weight: 600; color: #fff; background: #4f46e5;
    border: 0; border-radius: 0.5rem; padding: 0.75rem 1.75rem; cursor: pointer;
  }
  button:hover { background: #4338ca; }
  button:focus-visible { outline: 3px solid #a5b4fc; outline-offset: 2px; }
</style>
</head>
<body>
<main>
  <h1>Hello publishing</h1>
  <p>This is a minimal demo app used to show a publishing flow. Click the button to increment the counter; it lives only in your browser and resets on reload.</p>
  <div class="count" id="count" aria-live="polite">0</div>
  <button type="button" id="increment">Increment</button>
</main>
<script>
  (function () {
    var count = 0;
    var output = document.getElementById('count');
    document.getElementById('increment').addEventListener('click', function () {
      count += 1;
      output.textContent = String(count);
    });
  })();
</script>
</body>
</html>
`;

const HEALTH = '{"ok":true}';

function send(req, res, status, type, body, extraHeaders) {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const routes = {
  '/': ['GET', 'HEAD'],
  '/health': ['GET', 'HEAD'],
};

const server = http.createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const allowed = routes[path];

  if (!allowed) {
    return send(req, res, 404, 'text/plain; charset=utf-8', 'Not Found\n');
  }
  if (!allowed.includes(req.method)) {
    return send(req, res, 405, 'text/plain; charset=utf-8', 'Method Not Allowed\n', {
      Allow: allowed.join(', '),
    });
  }
  if (path === '/health') {
    return send(req, res, 200, 'application/json', HEALTH);
  }
  return send(req, res, 200, 'text/html; charset=utf-8', PAGE);
});

server.listen(PORT, HOST, () => {
  console.log(`Hello publishing listening on http://${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  server.closeAllConnections?.();
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
