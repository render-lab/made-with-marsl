# hello-publishing

A dependency-free Node.js counter demo with a health endpoint and illustrated setup instructions.

## In use

![Hello publishing page right after loading, showing the heading, the explanation and the counter at 0 above the Increment button](docs/images/hello-publishing-initial-counter-0.jpg)

![Hello publishing page after clicking Increment twice, with the counter showing 2](docs/images/hello-publishing-after-two-clicks-counter-2.jpg)

Published by Raphael Terrier with MARSL.

## Run this release

```sh
docker pull ghcr.io/render-lab/made-with-marsl:hello-publishing-9d6d4010-dace-4506-99cb-c1d1c447e025-1.0.2
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
docker build -f Dockerfile -t ghcr.io/render-lab/made-with-marsl:hello-publishing-9d6d4010-dace-4506-99cb-c1d1c447e025-1.0.2 src
```

Documentation is included in the image at /usr/share/doc/marsl/.

## Version and evidence

Version: 1.0.2

Source digest: `7aecb89b807e492e136d528d867e538de08ad4d1ede838921f4ec0be05c7c71d`

The selected source built and started in a MARSL preview. That does not verify this container or every instruction. GitHub builds the container after maintainer review and verifies an anonymous pull; inspect the linked build results and the project documentation for additional evidence.
