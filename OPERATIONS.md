# Collection operations

Status: initial implementation; local validation does not establish a live release.

## Enable publication

A MARSL administrator configures `MARSL_PACKAGES_ENABLED=true` and `MARSL_PACKAGES_GITHUB_TOKEN` on the web and workflow services. The credential must be restricted to this repository, with Contents and Pull requests write and Actions read permissions. It is a platform collection grant, separate from a user's project repository connection. Keep it in the service's secret store and outside all project sandboxes and image builds. A short-lived credential resolver is a future improvement over this static service token.

Deploy the MARSL package-release migration and `publish-package` workflow before enabling the feature. The token must be able to read this repository's internal visibility. Ordinary project ownership authorizes preparation and submission only within the server-assigned project directory.

GitHub Actions needs permission to create GHCR packages and GitHub releases. Container access must remain internal or private. Verify package access after the first release; repository access and package visibility are distinct settings. The workflow refuses a public collection and checks the resulting package remains non-public.

Protect the default branch with required maintainer review. Check organization rules for workflows and package creation before the first release. This repository scaffold does not claim those organization settings are configured.

## Recovery

MARSL checkpoints the base commit, package commit, and pull request. A retry reuses the same branch and reconciles an uncertain GitHub response. If someone changes that branch, MARSL refuses to overwrite it.

Rerun a failed release workflow from its original commit. The registry step reuses a matching existing image digest instead of overwriting a version. GitHub release metadata records the source hash, complete bundle hash, image, and digest. MARSL only displays Published when these match its saved review and the PR's merged commit.

Removing a MARSL project or unsharing its public MARSL page does not remove this repository's source or GHCR images. GitHub retention and deletion are separate maintainer operations.

## Live acceptance still required

Use a synthetic project with a reviewed license and no private data. Record its MARSL source ID, bundle hash, PR, merge commit, Actions run, image digest, and actual runtime result. Verify a second enterprise account can read the repository and pull the intended image while an unauthorized account cannot. Retry after a deliberately interrupted submission and release. These checks have not been run by this scaffold.
