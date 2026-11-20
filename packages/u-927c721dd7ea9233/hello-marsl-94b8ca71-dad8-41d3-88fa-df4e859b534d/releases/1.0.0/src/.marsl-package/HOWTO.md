# HOWTO

All commands run from the repository root. Requires Node.js 22+.

## Run locally

```sh
npm start
```

Expected: the server logs

```
made-with-marsl listening on http://0.0.0.0:3000
```

In another terminal:

```sh
curl -i http://localhost:3000/
```

Expected: `HTTP/1.1 200 OK`, `Content-Type: text/html; charset=utf-8`, and an
HTML body containing `<h1>Hello from made-with-marsl</h1>`.

```sh
curl -s http://localhost:3000/health
```

Expected output (exactly):

```
{"ok":true,"example":"made-with-marsl"}
```

An unknown path such as `curl -i http://localhost:3000/nope` returns
`HTTP/1.1 404 Not Found`. Stop the server with `Ctrl+C`.

## Custom port

```sh
PORT=8080 npm start
```

Expected: `made-with-marsl listening on http://0.0.0.0:8080`; use
`http://localhost:8080/` and `http://localhost:8080/health` for the curl checks.

## Tests

```sh
npm test
```

Expected: all tests pass (`# pass 4`, `# fail 0`).

## Docker

```sh
docker build -t made-with-marsl .
```

Expected: the build completes and tags the image `made-with-marsl`.

```sh
docker run --rm -p 3000:3000 made-with-marsl
```

Expected: `made-with-marsl listening on http://0.0.0.0:3000`. Then run the same
checks:

```sh
curl -i http://localhost:3000/        # 200, HTML containing "Hello from made-with-marsl"
curl -s http://localhost:3000/health  # {"ok":true,"example":"made-with-marsl"}
```

Custom port in the container:

```sh
docker run --rm -e PORT=8080 -p 8080:8080 made-with-marsl
```

Expected: `made-with-marsl listening on http://0.0.0.0:8080`; the same curl
checks succeed against `http://localhost:8080`. Stop the container with
`Ctrl+C` (the server handles `SIGINT`/`SIGTERM`).
