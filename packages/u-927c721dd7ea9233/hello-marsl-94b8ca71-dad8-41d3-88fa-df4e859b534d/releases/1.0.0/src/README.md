# made-with-marsl — Hello MARSL

A tiny internal package-publishing and release-verification acceptance example
for **made-with-marsl**. It is a dependency-free Node.js HTTP server built only
on `node:http`.

## Endpoints

| Method | Path      | Response                                                        |
| ------ | --------- | --------------------------------------------------------------- |
| GET    | `/`       | `200 text/html` page with the heading "Hello from made-with-marsl" |
| GET    | `/health` | `200 application/json` — `{"ok":true,"example":"made-with-marsl"}` |
| GET    | other     | `404` plain text                                                |
| other  | any       | `405` plain text                                                |

`HEAD` is accepted wherever `GET` is.

The server listens on `0.0.0.0` and the port in `PORT` (default `3000`), and
shuts down cleanly on `SIGTERM` / `SIGINT`.

## Requirements

- Node.js 22 or newer
- No npm dependencies
- Docker (optional) for the container image

## Quick start

```sh
npm start
npm test
```

See [HOWTO.md](HOWTO.md) for exact local and Docker commands with expected
results.

## License

MIT — see [LICENSE](LICENSE).
