# my-dev-kit-orchestrator

`my-dev-kit-orchestrator` is a CLI-first workflow tool for design-first software development with coding agents.

It keeps a software change in bounded stages instead of jumping straight from a raw request to code. A run moves through promptable stages, writes artifacts to disk, and preserves verification evidence for later review.

## Current release

The latest published package is `@dailephd/my-dev-kit-orchestrator@1.1.0`. This
repository's current source additionally includes the Android Compose
greenfield profile implemented after that release; see
[CHANGELOG.md](CHANGELOG.md) for what has shipped and what is pending the next
release.

The CLI command is:

```bash
my-dev-kit-orchestrator
```

This release includes seven workflow modes:

- `feature`
- `repair`
- `test`
- `refactor`
- `harden`
- `extraction`
- `greenfield`

## Greenfield summary

`greenfield` is the seventh mode. It is for bootstrapping a new project before useful code exists.

Greenfield is platform-neutral. It supports three starter profiles: `typescript-cli`, `nextjs-app`, and `android-compose`. Android Compose support is profile-guided planning: stack decisions, prompts, generated docs, scaffold-plan expectations, and validation-command guidance (`./gradlew build`, `./gradlew testDebugUnitTest`, and an optional device/emulator-dependent `./gradlew connectedAndroidTest`). The orchestrator does not run Gradle and does not require the Android SDK. A generic "mobile" or "mobile app" request is ambiguous and is reported as unresolved rather than silently selected; iOS, Flutter, and React Native are not supported profiles.

Greenfield stage order:

1. `idea-brief`
2. `product-boundary`
3. `stack-decision`
4. `starter-profile`
5. `bootstrap-bundle`
6. `project-docs`
7. `scaffold-plan`
8. `scaffold-implementation`
9. `first-vertical-slice`
10. `verification`
11. `initial-index`
12. `judge`
13. `final-report`

Greenfield is prompt-guided, not autonomous project generation. The CLI generates the current stage prompt, the user gives that prompt to a coding agent, and the returned artifact is saved into the run folder. After code exists, the `initial-index` stage hands the project to `my-dev-kit` for its first index.

## Command surface

```text
my-dev-kit-orchestrator init
my-dev-kit-orchestrator start "<request>"
my-dev-kit-orchestrator start --mode <feature|repair|test|refactor|harden|extraction|greenfield> "<request>"
my-dev-kit-orchestrator status
my-dev-kit-orchestrator prompt
my-dev-kit-orchestrator prompt <stage>
my-dev-kit-orchestrator list
my-dev-kit-orchestrator mark <artifact-name> --state <incomplete|blocked|complete> [--reason "<reason>"]
my-dev-kit-orchestrator check
my-dev-kit-orchestrator check --artifacts
my-dev-kit-orchestrator check --all
my-dev-kit-orchestrator export
```

Common flags:

- `--root <path>`
- `--run <run-id>`
- `--name <run-name>`
- `--output-dir <path>`

## Quick start

Install the published package:

```bash
npm install @dailephd/my-dev-kit-orchestrator
```

Or use the local build in this repository:

```bash
npm install
npm run build
node dist/cli.js --help
```

Typical workflow:

```bash
my-dev-kit-orchestrator init
my-dev-kit-orchestrator start "add audit logging to the export command"
my-dev-kit-orchestrator prompt
my-dev-kit-orchestrator status
my-dev-kit-orchestrator list
```

Greenfield example:

```bash
my-dev-kit-orchestrator start --mode greenfield "Create a sample TypeScript CLI app"
my-dev-kit-orchestrator prompt
my-dev-kit-orchestrator check --artifacts
my-dev-kit-orchestrator export
```

Android Compose greenfield example:

```bash
my-dev-kit-orchestrator start --mode greenfield "Create an Android Compose habit tracker app"
my-dev-kit-orchestrator prompt
my-dev-kit-orchestrator check --artifacts
my-dev-kit-orchestrator export
```

## Validation commands

Useful local checks for release-facing changes:

```bash
npm run docs:check
npm run lint:docs
npm run lint
npm run test:security
npx jest tests/greenfield --silent
npx tsc --noEmit
npm test
npm run build
node dist/cli.js --version
node dist/cli.js --help
npm pack --dry-run
```

## Current limitations

- Android Compose support is profile-guided planning, not an Android build runner: the orchestrator does not run Gradle, does not require the Android SDK, and does not check for a connected device or emulator
- generic mobile requests (e.g. "mobile", "mobile app") are ambiguous and reported as unresolved rather than silently mapped to a profile
- iOS, Flutter, React Native, and a general-purpose mobile mode are not supported
- the repository still has both `src/__tests__/*.test.ts` and `tests/**/*.spec.ts`
- component docs remain empty until the brief schema adds module/component hints
- the CLI does not autonomously run coding agents, security validation, or publishing workflows

## Documentation

- [docs/USAGE.md](docs/USAGE.md)
- [docs/WORKFLOWS.md](docs/WORKFLOWS.md)
- [docs/ARTIFACTS.md](docs/ARTIFACTS.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- [CHANGELOG.md](CHANGELOG.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
