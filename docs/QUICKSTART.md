# Quickstart

## Prerequisites

- Node.js 24 or later
- npm
- a project directory in which `.my-dev-kit-orchestrator/` may be created

## Shortest successful run

From the target project:

```bash
npx @dailephd/my-dev-kit-orchestrator@1.7.0 init
npx @dailephd/my-dev-kit-orchestrator@1.7.0 start "Add audit logging"
npx @dailephd/my-dev-kit-orchestrator@1.7.0 prompt
```

Success means initialization creates `.my-dev-kit-orchestrator/`, `start` creates a discoverable run and its prompt templates, and `prompt` prints the live first-stage instructions. Give those instructions to a coding agent, save the requested artifact at the run path named by the prompt, then run `prompt` again.

Inspect without advancing work:

```bash
npx @dailephd/my-dev-kit-orchestrator@1.7.0 status
npx @dailephd/my-dev-kit-orchestrator@1.7.0 check --all
```

These commands preserve authored stage artifacts. Loading a run may update derived `currentStage` and `status` fields in `run.json` from existing artifact and gate state; checks may also save their result reports. `check --all` may exit nonzero while expected artifacts are still missing.

New staged runs in every mode except `greenfield` also ask the coding agent to carry stable responsibility IDs through implementation, tests, and verification; proof-only runs are exempt. Nothing extra is required to start, and there is no flag for it. `--mode` selects the workflow as usual.

For a new project, use `start --mode greenfield "<project idea>"`. Greenfield remains prompt-guided and does not scaffold code by itself.

The current release supports the bounded `python-cli` profile. Start it with
the installed CLI:

```bash
npx @dailephd/my-dev-kit-orchestrator@1.7.0 start --mode greenfield "Create a small Python CLI that prints a greeting"
```

The resulting scaffold contract includes the common `agents.txt`,
`claude.txt`, `AGENTS.md`, and `CLAUDE.md` instructions plus the Python profile
targets. A user or coding agent still creates the files and runs Python,
pytest, and `my-dev-kit`; the orchestrator does not execute them. The published
`npx` examples above are pinned to `1.7.0`.

Optional, since `v1.7.0`: a run can be explicitly activated for ecosystem evidence with `npx @dailephd/my-dev-kit-orchestrator@1.7.0 start "<request>" --ecosystem-requirements "<requirements.json>"`, and `status --json` / `check --json` print versioned inspection JSON. Releases before `1.7.0` do not include these options; see [USAGE.md](USAGE.md) and [CONTRACTS.md](CONTRACTS.md) for the exact supported producer versions and subject constraints.

Next, read [COMMANDS.md](COMMANDS.md) for every option and side effect, [WORKFLOWS.md](WORKFLOWS.md) for mode/stage selection, and [ARTIFACTS.md](ARTIFACTS.md) for files to save.
