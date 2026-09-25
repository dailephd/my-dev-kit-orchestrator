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
`@dailephd/my-dev-kit-orchestrator@1.5.0`. See [CHANGELOG.md](CHANGELOG.md) for
release history and [docs/ROADMAP.md](docs/ROADMAP.md) for implementation and
planned-work status.

`v1.5.0` ships Semantic Continuity. New staged runs in `feature`, `repair`,
`test`, `refactor`, `harden`, and `extraction` activate it automatically
(there is no flag); `greenfield`, proof-only, and older runs are unaffected.
Stage prompts ask the coding agent to carry each stable
responsibility ID (`RSP-NNN`) from the test strategy through the implementation,
test, and verification reports. A critical responsibility that is not carried
through blocks the run; a noncritical gap is a visible warning. `status`,
`check`, `export`, and the judge prompt show one consistent summary, and
`mark` cannot bypass a blocker. No command, workflow mode, native stage,
dependency, or persisted state was added, and `my-dev-kit` is still run
manually. See [docs/WORKFLOWS.md](docs/WORKFLOWS.md#semantic-continuity-prompt-contract)
and [docs/CONTRACTS.md](docs/CONTRACTS.md) for details.

`v1.4.1` corrects the installed greenfield instruction surface for five stage
prompts (`idea-brief`, `starter-profile`, `bootstrap-bundle`, `project-docs`,
and `scaffold-plan`): installed coding-agent prompts no longer depend on
Orchestrator-maintainer source paths, and required artifact/behavior/
validation/stop-condition/profile guidance remains explicit. No CLI command,
workflow mode, native stage, or package dependency was added.

`v1.4.0` ships phase-aware readiness, explicit proof-only verification,
lifecycle and trace corrections, and a dependency-free bounded Observer v0.6
evidence consumer. Fresh pushed Observer v0.6 artifacts have been validated
against the maintained consumer; no current three-repository Lab replay is
claimed.

`v1.3.3` ships one common coding-agent instruction bootstrap for every
greenfield profile and the bounded fourth starter profile, `python-cli`. The
common outputs are `agents.txt`, `claude.txt`, `AGENTS.md`, and `CLAUDE.md`;
they remain generated-project instructions rather than native run artifacts or
members of the standardized 15-file public project-document baseline. Python
support is limited to CLI projects and reuses the existing profile, scaffold,
evidence, readiness, and generic `initial-index` architecture. The orchestrator
does not execute Python, project commands, coding agents, or `my-dev-kit`.

The release retains `v1.3.2`'s structured greenfield artifact correction,
`v1.3.1`'s standardized documentation and full-stack Next.js environment,
`v1.3.0`'s profile/scaffold verification, `v1.2.3`'s run-integrity enforcement,
and `v1.2.2`'s context-readiness safeguards. It requires Node.js 24 or later. See
[docs/ROADMAP.md](docs/ROADMAP.md#v133---python-cli-greenfield-profile-and-coding-agent-instruction-bootstrap)
for the delivered scope.

`v1.3.3` preserves the eight-command CLI surface and seven workflow modes, and
supports four starter profiles (`typescript-cli`, `nextjs-app`,
`android-compose`, and `python-cli`) -- there is no `nextjs-fullstack` profile and no
`--project-type`/`--framework`/`--profile` CLI flag. The orchestrator still
never executes Docker, PostgreSQL, Prisma, or any other project command
itself.

## Greenfield profile and scaffold verification

`v1.3.0` added shared profile and registry validation, explicit command and
documentation contracts, exact and bounded-pattern scaffold-target
expectations with path safety, scaffold-plan and persisted-scaffold-plan
validation, layered generated-file and verification-command evidence, and
first-vertical-slice readiness. That architecture now applies to all four
current profiles. `status` and `check`/`check --all` surface the result using the
existing deterministic issue model. A run created before the validation
existed receives explicit legacy compatibility treatment rather than being
retroactively failed. The v1.3.0 validation change itself added no profile,
CLI command, workflow mode, or native stage, and executes no project command.
See [docs/ROADMAP.md](docs/ROADMAP.md#published-v130).

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
npm ci
npm run build
node dist/cli.js init
node dist/cli.js start "Add audit logging"
node dist/cli.js prompt
```

See [docs/COMMANDS.md](docs/COMMANDS.md) for complete command syntax and
[docs/WORKFLOWS.md](docs/WORKFLOWS.md) for mode selection and stage procedures.

## Greenfield starter profiles

The `greenfield` mode supports these starter profiles:

- `typescript-cli`
- `nextjs-app`
- `android-compose`
- `python-cli`

Greenfield remains prompt-guided. The CLI records the selected profile and
generates planning guidance; it does not generate and build an application on
its own. After code exists, the `initial-index` stage guides the first
`my-dev-kit` index.

Every current profile's effective scaffold contract includes four common
coding-agent instruction outputs: `agents.txt`, `claude.txt`, `AGENTS.md`, and
`CLAUDE.md`. They are generated-project instructions, distinct from the
standardized 15-file public canonical project-document baseline. The lower-case
manuals derive from one normalized project-instruction model; the upper-case
files are small deterministic adapters.

The bounded `python-cli` profile targets `pyproject.toml`, `src/main.py`,
`tests/test_main.py`, and `README.md`, with Python compile, pytest, and CLI help
guidance. Explicit Python CLI intent is supported; bare Python or Python
web/API/server intent remains unresolved rather than being guessed. The
orchestrator does not install dependencies or execute Python commands.

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

See [docs/COMMANDS.md](docs/COMMANDS.md) for flags, defaults, run selection,
check variants, export options, and troubleshooting.

## Tool boundaries

- `my-dev-kit` indexes and retrieves bounded context from an existing codebase.
- `my-dev-kit-orchestrator` manages native stages, prompts, artifacts, checks,
  correction routing, and handoff export.
- `my-frontend-observer` produces rendered browser evidence, comparisons,
  frontend contracts, and explicit reference-fidelity evidence.
- `my-dev-kit-lab` owns experiments, audits, security validation, and
  release-readiness evidence.

These integrations are explicit and prompt-guided. The orchestrator does not
autonomously run coding agents, `my-dev-kit`, Observer, security validation,
publishing, or release workflows.

Cross-tool documentation is centralized in the
[ecosystem guide in my-dev-kit](https://github.com/dailephd/my-dev-kit/blob/main/docs/ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md), including its [command-surface compatibility map](https://github.com/dailephd/my-dev-kit/blob/main/docs/ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md#915-command-surface-compatibility-map).
The local duplicate is intentionally untracked and ignored. The guide's
continuous full-stack recipes preserve native stage order and readiness.
They are not additional built-in modes or proof that every composition was
executed. A coding agent supplies actual application, browser, and test evidence.

## Current limitations

- Checks validate artifact structure and trace relationships; they do not prove
  runtime correctness.
- Component documents remain empty until the brief schema supplies module or
  component hints.
- Tests currently use both `src/__tests__/*.test.ts` and `tests/**/*.spec.ts`.
- The mobile and autonomous-execution boundaries described above remain in
  effect.
- `scaffold-plan` and `scaffold-implementation` retain their specialized
  greenfield scaffold renderer and still receive catalog entries and sidecars.
- `status` is human-readable and has no JSON option.
- `start --output-dir` creates a run in the requested directory, but later
  commands cannot rediscover custom-output runs in the reviewed release.
  Omit this option for a run that must be resumed through the CLI.

## Documentation

Common canonical documents:

- [Project overview](docs/PROJECT_OVERVIEW.md)
- [Current state](docs/CURRENT_STATE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Contracts](docs/CONTRACTS.md)
- [Commands](docs/COMMANDS.md)
- [Workflows](docs/WORKFLOWS.md)
- [Quickstart](docs/QUICKSTART.md)
- [Development](docs/DEVELOPMENT.md)
- [CI/CD](docs/CI_CD.md)
- [Roadmap](docs/ROADMAP.md)
- [Release](docs/RELEASE.md)
- [Security](docs/SECURITY.md)
- [Documentation preservation policy](docs/DOCUMENTATION_PRESERVATION_POLICY.md)
- [Changelog](CHANGELOG.md)

Project-specific and compatibility references:

- [Ecosystem development workflows, canonical in my-dev-kit](https://github.com/dailephd/my-dev-kit/blob/main/docs/ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md)
- [Usage compatibility guide](docs/USAGE.md)
- [Workflow modes and stage procedures](docs/WORKFLOWS.md)
- [Artifact contracts and lifecycle](docs/ARTIFACTS.md)
- [Architecture and subsystem boundaries](docs/ARCHITECTURE.md)
- [Contributor setup and validation](docs/DEVELOPMENT.md)
- [Release history](CHANGELOG.md)
- [Roadmap](docs/ROADMAP.md)
- [Documentation preservation policy](docs/DOCUMENTATION_PRESERVATION_POLICY.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
