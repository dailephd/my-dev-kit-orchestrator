# CI/CD

## Automation boundary

The repository has continuous integration and pre-release validation. It does not have automated npm publication, tag creation, GitHub Release creation, or continuous deployment.

## Validate workflow

`.github/workflows/validate.yml` runs for pushes to `main`, `feature/**`, `release/**`, `fix/**`, and `docs/**`, and for pull requests to `main`.

The matrix is Ubuntu latest, Windows latest, and macOS 15 on Node 24. Each job performs:

1. checkout and cached `npm ci`;
2. build;
3. full Jest tests;
4. `npm run verify` (typecheck, build, source lint, Markdown lint, docs consistency, security tests, and CLI smoke families);
5. built CLI help and version smoke;
6. `npm pack --dry-run`.

Any failed step fails that matrix job. Matrix `fail-fast` is disabled so all platforms report.

## Pre-release matrix

`.github/workflows/pre-release-matrix.yml` runs on `release/**` pushes or manual dispatch across Windows, macOS 15, and Ubuntu with Node 24 and 26. It adds focused greenfield tests and release-candidate checks before package dry-run. Node 24 is the supported baseline; Node 26 is supplementary readiness evidence.

## Artifacts and publishing

These workflows do not publish the package or create release artifacts beyond command output. npm publication remains a separately authorized maintainer action after the gates in [RELEASE.md](RELEASE.md). Contributor validation is documented in [DEVELOPMENT.md](DEVELOPMENT.md).
