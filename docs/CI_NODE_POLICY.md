# Node validation and CI policy

**Local:** Run `npm ci`, install the latest stable Node.js release on the development machine, then use `npm run validate:local`. The command checks the current Node version against the official [Node.js release index](https://nodejs.org/dist/index.json), fails closed if the version cannot be verified, and runs `verify` (including its one build and security/lint/CLI smokes), the full tests, and a package inventory dry-run. The checker does not install Node. During active corrections, prefer focused tests rather than a repeated full local run.

**GitHub Actions:** [validate.yml](../.github/workflows/validate.yml) executes the supported **Node 24** baseline on Ubuntu, Windows, and macOS. It runs `verify` once (which already builds), the full suite once, and package/CLI smokes. The package dry-run uses `--ignore-scripts` to avoid a redundant lifecycle build.

The retired `pre-release-matrix.yml` repeated Node 24 validations and added newer-Node full-suite cells that are now owned by local latest-Node validation. Its dedicated greenfield test directory is already executed by the full Jest suite; `verify` retains the required smoke and lint contracts. Do not separately dispatch another full test matrix for the same release identity. PR and main checks can still be separate identities as required by branch policy; reuse completed evidence when the same exact source and gate are established.

GitHub CI triggers on main push and PRs targeting main; feature/release branches may request manual `workflow_dispatch` validation without triggering duplicate push-plus-PR matrices. Release/merge/tag/npm authorization remains a separate workflow.
