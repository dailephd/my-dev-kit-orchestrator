# Release Checklist

Use this checklist before treating `v0.1.0` as release-ready.

## Repository state

- working tree is clean
- current branch is the intended release-preparation branch
- implementation and documentation work are merged into `feature/v0.1.0-workflow-shell`

## Documentation

- `README.md` matches the shipped CLI behavior
- `CHANGELOG.md` includes `v0.1.0`
- `ROADMAP.md` separates `v0.1.0` from future work
- `docs/USAGE.md` matches actual command usage
- `docs/WORKFLOWS.md` matches actual workflow definitions
- `docs/ARTIFACTS.md` matches actual artifact filenames
- `docs/DEVELOPMENT.md` matches actual local commands

## Package and ignore rules

- `package.json` name, version, and `bin` entry are correct
- package contents do not accidentally include local run folders
- `.gitignore` ignores `node_modules/`, `dist/`, `coverage/`, `.my-dev-kit-orchestrator/`, log files, local env files, editor noise, and local-only internal guidance files

## CLI smoke checks

- `my-dev-kit-orchestrator --help`
- `my-dev-kit-orchestrator --version`
- `my-dev-kit-orchestrator init`
- `my-dev-kit-orchestrator start "<request>"`
- `my-dev-kit-orchestrator prompt`
- create the first expected artifact manually and confirm `prompt` advances
- `my-dev-kit-orchestrator status`
- `my-dev-kit-orchestrator list`

## Build and test checks

- `npm test`
- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`
- `npm pack --dry-run`

## Scope audit

Confirm `v0.1.0` still does not include:

- direct LLM execution
- full JSON schema validation
- automatic `my-dev-kit` execution
- automatic judge routing
- design-map generation
- extra low-level CLI commands outside `init`, `start`, `status`, `prompt`, and `list`

## Release limits

- do not tag, publish, push, or create a release unless explicitly instructed
- do not treat skipped checks as passed
- do not hide unresolved risks
