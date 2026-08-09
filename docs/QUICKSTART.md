# Quickstart

## Prerequisites

- Node.js 24 or later
- npm
- a project directory in which `.my-dev-kit-orchestrator/` may be created

## Shortest successful run

From the target project:

```bash
npx @dailephd/my-dev-kit-orchestrator@1.3.0 init
npx @dailephd/my-dev-kit-orchestrator@1.3.0 start "Add audit logging"
npx @dailephd/my-dev-kit-orchestrator@1.3.0 prompt
```

Success means initialization creates `.my-dev-kit-orchestrator/`, `start` creates a discoverable run, and `prompt` prints/writes the first stage prompt. Give that prompt to a coding agent, save the requested artifact at the run path named by the prompt, then run `prompt` again.

Inspect without advancing work:

```bash
npx @dailephd/my-dev-kit-orchestrator@1.3.0 status
npx @dailephd/my-dev-kit-orchestrator@1.3.0 check --all
```

These commands are read-only with respect to authored stage artifacts; `check --all` may exit nonzero while expected artifacts are still missing.

For a new project, use `start --mode greenfield "<project idea>"`. Greenfield remains prompt-guided and does not scaffold code by itself.

Next, read [COMMANDS.md](COMMANDS.md) for every option and side effect, [WORKFLOWS.md](WORKFLOWS.md) for mode/stage selection, and [ARTIFACTS.md](ARTIFACTS.md) for files to save.
