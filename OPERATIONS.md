# Collection operations

Status: active. The Hello MARSL 1.0.0 release passed hosted submission, publication, authenticated pull and runtime checks on November 20, 2026.

## Enable publication

A MARSL administrator configures `MARSL_PACKAGES_ENABLED=true` and `MARSL_PACKAGES_GITHUB_TOKEN` on the web and workflow services. The credential must be restricted to this repository, with Contents and Pull requests write and Actions read permissions. It is a platform collection grant, separate from a user's project repository connection. Keep it in the service's secret store and outside all project sandboxes and image builds. A short-lived credential resolver is a future improvement over this static service token.

Deploy the MARSL package-release migration and `publish-package` workflow before enabling the feature. The token must be able to read this repository's internal visibility. Ordinary project ownership authorizes preparation and submission only within the server-assigned project directory.

GitHub Actions needs permission to create GHCR packages and GitHub releases. Container access must remain internal or private. Verify package access after the first release; repository access and package visibility are distinct settings. The workflow refuses a public collection and checks the resulting package remains non-public.

The collection's default branch requires one approving review and disallows force pushes and deletion. Administrators retain bypass. The first example was reviewed and merged with that bypass because the submission token acts as the same user. Actions and package creation are enabled.

## Recovery

MARSL checkpoints the base commit, package commit, and pull request. A retry reuses the same branch and reconciles an uncertain GitHub response. If someone changes that branch, MARSL refuses to overwrite it.

Rerun a failed release workflow from its original commit. If the workflow itself needed a fix, run **Build and release images** manually on the default branch with `release_commit` set to the full original merge SHA. The current trusted validator accepts only commits in default-branch history; build checkout and release evidence stay pinned to that original commit. The registry step reuses a matching existing image digest instead of overwriting a version. GitHub release metadata records the source hash, complete bundle hash, image, and digest. MARSL only displays Published when these match its saved review and the PR's merged commit.

Removing a MARSL project or unsharing its public MARSL page does not remove this repository's source or GHCR images. GitHub retention and deletion are separate maintainer operations.

## Live acceptance

The synthetic [Hello MARSL example](https://marsl.dev/projects/94b8ca71-dad8-41d3-88fa-df4e859b534d) was submitted through the hosted UI as [PR #1](https://github.com/render-lab/made-with-marsl/pull/1), merged at `cad01076f8a109e4882502ecba605907e8951412`. Its source digest is `5349cad14a20dffe5bc15de0c5cbad96d7fc59f7614952de26045c84e780c57d`; its bundle digest is `56c13aebbdf24cd8a0a3c6e9247be1ba42066d86ae55f08d0c81586d6f3c1c67`.

[Release evidence](https://github.com/render-lab/made-with-marsl/releases/tag/marsl-0ed89854-9197-44a0-b78b-f58a4b0cc2f3) records image digest `sha256:891980e77564d01b2353f2048407d5f55359374479880691a2378cdf1ad9e461`. The initial publication failed before upload because of an empty registry auth JSON file. After the workflow repair, run `44772421406` released the original merge; repeat run `44772982559` preserved the same digest and single version tag.

Owner-authenticated pulls passed; anonymous registry requests and Docker pulls were denied. The private Linux amd64 image ran as UID 1000 and served the expected greeting and health JSON on ports 3000 and 8080. Bundled README, HOWTO and LICENSE matched the reviewed files. MARSL displayed Published after a full reload.

Second-enterprise-account access and recovery after deliberately terminating the submission worker remain unverified. A successful release retry does not establish arbitrary worker resumability.
