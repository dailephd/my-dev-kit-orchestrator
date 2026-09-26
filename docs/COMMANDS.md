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

### Semantic Continuity activation

A new staged run automatically persists `semanticContinuityVersion: "1.0.0"` in `run.json` for `feature`, `repair`, `test`, `refactor`, `harden`, and `extraction`, and `start` prints `Semantic continuity: active (1.0.0)`. `greenfield` and `--proof-only` runs are not activated and print no such line. There is no activation flag: the staged CLI workflow is the full-stage-context surface, and a lightweight direct implementation that bypasses staged runs stays outside Semantic Continuity. The set of activated modes is derived from the existing test-strategy registry, not a separate list. Runs created without the version (older runs, or programmatic `createRun()` callers that omit it) remain legacy and keep their prior prompts and output.

### Run telemetry activation

In the unpublished `v1.6.0` source, a new CLI-created run also persists `runTelemetryVersion: "1.0.0"` in `run.json`, and `start` records one completed `start` observation (outcome, mode, current stage, and run status) outside the run directory. `start` output is unchanged. A `start` that fails before a run exists records nothing. Runs created without the field remain legacy. There is no telemetry flag.

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

For an activated run, the prompt for each participating stage also carries the Semantic Continuity authoring contract (see [WORKFLOWS.md](WORKFLOWS.md#semantic-continuity-prompt-contract)). The saved prompt files written at `start` contain that authoring contract as templates and never reflect live gate state. The live `prompt` command additionally honors the current `RunIntegrityGate`: when the current stage is blocked by Semantic Continuity it prints the current blocked stage, the semantic blocker, the affected responsibility, the broken leg, and the recommended correction stage, plus bounded repair guidance for that earlier stage only, and never the blocked stage's normal work. When no correction stage exists (for example an unsupported contract version) it states that external run-contract resolution is required and guesses no stage. A refresh-required repository context for the correction target still takes precedence with refresh-only instructions. The live judge prompt includes the canonical semantic summary rather than asking the judge to re-derive it.

For a telemetry-activated run, `prompt` records one native observation per invocation outside the run directory: the stage actually rendered, whether it was a normal or correction prompt, the emitted prompt's length in characters (not tokens), and bounded snapshots of the gate, judge, and Semantic Continuity results the command already computed. The prompt body is never stored, output is unchanged, and a handled failure is recorded as failed before the command's usual exit. Legacy runs record nothing.

A coding agent can advance through successive authorized prompts in one session, saving actual stage evidence. It cannot collapse native stages or use a manual completion mark to skip tests.

## status

Inspect the most recent or selected run.

```bash
my-dev-kit-orchestrator status
my-dev-kit-orchestrator status --run <run-id> --root <project-root>
```

Status reports identity, request, folder, current stage, prompts, artifact lifecycle, supporting reports, implementation/test context, freshness/adequacy, blockers, and next command. Judge/final-report integrity includes expected and authored verdicts, acceptance, correction state, and eligibility.

For an activated run, `status` adds one compact `Semantic continuity:` section projected from the same `RunIntegrityGate` result it already computes: contract version, semantic classification, continuity state, run integrity readiness, critical and noncritical responsibility totals with unsatisfied counts, and, when present, blocking and warning responsibility IDs, blocking and warning codes, and the recommended correction stage. Legacy, greenfield, and proof-only runs show no such section.

For a telemetry-activated run in the unpublished `v1.6.0` source, `status` also adds one compact `Workflow Economics:` section derived on demand from the run's native telemetry: availability (`available`, `partial`, or `unsupported`), interaction counts, per-command counts, prompt render count and characters, Orchestrator invocation duration, stage movement (forward, backward/revisits, unchanged), correction-prompt renders, integrity blocked-entry/recovery and final-eligibility reached/lost observations, the observed workflow span (wall clock, not active work time), and a coverage line (diagnostics, wall-clock anomalies, numeric limit, concurrency). Unavailable values print `unavailable`. `status` never records telemetry, shows no raw records, invocation IDs, timestamps, or paths, and a legacy run shows no such section; malformed telemetry shows `partial` rather than failing, and an unsupported version shows only `Availability: unsupported`.

`status` is human-readable. There is no JSON option. Do not invent a JSON-output flag for `status`.

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

For a telemetry-activated run, `mark` records one native observation (the artifact, the requested state, the resulting state when computed, and whether a reason was supplied, never the reason text) and the bounded gate and judge snapshots when the command computed them. Legacy runs record nothing.

`missing` and `stale` are computed. Do not mark sidecars, context capsules, audits, or supplemental packets as native artifacts. A complete record cannot override a blocked context, a semantically blocked stage (`mark` exits nonzero and leaves `artifact-state.json` unchanged), or an ineligible final report. Preserve the cause of a blocker instead of relabeling it.

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

For an activated run, the default `check`, `check --artifacts`, and `check --all` include a `=== Semantic continuity ===` section from the same gate; narrowly scoped checks such as `--trace`, `--artifact`, and `--prompts` do not. There is no `check --semantic` flag. A blocked classification is a failure (exit 1) and names the primary blocking code, primary reason, affected responsibility, broken leg, and recommended correction stage. A warning classification (noncritical gaps only) is a warning: it exits 0 normally and exits 1 under `--strict`, like other warnings. A ready gate, including pending continuity before the strategy stage has passed, is a pass. `check --artifacts` does not parse responsibilities itself; it surfaces the canonical gate result.

For a telemetry-activated run, the default `check` and `check --all` also include a `=== Run telemetry ===` section built from the canonical telemetry reader: `[pass] telemetry records valid` when the structure is clean (a run with no records yet is valid), otherwise bounded `[warn]` lines that reuse the reader's diagnostic codes (for example `DUPLICATE_INVOCATION_ID` or `UNSUPPORTED_RUN_TELEMETRY_VERSION`) plus `INCOMPLETE_TELEMETRY_INVOCATION`, `TELEMETRY_WALL_CLOCK_ANOMALY`, `TELEMETRY_NUMERIC_LIMIT_EXCEEDED`, and `TELEMETRY_UNRECOGNIZED_VALUE` for valid-but-partial coverage. At most 20 lines are shown, followed by a `TELEMETRY_DIAGNOSTICS_TRUNCATED` line with the total. Every telemetry finding is a warning, never a failure: a run's exit code is unchanged unless `--strict` promotes warnings, exactly as for any other warning, and no telemetry finding changes the gate, judge, lifecycle, or correction decisions. `check --all` adds a `Run telemetry` summary line. Narrow checks (`--artifact`, `--prompts`, `--artifacts`, `--trace`, `--design-map`) and legacy runs show no telemetry section, and there is no telemetry flag. `check` never records telemetry.

### Artifact contracts

Registered JSON artifacts use strict JSON/structured-field checks. Text artifacts use required sections. Shared validation does not impose text headers on JSON.

The contract vocabulary includes `CONTRACT_MISSING_FILE`, `CONTRACT_EMPTY_FILE`, `CONTRACT_MISSING_SECTION`, `CONTRACT_BLANK_SECTION`, `CONTRACT_PLACEHOLDER_SECTION`, `CONTRACT_MALFORMED_JSON`, `CONTRACT_MISSING_FIELD`, `CONTRACT_INVALID_FIELD`, `CONTRACT_PREDECESSOR_MISSING`, and `CONTRACT_STAGE_NO_CONTRACT`. See the usage guide for strict-mode distinctions and examples.

### Trace checks

IDs use `PREFIX-NNN`, with prefixes `REQ`, `CTX`, `BEH`, `INV`, `TRN`, `PSE`, `TST`, `IMP`, `VER`, and `RISK`, plus at least three digits. A declaration is a line beginning `ID: text`, and it stays a declaration even when its text contains `->` (for example `TRN-001: invalid-input -> validation-error`). A link is `FROM_ID -> TO_ID`. Trace checks distinguish `TRACE_MALFORMED_ID`, `TRACE_DUPLICATE_ID`, `TRACE_ORPHAN_ID`, and `TRACE_MISSING_LINK_TARGET`. Artifacts without trace IDs do not acquire fabricated trace obligations.

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

For an activated run the handoff names the semantic contract version in the run identity and adds one compact `=== Semantic continuity ===` section from the same gate: `contractVersion`, `semanticClassification`, `continuityState`, `runIntegrityReady`, critical and noncritical counts and unsatisfied IDs, `blockingCodes`, `warningCodes`, `expectedJudgeVerdict`, and `recommendedCorrectionStage`. It never copies raw context capsules, retrieval audits, or parser output. A legacy run is never labeled activated.

For a telemetry-activated run in the unpublished `v1.6.0` source, the handoff also adds one bounded, fixed-size `=== Workflow Economics ===` section from the same on-demand evaluator: economics version, availability, interaction and per-command counts, prompt render and character statistics, Orchestrator invocation duration statistics, the observed workflow span (labelled wall clock, not active work time), stage movement, mark counts, integrity, judge, and final-eligibility observation counts, continuity snapshot counts (recorded observations of the existing Semantic Continuity projection, not a second continuity concept), and coverage (diagnostics, wall-clock anomalies, numeric limit, concurrency, unrecognized values). It shows counts only, never raw telemetry, invocation history, prompt text, or paths, is identical across repeated exports (except the existing `Generated:` line), and never records telemetry. Legacy runs omit it, and an unsupported version shows only `Availability: unsupported`.

## Manual context integration

For unfamiliar projects, follow the [Architecture Assimilation gate](https://github.com/dailephd/my-dev-kit/blob/main/docs/ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md#6-existing-project-onboarding-workflow) before task-level planning. `ARCHITECTURE_ASSIMILATION_PASS` is a manual workflow outcome, not a new CLI mode or native artifact.

For context-sensitive stages, the agent runs the verified `<MY_DEV_KIT_CLI>` and supplies:

```text
artifacts/implementation-context-packet.txt
reports/implementation-context-retrieval-report.txt
artifacts/test-context-packet.txt
reports/test-context-retrieval-report.txt
```

The verified producer contract for the readiness evidence is `@dailephd/my-dev-kit@1.10.4`; the Semantic Continuity evidence bridges were validated against `@dailephd/my-dev-kit@1.12.4`, and older schema-major-1 evidence without the additive fields remains accepted. Record actual compatible tool versions and use current schemas. In an activated run the request that populates these files carries the canonical strategy `RSP` IDs as `testResponsibilityRefs` and requests `responsibility-mappings` in addition to its existing evidence kinds. Reference the raw capsule/audit/index rather than paste them into instruction packets. A refresh-only prompt requires regeneration of the relevant evidence, then status/check/prompt reevaluation.

The primary blocker, corrective action, evidence target, and ordered codes come from one shared decision. Optional truncation does not imply required loss. Manual reading or a supplemental prose claim cannot overwrite producer results or canonical readiness.

## Judge and final-report integrity

Supported correction verdicts retain their native meanings. `DESIGN_INCOMPLETE`, `PSEUDOCODE_INCOMPLETE`, `IMPLEMENTATION_MISMATCH`, `TEST_COVERAGE_INCOMPLETE`, `ARCHITECTURE_MISMATCH`, and `NEED_VERIFICATION` route to their corresponding design/implementation/test/verification owners. `SCOPE_VIOLATION` and `BLOCKED` require external resolution.

`NEED_CONTEXT` follows canonical run integrity: for repository context, implementation first when blocked, otherwise test-implementation; for Semantic Continuity, the canonical correction stage (a mode-owned strategy stage, `implementation`, `test-implementation`, or `verification`), or no stage at all when none exists. This overrides conflicting authored recommendations, and a canonical no-stage result is never replaced by a table default. An authored PASS is rejected while NEED_CONTEXT is required. Final-report eligibility requires accepted PASS, no active correction, complete current predecessors, and applicable readiness. File presence, explicit final-report selection, or a manual mark cannot bypass these rules.

## Cross-tool compatibility handoffs

The authoritative command-surface composition map is [my-dev-kit ecosystem workflow section 9.15](https://github.com/dailephd/my-dev-kit/blob/main/docs/ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md#915-command-surface-compatibility-map).

Current boundaries that matter when composing commands:

- my-dev-kit context capsules/audits are **raw producer evidence**, not native Orchestrator artifacts. The coding agent must populate the fixed implementation/test supplemental packet and retrieval-report contracts that reference them.
- Observer's released bounded-agent-context schema has a **direct programmatic** consumer in Orchestrator through `consumeBoundedObserverEvidence(...)`. There is no CLI flag that launches Observer or imports an arbitrary Observer evidence directory.
- Observer `check --json`, Lab security/audit reports, my-dev-kit `graph-diff`, and project-test results can be cited in verification/final reports, but current Orchestrator commands do not generically parse those files.
- `export` produces a portable human/coding-agent handoff. It is not a machine-input format accepted by my-dev-kit, Lab, or Observer.
- Lab stage-context experiments can consume Orchestrator `WorkflowInstructionPacket` evidence through Lab's documented programmatic experiment configuration. That is Lab library/source-checkout integration, not an Orchestrator CLI route.

## Cross-tool limitations

Observer evidence consumption is a documented library boundary, not a browser-executing CLI subcommand. Lab runs separately under its own command contract. Full-stack continuation, runtime-to-source repair, shared-component protection, reference fidelity, experiments, releases, and ecosystem feedback are externally executed recipes in the canonical my-dev-kit guide.

Do not create a local ecosystem-guide copy, invent missing flags, claim runtime success from structural checks, or present unsupported automation as shipped behavior. No command described here publishes a package or deploys an application.
