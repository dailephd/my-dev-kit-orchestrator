# my-dev-kit-orchestrator

`my-dev-kit-orchestrator` is a CLI-first tool for guiding coding agents through
design-first software work. It turns a request into a sequence of bounded stage
prompts, records each stage's artifact on disk, and keeps implementation,
testing, verification, and judge review connected to the same design.

The package is `@dailephd/my-dev-kit-orchestrator`, and the installed executable
is `my-dev-kit-orchestrator`.

## What it helps you do

- Start and resume inspectable workflow runs.
- Choose a workflow mode for feature, repair, test, refactor, hardening,
  extraction, or greenfield work.
- Generate the prompt for the current stage instead of one large master prompt.
- Track artifact state and deterministic check results.
- Route judge findings back to the appropriate correction stage.
- Export a portable run handoff.
- Guide a new project from an idea through a first verified vertical slice and
  an initial `my-dev-kit` indexing handoff.

## Current release

The latest published package is
`@dailephd/my-dev-kit-orchestrator@1.2.0`. See [CHANGELOG.md](CHANGELOG.md) for
release history and [docs/ROADMAP.md](docs/ROADMAP.md) for planned work.

The release supports seven workflow modes:

- `feature`
- `repair`
- `test`
- `refactor`
- `harden`
- `extraction`
- `greenfield`

## Quick start

Prerequisite: a supported Node.js installation with npm.

Run the published package without installing it globally:

```bash
npx @dailephd/my-dev-kit-orchestrator init
npx @dailephd/my-dev-kit-orchestrator start "Add audit logging"
npx @dailephd/my-dev-kit-orchestrator prompt
```

The CLI creates `.my-dev-kit-orchestrator/` in the project. Each workflow run
contains its request, metadata, stage prompts, artifacts, and reports. Give the
generated stage prompt to a coding agent, save the requested artifact, and run
`prompt` again to continue.

To work from this repository instead:

```bash
npm install
npm run build
node dist/cli.js init
node dist/cli.js start "Add audit logging"
node dist/cli.js prompt
```

See [docs/USAGE.md](docs/USAGE.md) for complete command syntax and
[docs/WORKFLOWS.md](docs/WORKFLOWS.md) for mode selection and stage procedures.

## Greenfield starter profiles

The `greenfield` mode supports these starter profiles:

- `typescript-cli`
- `nextjs-app`
- `android-compose`

Greenfield remains prompt-guided. The CLI records the selected profile and
generates planning guidance; it does not generate and build an application on
its own. After code exists, the `initial-index` stage guides the first
`my-dev-kit` index.

The Android Compose profile describes Kotlin, Jetpack Compose, Gradle project
structure, scaffold targets, and validation commands. The orchestrator does
not run Gradle, require the Android SDK, or check for a device or emulator.
Generic requests such as "mobile app" remain unresolved instead of defaulting
to Android Compose. iOS, Flutter, React Native, and a general-purpose mobile
mode are not supported.

## Command overview

```text
my-dev-kit-orchestrator init
my-dev-kit-orchestrator start [options] <request>
my-dev-kit-orchestrator prompt [stage]
my-dev-kit-orchestrator status
my-dev-kit-orchestrator list
my-dev-kit-orchestrator mark <artifact-name> --state <state>
my-dev-kit-orchestrator check
my-dev-kit-orchestrator export
```

See [docs/USAGE.md](docs/USAGE.md) for flags, defaults, run selection, check
variants, export options, and troubleshooting.

## Tool boundaries

- `my-dev-kit` indexes and retrieves bounded context from an existing codebase.
- `my-dev-kit-orchestrator` manages workflow stages, prompts, artifacts, checks,
  correction routing, and handoff export.
- `my-dev-kit-lab` owns experiments, audits, security validation, and
  release-readiness evidence.

These integrations are explicit and prompt-guided. The orchestrator does not
autonomously run coding agents, `my-dev-kit`, security validation, publishing,
or release workflows.

## Current limitations

- Checks validate artifact structure and trace relationships; they do not prove
  runtime correctness.
- Component documents remain empty until the brief schema supplies module or
  component hints.
- Tests currently use both `src/__tests__/*.test.ts` and `tests/**/*.spec.ts`.
- The mobile and autonomous-execution boundaries described above remain in
  effect.

## Planned: v1.2.1 (workflow-instruction and context-refresh integration)

**Status: planned, not implemented, not published.** `v1.2.1` is a bounded
patch after the current `1.2.0` release. Nothing described in this section
exists in the current release; see
[docs/ROADMAP.md](docs/ROADMAP.md#v121-planned) for the full plan and
candidate implementation batches.

Planned scope:

- a structured workflow catalog owned by `my-dev-kit-orchestrator`, with
  stable IDs for workflows, stages, commands, rules, and report contracts
- deterministic, exact-ID reference resolution (no fuzzy or semantic
  workflow selection)
- a `WorkflowInstructionPacket` that bounds each generated stage prompt to
  only the instructions that stage needs, instead of every instruction
  category the current prompt generator can produce
- supplemental, optional implementation-context and test-context artifacts
  consumed inside the existing `implementation` and `test-implementation`
  stages
- manual freshness rules (`fresh` / `stale` / `unknown`) for that
  supplemental context, since the orchestrator has no automatic
  `my-dev-kit` invocation or content-hash staleness tracking today
- full compatibility with existing runs, modes, stage order, artifact
  files, and lifecycle behavior

`v1.2.1` does not add a native implementation-context or test-context
stage, does not invoke `my-dev-kit` automatically, and does not change the
native stage count for any workflow mode. Integration with `my-dev-kit` and
`my-dev-kit-lab` is planned as a manual, prompt-guided step, the same way
the existing architecture-context stage works today.

## Documentation

- [Usage and command reference](docs/USAGE.md)
- [Workflow modes and stage procedures](docs/WORKFLOWS.md)
- [Artifact contracts and lifecycle](docs/ARTIFACTS.md)
- [Architecture and subsystem boundaries](docs/ARCHITECTURE.md)
- [Contributor setup and validation](docs/DEVELOPMENT.md)
- [Release history](CHANGELOG.md)
- [Roadmap](docs/ROADMAP.md)
