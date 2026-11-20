'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { start } = require('../server.js');

let server;
let base;

before(async () => {
  server = await start(0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('GET / returns the greeting page', async () => {
  const res = await fetch(`${base}/`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/html/);
  assert.ok((await res.text()).includes('Hello from made-with-marsl'));
});

test('GET /health returns exact JSON', async () => {
  const res = await fetch(`${base}/health`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/json/);
  assert.strictEqual(await res.text(), '{"ok":true,"example":"made-with-marsl"}');
});

test('unknown path returns 404', async () => {
  const res = await fetch(`${base}/nope`);
  assert.strictEqual(res.status, 404);
  await res.text();
});

test('non-GET method returns 405', async () => {
  const res = await fetch(`${base}/`, { method: 'POST' });
  assert.strictEqual(res.status, 405);
  await res.text();
});
