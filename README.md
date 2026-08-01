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

The current release is
`@dailephd/my-dev-kit-orchestrator@1.2.3`. See [CHANGELOG.md](CHANGELOG.md) for
release history and [docs/ROADMAP.md](docs/ROADMAP.md) for planned work.

`v1.2.3` ships run-integrity and judge-verdict enforcement on top of the
`v1.2.2` context-readiness safeguards. It is compatible with the released
`@dailephd/my-dev-kit@1.10.4` producer contract and requires Node.js 24 or
later. See [docs/ROADMAP.md](docs/ROADMAP.md#published-v123) for its scope.

## Run-integrity enforcement (v1.2.3)

A one-time producer-adequacy defect let a repository-context-blocked run
reach a normal `PASS` final report. `v1.2.3` closes that gap with one
canonical run-integrity decision that every readiness-sensitive command
consults instead of recomputing readiness itself:

- optional evidence truncation still does not block a stage, but an actual
  lost required-condition witness does, independently of general truncation;
- an authored judge `Verdict: PASS` is rejected whenever canonical readiness
  still requires `NEED_CONTEXT`, and routes back to the exact blocked stage
  rather than clearing correction state;
- a normal final report requires an accepted `PASS` verdict with no active
  correction and no remaining readiness blocker -- artifact presence, a
  manual `complete` mark, or an otherwise structurally valid final-report
  file cannot substitute for that;
- `status`, `check`, `check --all`, `prompt`, `mark`, and `export` all read
  the same canonical decision, so none of them can disagree about whether a
  run is ready, blocked, or eligible for a final report.

Legacy runs, schema-major-1 producer evidence, `greenfield`'s exemption from
repository-context requirements, and existing correction routing for
non-context judge verdicts all remain compatible.

The current release supports seven workflow modes:

- `feature`
- `repair`
- `test`
- `refactor`
- `harden`
- `extraction`
- `greenfield`

## Workflow instruction and context readiness

The `v1.2.1` release adds a typed workflow-instruction catalog with
stable workflow, stage, command, rule, and report-contract IDs. Every one of
the 79 native stages receives an exact, deterministic
`WorkflowInstructionPacket` and an instruction-packet sidecar. Supplemental
implementation and test context can be supplied through fixed run files and
evaluated for structure, provenance, freshness, adequacy, required-evidence
truncation, and critical test-responsibility mappings.

Repository retrieval remains manual. The orchestrator does not execute `my-dev-kit`:
a user or coding agent must run a verified `my-dev-kit` CLI,
populate the supplemental context packet and retrieval report, and reference
the raw evidence. A context-sensitive direct-stage prompt becomes a
refresh-only prompt while required context is blocked; normal implementation
or test work resumes after context readiness passes. `status`, `check`, and
`export` expose the resulting readiness state, and judge review uses the
existing `NEED_CONTEXT` verdict with an exact `Recommended next stage`.

Current source makes every refresh-required result actionable and consistent.
It selects one deterministic primary blocker, preserves ordered blocking and
supporting issue codes, and carries the primary reason, corrective action, and
evidence target through prompts, `status`, `check`, verification, judge,
correction routing, and `export`.

These additions preserve the eight-command CLI surface, all seven mode stage
orders, prompt filenames, lifecycle behavior, and old runs. Supplemental
context files and instruction-packet sidecars are not native lifecycle
artifacts. `TaskState` and `StageContextBundle` are assembled in memory and
are not persisted.

## Quick start

Prerequisite: Node.js 24 or later with npm.

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

The CLI has eight commands:

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
- The `scaffold-plan` and `scaffold-implementation` stages retain their
  specialized greenfield scaffold renderer; they still receive catalog
  entries and instruction-packet sidecars.
- `status` is human-readable and has no JSON option.

## Documentation

- [Usage and command reference](docs/USAGE.md)
- [Workflow modes and stage procedures](docs/WORKFLOWS.md)
- [Artifact contracts and lifecycle](docs/ARTIFACTS.md)
- [Architecture and subsystem boundaries](docs/ARCHITECTURE.md)
- [Contributor setup and validation](docs/DEVELOPMENT.md)
- [Release history](CHANGELOG.md)
- [Roadmap](docs/ROADMAP.md)
- [Documentation preservation policy](docs/DOCUMENTATION_PRESERVATION_POLICY.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
