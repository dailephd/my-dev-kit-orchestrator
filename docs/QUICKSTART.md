# Quickstart

## Prerequisites

- Node.js 24 or later
- npm
- a project directory in which `.my-dev-kit-orchestrator/` may be created

## Shortest successful run

From the target project:

```bash
npx @dailephd/my-dev-kit-orchestrator@1.3.2 init
npx @dailephd/my-dev-kit-orchestrator@1.3.2 start "Add audit logging"
npx @dailephd/my-dev-kit-orchestrator@1.3.2 prompt
```

Success means initialization creates `.my-dev-kit-orchestrator/`, `start` creates a discoverable run, and `prompt` prints/writes the first stage prompt. Give that prompt to a coding agent, save the requested artifact at the run path named by the prompt, then run `prompt` again.

Inspect without advancing work:

```bash
npx @dailephd/my-dev-kit-orchestrator@1.3.2 status
npx @dailephd/my-dev-kit-orchestrator@1.3.2 check --all
```

These commands are read-only with respect to authored stage artifacts; `check --all` may exit nonzero while expected artifacts are still missing.

For a new project, use `start --mode greenfield "<project idea>"`. Greenfield remains prompt-guided and does not scaffold code by itself.

Current repository source also supports the bounded `python-cli` profile. From
a local build, start it with:

```bash
node dist/cli.js start --mode greenfield "Create a small Python CLI that prints a greeting"
```

The resulting scaffold contract includes the common `agents.txt`,
`claude.txt`, `AGENTS.md`, and `CLAUDE.md` instructions plus the Python profile
targets. A user or coding agent still creates the files and runs Python,
pytest, and `my-dev-kit`; the orchestrator does not execute them. Published
`npx` examples above remain pinned to `1.3.2` until `v1.3.3` is released.

Next, read [COMMANDS.md](COMMANDS.md) for every option and side effect, [WORKFLOWS.md](WORKFLOWS.md) for mode/stage selection, and [ARTIFACTS.md](ARTIFACTS.md) for files to save.
