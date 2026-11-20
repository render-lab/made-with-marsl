# Made with MARSL

Projects built with [MARSL](https://marsl.dev), packaged so someone else can run them, understand them, and build on them.

This collection publishes **public source and container images**. Anyone can read the source and pull images without a GitHub account. Each project's license governs reuse.

## What a project includes

Each release has its source, Dockerfile, README, a practical how-to, license information, and release metadata. Documentation is also included in the image at `/usr/share/doc/marsl/`.

```
packages/<author>/<project>/releases/1.0.0/
  README.md
  HOWTO.md
  LICENSE
  Dockerfile
  Dockerfile.dockerignore
  release.json
  src/
```

## Publish from MARSL

1. Open **Publish → Publish a reusable package** in your project.
2. Ask your agent to prepare the Dockerfile, README, how-to, and license information. Review the result and preview the new saved version.
3. Choose the source version and a release number. Review the documentation and included files.
4. Confirm public sharing and submit the package for maintainer review. MARSL opens a pull request here.
5. A maintainer reviews the source, license, data, and instructions before merging. GitHub builds the image and publishes it to GHCR.
6. Return to the package in MARSL and check its release status for the immutable image digest.

The integration must be enabled by a MARSL administrator. Creating this repository does not enable hosted publication by itself.

## Use a package

Open its release README and HOWTO for configuration and runtime arguments. No registry login is needed. Pull the digest recorded in its GitHub release. Supply your own runtime credentials. A successful container build alone does not prove the application or its instructions work.

## Release rules

Releases are immutable. Add a new version rather than changing an existing directory. Source and bundle digests tie each image to the reviewed files. Images target Linux amd64 in the first version.

Builds run without publishing credentials. A separate job transfers the resulting OCI image to GHCR and records the digest. No project code runs in the publishing job. New releases use `ghcr.io/render-lab/made-with-marsl:<name>-<project-id>-<version>`. This shared container package must already be public; the workflow refuses missing or non-public destinations and verifies a full anonymous pull before recording success. Existing image addresses remain valid.

See [CONTRIBUTING.md](CONTRIBUTING.md) for review and [OPERATIONS.md](OPERATIONS.md) for setup and recovery.
