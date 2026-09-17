# Commands

This is the command reference for `@dailephd/my-dev-kit-orchestrator`. The executable is `my-dev-kit-orchestrator`. Use [WORKFLOWS.md](WORKFLOWS.md) for native stage sequences, [ARTIFACTS.md](ARTIFACTS.md) for file/schema contracts, and [USAGE.md](USAGE.md) for detailed operational examples and troubleshooting.

Cross-repository recipes are documented once in [my-dev-kit's ecosystem workflow guide](https://github.com/dailephd/my-dev-kit/blob/main/docs/ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md). The former local copy is intentionally untracked. That move adds no command, mode, stage, or automatic tool execution.

## Installation and command surface

Prerequisite: Node.js 24 or later and npm.

```bash
npx @dailephd/my-dev-kit-orchestrator --help
npx @dailephd/my-dev-kit-orchestrator --version
npm install -g @dailephd/my-dev-kit-orchestrator
my-dev-kit-orchestrator --help
```

For a local dependency, use its local executable through the project's command runner. Source contributors can run `npm ci`, `npm run build`, then `node dist/cli.js`. The installed package exposes the same eight public commands without a source checkout:

```text
init
start
status
prompt
list
mark
check
export
```

Run `<command> --help` from the actual installed version before combining options. Record the resolved package version, target root, and run identity for reproducibility. `DIRECT_IMPLEMENTATION` and `FULL_STAGE_CONTEXT` are planner workflow policies, not CLI modes.

## Shared invocation and filesystem rules

Use `--root <path>` on commands that select a project workspace, and `--run <run-id>` on run-specific commands rather than assume the most recent run is the intended one. The default run store is `.my-dev-kit-orchestrator/runs/` beneath the selected project root.

Native paths and stage identities come from the workflow registry and generated prompts. Do not invent extra native context stages. Instruction-packet sidecars and supplemental context files are not manually completable native artifacts.

The CLI generates and inspects workflow state. It does not execute a coding agent, my-dev-kit, Observer, project tests, Docker, PostgreSQL, Prisma, Gradle, security validation, or publication. A successful command can report missing/blocked work. Read the result rather than equate process completion with feature acceptance.

## init

Initialize a local workflow workspace.

```bash
my-dev-kit-orchestrator init
my-dev-kit-orchestrator init --root /path/to/project
```

Creates `.my-dev-kit-orchestrator/`, its `runs/` directory, and configuration when absent. It does not scaffold or implement a target application.

## start

Create a run from a request string.

```bash
my-dev-kit-orchestrator start "<request>"
my-dev-kit-orchestrator start --mode feature "<request>"
my-dev-kit-orchestrator start --mode repair "<observed defect>"
my-dev-kit-orchestrator start --name readable-suffix "<request>"
```

Supported options and inputs:

- `<request>`: the work request.
- `--mode <mode>`: `feature`, `repair`, `test`, `refactor`, `harden`, `extraction`, or `greenfield`. Default `feature`.
- `--name <suffix>`: readable run-name suffix.
- `--root <path>`: selected project root.
- `--source <path>` and `--target <path>`: explicit extraction repositories.
- `--output-dir <path>`: alternate run placement, with the rediscovery limitation below.
- `--proof-only`: explicit verification-only capability, not another mode.
- `--verification-responsibility <path>`: required safe run-relative proof responsibility with `--proof-only`.

Start initializes the workspace if needed, creates the run folder, writes request/run metadata, and generates the chosen workflow's prompts and applicable sidecars. The agent executes stage work externally.

### Resumable run placement

The reviewed follow-up commands do not rediscover custom `start --output-dir` runs. `prompt`, `status`, `list`, `mark`, `check`, and `export` use the default run store and do not accept `--output-dir`. Supplying `--run` does not override this limitation. Omit custom output for runs that must resume through the CLI.

### Proof-only verification

```bash
my-dev-kit-orchestrator start --proof-only --verification-responsibility artifacts/proof.txt "verify the existing migration behavior"
```

The responsibility path must be non-empty and safe. Supplying it without proof-only is invalid. An empty diff does not imply proof-only. The proof file must contain the exact line `Proof result: PASS`. Lifecycle, readiness, judge integrity, and final-report eligibility still apply.

### Extraction

```bash
my-dev-kit-orchestrator start --mode extraction --source "<source-repository>" --target "<target-repository>" "<bounded extraction request>"
```

Create the target repository first. `--create-target` is not implemented. Keep source and target indexes/evidence separate. Source remains read-only unless separately authorized. Five analysis stages produce six gate files because porting-map also writes the do-not-port list. Complete them before implementation.

### Greenfield

```bash
my-dev-kit-orchestrator start --mode greenfield "Create a Next.js web dashboard"
my-dev-kit-orchestrator start --mode greenfield "Create a small Python CLI"
```

Four profiles are supported: `typescript-cli`, `nextjs-app`, `android-compose`, and `python-cli`. A coding agent resolves the profile during `starter-profile`, not through a `start --profile` flag. There is no `--profile`, `--project-type`, or `--framework` CLI option and no `nextjs-fullstack` profile.

The bounded full-stack capability combines `fullstack-web`, `nextjs`, `nextjs-app`, PostgreSQL, Prisma, and Docker through structured brief/profile evidence. It is not automatic for every Next.js request. Bare Python and Python web/server intent do not silently map to `python-cli`. Generic mobile intent remains unresolved. Android support does not execute Gradle or require a device at Orchestrator runtime.

## prompt

Print the current or selected native stage prompt.

```bash
my-dev-kit-orchestrator prompt
my-dev-kit-orchestrator prompt behavior-model
my-dev-kit-orchestrator prompt verification --run <run-id> --root <project-root>
```

Without a stage, select the first stage whose effective state is not complete. Incomplete, stale, blocked, context-blocked, and ineligible states remain visible. Explicit selection checks predecessors and integrity rather than bypassing them. Completed runs report completion instead of another stage.

Prompt display reevaluates readiness but does not create sidecars/templates or mutate `run.json`, lifecycle state, or supplemental evidence. A blocked implementation/test stage renders refresh-only instructions rather than authorizing normal work. Correction state can select a bounded correction prompt. An ineligible explicit final-report request produces blocked guidance.

A coding agent can advance through successive authorized prompts in one session, saving actual stage evidence. It cannot collapse native stages or use a manual completion mark to skip tests.

## status

Inspect the most recent or selected run.

```bash
my-dev-kit-orchestrator status
my-dev-kit-orchestrator status --run <run-id> --root <project-root>
```

Status reports identity, request, folder, current stage, prompts, artifact lifecycle, supporting reports, implementation/test context, freshness/adequacy, blockers, and next command. Judge/final-report integrity includes expected and authored verdicts, acceptance, correction state, and eligibility.

`status` is human-readable. There is no JSON option. Do not invent `status --json`.

For selected greenfield profiles, status also surfaces scaffold/readiness evidence. It consumes the existing evaluator rather than executing project commands or proving runtime correctness.

## list

List known runs, optionally filtered by mode.

```bash
my-dev-kit-orchestrator list
my-dev-kit-orchestrator list --mode feature
my-dev-kit-orchestrator list --mode repair
```

Results include ID, mode, shortened request, status, creation time, next stage, and folder. Custom-output runs remain subject to the documented discovery limitation.

## mark

Set a native artifact's permitted lifecycle state.

```bash
my-dev-kit-orchestrator mark <artifact-name> --state <state> [--reason "<reason>"]
my-dev-kit-orchestrator mark request-brief.txt --state blocked --reason "Required product decision missing" --run <run-id>
my-dev-kit-orchestrator mark behavior-model.txt --state incomplete --reason "Edge cases missing"
my-dev-kit-orchestrator mark request-brief.txt --state complete
```

Settable states:

- `incomplete`: reason required.
- `blocked`: reason required.
- `complete`: reason optional, current gate requirements still apply.

`missing` and `stale` are computed. Do not mark sidecars, context capsules, audits, or supplemental packets as native artifacts. A complete record cannot override a blocked context or ineligible final report. Preserve the cause of a blocker instead of relabeling it.

## check

Run deterministic content, artifact, trace, context, and integrity checks.

```bash
my-dev-kit-orchestrator check
my-dev-kit-orchestrator check --artifact request-brief
my-dev-kit-orchestrator check --artifact request-brief.txt
my-dev-kit-orchestrator check --prompts
my-dev-kit-orchestrator check --artifacts
my-dev-kit-orchestrator check --trace
my-dev-kit-orchestrator check --design-map
my-dev-kit-orchestrator check --all
my-dev-kit-orchestrator check --all --strict --run <run-id> --root <project-root>
```

- `--artifact <name>` selects an artifact by stage/filename.
- `--prompts` checks generated prompts.
- `--artifacts` runs artifact contracts and applicable gates.
- `--trace` checks trace links.
- `--design-map` checks the DesignMap artifact where applicable.
- `--all` combines the supported check families.
- `--strict` treats warning conditions as failures.
- `--run` and `--root` select the run/project.

Read individual results. Default warning-only findings may exit 0. Failures exit 1. Strict mode also fails on warnings. Invalid CLI input can fail separately. A new run can have legitimate missing-artifact findings without a command crash.

Checks may persist their result reports but do not advance stages or change lifecycle state. Context blockers and rejected/malformed/unknown judge verdicts remain failures even when artifact sections are structurally valid. An accepted correction-required verdict is not itself a malformed judge result.

### Artifact contracts

Registered JSON artifacts use strict JSON/structured-field checks. Text artifacts use required sections. Shared validation does not impose text headers on JSON.

The contract vocabulary includes `CONTRACT_MISSING_FILE`, `CONTRACT_EMPTY_FILE`, `CONTRACT_MISSING_SECTION`, `CONTRACT_BLANK_SECTION`, `CONTRACT_PLACEHOLDER_SECTION`, `CONTRACT_MALFORMED_JSON`, `CONTRACT_MISSING_FIELD`, `CONTRACT_INVALID_FIELD`, `CONTRACT_PREDECESSOR_MISSING`, and `CONTRACT_STAGE_NO_CONTRACT`. See the usage guide for strict-mode distinctions and examples.

### Trace checks

IDs use `PREFIX-NNN`, with prefixes `REQ`, `CTX`, `BEH`, `INV`, `TRN`, `PSE`, `TST`, `IMP`, `VER`, and `RISK`, plus at least three digits. A link is `FROM_ID -> TO_ID`. Trace checks distinguish `TRACE_MALFORMED_ID`, `TRACE_DUPLICATE_ID`, `TRACE_ORPHAN_ID`, and `TRACE_MISSING_LINK_TARGET`. Artifacts without trace IDs do not acquire fabricated trace obligations.

Results are persisted to `trace-check-results.json` and summarized by status. A deterministic suggested stage is guidance, not automatic source editing or a new native stage.

## export

Produce a portable plain-text run handoff.

```bash
my-dev-kit-orchestrator export
my-dev-kit-orchestrator export --run <run-id>
my-dev-kit-orchestrator export --out handoff.txt
my-dev-kit-orchestrator export --out handoff.txt --overwrite
```

Default output is stdout. `--out <file>` writes a file. Existing files are refused unless `--overwrite` is supplied. Raw parent traversal, symbolic-link targets, directory targets, and nonexistent parent directories are rejected.

The handoff includes identity, original request, artifact checklist/missing items, accepted judge/correction state, verification excerpt, content/trace summaries, context readiness, and the next command. It does not embed raw context dumps or copy referenced external evidence. It preserves blocked status rather than promote an authored but rejected PASS.

## Manual context integration

For unfamiliar projects, follow the [Architecture Assimilation gate](https://github.com/dailephd/my-dev-kit/blob/main/docs/ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md#6-existing-project-onboarding-workflow) before task-level planning. `ARCHITECTURE_ASSIMILATION_PASS` is a manual workflow outcome, not a new CLI mode or native artifact.

For context-sensitive stages, the agent runs the verified `<MY_DEV_KIT_CLI>` and supplies:

```text
artifacts/implementation-context-packet.txt
reports/implementation-context-retrieval-report.txt
artifacts/test-context-packet.txt
reports/test-context-retrieval-report.txt
```

The historical verified producer contract is `@dailephd/my-dev-kit@1.10.4`. Record actual compatible tool versions and use current schemas. Reference the raw capsule/audit/index rather than paste them into instruction packets. A refresh-only prompt requires regeneration of the relevant evidence, then status/check/prompt reevaluation.

The primary blocker, corrective action, evidence target, and ordered codes come from one shared decision. Optional truncation does not imply required loss. Manual reading or a supplemental prose claim cannot overwrite producer results or canonical readiness.

## Judge and final-report integrity

Supported correction verdicts retain their native meanings. `DESIGN_INCOMPLETE`, `PSEUDOCODE_INCOMPLETE`, `IMPLEMENTATION_MISMATCH`, `TEST_COVERAGE_INCOMPLETE`, `ARCHITECTURE_MISMATCH`, and `NEED_VERIFICATION` route to their corresponding design/implementation/test/verification owners. `SCOPE_VIOLATION` and `BLOCKED` require external resolution.

`NEED_CONTEXT` follows canonical readiness: implementation first when blocked, otherwise test-implementation. This overrides conflicting authored recommendations. An authored PASS is rejected while NEED_CONTEXT is required. Final-report eligibility requires accepted PASS, no active correction, complete current predecessors, and applicable readiness. File presence, explicit final-report selection, or a manual mark cannot bypass these rules.

## Cross-tool limitations

Observer evidence consumption is a documented library boundary, not a browser-executing CLI subcommand. Lab runs separately under its own command contract. Full-stack continuation, runtime-to-source repair, shared-component protection, reference fidelity, experiments, releases, and ecosystem feedback are externally executed recipes in the canonical my-dev-kit guide.

Do not create a local ecosystem-guide copy, invent missing flags, claim runtime success from structural checks, or present unsupported automation as shipped behavior. No command described here publishes a package or deploys an application.
