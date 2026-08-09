# Release

This is the canonical maintainer release procedure. [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) remains the detailed historical and smoke checklist.

## Prerequisites and authorization

A release requires explicit authorization, a clean candidate branch, npm/GitHub authentication, and agreement on the target version. Documentation work alone does not authorize a version bump, tag, GitHub Release, or publication.

## Readiness gates

Before opening a release pull request:

```bash
npm ci
npm run verify
npm test -- --runInBand
node dist/cli.js --version
node dist/cli.js --help
npm pack --dry-run
git diff --check
```

Run relevant temporary-directory and profile smoke checks from [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Verify package contents contain intended runtime/docs files and exclude local plans, run state, reports, and secrets.

## Version and documentation finalization

Update `package.json` and both lockfile version fields together. Update `CHANGELOG.md`, current release claims, and roadmap lifecycle status without moving future scope or inserting batch logs. Run documentation checks after finalization.

## Pull request and tag policy

Use a `release/<version>` branch and pull request to `main`. Require the configured CI matrix and review. After merge, verify the exact main commit, create annotated/lightweight tag `v<version>` according to repository practice at that commit, push the tag, and create a matching GitHub Release. Do not retag or force-push a published release.

## npm publication

Run `npm pack --dry-run` immediately before publication. Verify npm authentication and that the version is absent. Publish the public scoped package only through an explicitly authorized maintainer command:

```bash
npm publish --access public
```

Passkey/interactive authentication remains human-owned.

## Post-publication verification

Verify `npm view @dailephd/my-dev-kit-orchestrator version`, package installation/`npx --version`, Git tag, GitHub Release, and the published package inventory. Confirm npm `latest` points to the intended release. Record evidence separately; do not rewrite historical checklists as if they were execution logs.

Security and documentation preservation requirements remain defined in [SECURITY.md](SECURITY.md) and [DOCUMENTATION_PRESERVATION_POLICY.md](DOCUMENTATION_PRESERVATION_POLICY.md).
