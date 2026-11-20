# hello-marsl

A dependency-free Node.js HTTP example with a health endpoint, runnable container, and step-by-step guide.

Published by Raphael Terrier with MARSL.

## Run this release

```sh
docker pull ghcr.io/render-lab/marsl-hello-marsl-94b8ca71-dad8-41d3-88fa-df4e859b534d:1.0.0
```

Follow [the how-to](HOWTO.md) for runtime arguments, ports, configuration, and expected output. Supply your own credentials at runtime.

## Included

- [Project README](src/README.md)
- [Step-by-step how-to](HOWTO.md)
- [Source](src/) and [container build recipe](Dockerfile)
- [License](LICENSE)

## Build it yourself

From this release directory:

```sh
docker build -f Dockerfile -t ghcr.io/render-lab/marsl-hello-marsl-94b8ca71-dad8-41d3-88fa-df4e859b534d:1.0.0 src
```

Documentation is included in the image at /usr/share/doc/marsl/.

## Version and evidence

Version: 1.0.0

Source digest: `5349cad14a20dffe5bc15de0c5cbad96d7fc59f7614952de26045c84e780c57d`

The selected source built and started in a MARSL preview. That does not verify this container or every instruction. GitHub builds the container after internal review; inspect the linked build results and the project documentation for additional evidence.
