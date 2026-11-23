# Collection operations

Status: public publishing active and live-verified on November 23, 2026. The three legacy image packages and shared collection package are public. Earlier internal-release evidence is recorded below.

## Enable publication

A MARSL administrator configures `MARSL_PACKAGES_ENABLED=true` and `MARSL_PACKAGES_GITHUB_TOKEN` on the web and workflow services. The credential must be restricted to this repository, with Contents and Pull requests write and Actions read permissions. It is a platform collection grant, separate from a user's project repository connection. Keep it in the service's secret store and outside all project sandboxes and image builds. A short-lived credential resolver is a future improvement over this static service token.

Deploy the MARSL package-release migration and `publish-package` workflow before enabling the feature. The token must be able to read this repository's public visibility. Ordinary project ownership authorizes preparation and submission only within the server-assigned project directory.

GitHub Actions needs permission to write GHCR packages and GitHub releases. Run **Initialize public image collection** once to copy the pinned Hello MARSL example into `ghcr.io/render-lab/made-with-marsl:bootstrap`. In GitHub's package settings, make that container package public. Repository visibility does not change existing package visibility. Make the legacy per-project container packages public separately to preserve their addresses.

The organization’s public-package creation permission was enabled temporarily to change these four packages, then restored to disabled. Private package creation and inherited access were retained. Do not leave organization-wide public package creation enabled for normal MARSL releases.

New releases add distinct project/version tags to the existing public collection package. The release job checks public visibility before upload, verifies immutable identity on retries, and downloads every layer without credentials before writing GitHub release evidence. A missing or non-public destination fails closed. The build job never receives publishing credentials.

Schema 2 manifests declare public visibility, bound into the reviewed bundle hash. MARSL requires explicit public confirmation; old internal reviews must be prepared again using a new version. Schema 1 is accepted only for an explicit historical workflow retry, preserving its original image address and evidence.

The collection's default branch requires one approving review and disallows force pushes and deletion. Administrators retain bypass. The first example was reviewed and merged with that bypass because the submission token acts as the same user. Actions and package creation are enabled.

## Recovery

MARSL checkpoints the base commit, package commit, and pull request. A retry reuses the same branch and reconciles an uncertain GitHub response. If someone changes that branch, MARSL refuses to overwrite it.

Rerun a failed release workflow from its original commit. If the workflow itself needed a fix, run **Build and release images** manually on the default branch with `release_commit` set to the full original merge SHA. The current trusted validator accepts only commits in default-branch history; build checkout and release evidence stay pinned to that original commit. The registry step reuses a matching existing image digest instead of overwriting a version. GitHub release metadata records the source hash, complete bundle hash, image, and digest. MARSL only displays Published when these match its saved review and the PR's merged commit.

Removing a MARSL project or unsharing its public MARSL page does not remove this repository's source or GHCR images. GitHub retention and deletion are separate maintainer operations.

## Public release acceptance, November 23, 2026

[Hello Publishing 1.0.2](https://github.com/render-lab/made-with-marsl/releases/tag/marsl-d11c403d-3f55-46aa-8069-ec693fec1fc4) published after the organization restriction was restored. [Run 45162847133](https://github.com/render-lab/made-with-marsl/actions/runs/45162847133) passed against original merge `d42fd5aed5a346977a539ec803bc00878f542967`. The public image is `ghcr.io/render-lab/made-with-marsl@sha256:7b96cf9bc319aef89eae56e71bc60d1372e4d131d94216f9e3b344094d0a465c`.

Anonymous Docker pulls passed for all three legacy images and this new release. Independent anonymous HTTP downloads verified every manifest, config and layer for those images and the shared bootstrap image. The new image ran as UID 1000 on ports 3000 and 8080; its README, HOWTO, LICENSE and both screenshots matched the reviewed bundle. MARSL showed Published after reload.

For an anonymous Docker check, use a temporary config containing `{"auths":{"ghcr.io":{}}}` with no credential helper. An empty auth map can trigger automatic native helper discovery. The workflow independently uses Skopeo’s `--src-no-creds` to download every layer before recording evidence.

## Earlier internal release acceptance

The synthetic [Hello MARSL example](https://marsl.dev/projects/94b8ca71-dad8-41d3-88fa-df4e859b534d) was submitted through the hosted UI as [PR #1](https://github.com/render-lab/made-with-marsl/pull/1), merged at `cad01076f8a109e4882502ecba605907e8951412`. Its source digest is `5349cad14a20dffe5bc15de0c5cbad96d7fc59f7614952de26045c84e780c57d`; its bundle digest is `56c13aebbdf24cd8a0a3c6e9247be1ba42066d86ae55f08d0c81586d6f3c1c67`.

[Release evidence](https://github.com/render-lab/made-with-marsl/releases/tag/marsl-0ed89854-9197-44a0-b78b-f58a4b0cc2f3) records image digest `sha256:891980e77564d01b2353f2048407d5f55359374479880691a2378cdf1ad9e461`. The initial publication failed before upload because of an empty registry auth JSON file. After the workflow repair, run `44772421406` released the original merge; repeat run `44772982559` preserved the same digest and single version tag.

Owner-authenticated pulls passed; anonymous registry requests and Docker pulls were denied. The private Linux amd64 image ran as UID 1000 and served the expected greeting and health JSON on ports 3000 and 8080. Bundled README, HOWTO and LICENSE matched the reviewed files. MARSL displayed Published after a full reload.

Second-enterprise-account access and recovery after deliberately terminating the submission worker remain unverified. A successful release retry does not establish arbitrary worker resumability.
