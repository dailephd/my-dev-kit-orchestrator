# Usage compatibility guide

[COMMANDS.md](COMMANDS.md) is the canonical command reference. This guide retains detailed operational examples for existing readers. Command changes must be reconciled into `COMMANDS.md` first. [WORKFLOWS.md](WORKFLOWS.md) owns native stage procedures and [ARTIFACTS.md](ARTIFACTS.md) owns artifact contracts.

Cross-tool execution, Architecture Assimilation, full-stack work, Observer checks, Lab assurance, and failure feedback are centralized in [my-dev-kit's ecosystem workflow guide](https://github.com/dailephd/my-dev-kit/blob/main/docs/ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md). No local duplicate is required.

## Install or run the CLI

```bash
npx @dailephd/my-dev-kit-orchestrator --help
```

A global installation exposes the binary directly:

```bash
npm install -g @dailephd/my-dev-kit-orchestrator
my-dev-kit-orchestrator --help
```

For a project-local dependency, use its local executable through the project's command runner. From a source checkout:

```bash
npm ci
npm run build
node dist/cli.js --help
```

## Initialize a project workspace

```bash
my-dev-kit-orchestrator init
my-dev-kit-orchestrator init --root /path/to/project
```

This creates `.my-dev-kit-orchestrator/`, its `runs/` directory, and `config.json` if absent. It does not implement an application.

## Start a run

```bash
my-dev-kit-orchestrator start "add structured logging to the import pipeline"
my-dev-kit-orchestrator start --mode repair "CSV export omits the final column"
my-dev-kit-orchestrator start --mode test "coverage for status command error cases"
my-dev-kit-orchestrator start --mode refactor "split prompt generation helpers by workflow"
my-dev-kit-orchestrator start --mode harden "guard invalid run IDs in prompt command"
my-dev-kit-orchestrator start --name prompt-hardening "guard invalid run IDs in prompt command"
```

The default mode is `feature`. `start` initializes the workspace if necessary, creates a run folder, writes `00-request.txt` and `run.json`, and generates its native prompt files.

For explicit proof-only verification:

```bash
my-dev-kit-orchestrator start --proof-only --verification-responsibility artifacts/proof.txt "verify the existing migration behavior"
```

Proof-only is not inferred from an empty diff. The declared proof file must contain the exact line `Proof result: PASS`. Normal readiness, integrity, judge, and final-report requirements still apply.

`start --output-dir <path>` supports placement outside the default workspace, but subsequent `prompt`, `status`, `list`, `mark`, `check`, and `export` commands cannot rediscover custom-output runs in the reviewed release. They search under `.my-dev-kit-orchestrator/runs/` at the selected root and do not accept `--output-dir`. Even `--run` does not fix that limitation. Omit custom placement for a resumable CLI workflow.

## Start and inspect a greenfield run

```bash
my-dev-kit-orchestrator init
my-dev-kit-orchestrator start --mode greenfield "<project idea>"
my-dev-kit-orchestrator prompt
my-dev-kit-orchestrator status
my-dev-kit-orchestrator list
my-dev-kit-orchestrator check --artifacts
my-dev-kit-orchestrator check --all
my-dev-kit-orchestrator export
```

Example intents:

```bash
my-dev-kit-orchestrator start --mode greenfield "Create a sample TypeScript CLI app"
my-dev-kit-orchestrator start --mode greenfield "Create a Next.js web dashboard"
my-dev-kit-orchestrator start --mode greenfield "Create an Android Compose habit tracker app"
my-dev-kit-orchestrator start --mode greenfield "Create a small Python CLI that prints a greeting"
```

The four starter profiles are `typescript-cli`, `nextjs-app`, `android-compose`, and `python-cli`. A coding agent resolves the profile during `starter-profile`; `start` does not infer it at the CLI layer. Generated prompts remain stage-specific. The agent creates the project and saves requested artifacts before advancing.

Android Compose guidance covers Kotlin/Compose/Gradle and project-side validation such as `./gradlew build`, `./gradlew testDebugUnitTest`, and optional device/emulator-dependent `./gradlew connectedAndroidTest`. Orchestrator does not run Gradle or require an SDK/device itself.

The bounded Python profile covers `pyproject.toml`, `src/main.py`, `tests/test_main.py`, and `README.md`, with setup, compile, pytest, and help evidence. Bare Python and Python web/API/server intent remain unresolved or unsupported. All profiles receive common `agents.txt`, `claude.txt`, `AGENTS.md`, and `CLAUDE.md` instructions, distinct from public project documents and native run artifacts.

For a selected profile, `status` and `check` evaluate scaffold-plan conformance, generated-file and verification-command evidence, and first-slice readiness. Legacy runs receive explicit compatibility treatment rather than retroactive requirements. A fresh empty run can legitimately fail `check --artifacts` because its artifacts do not yet exist. That is a completed check with findings, not a CLI crash.

## Print prompts

```bash
my-dev-kit-orchestrator prompt
my-dev-kit-orchestrator prompt behavior-model
my-dev-kit-orchestrator prompt implementation
my-dev-kit-orchestrator prompt verification --run 20260621T120000-release-docs
```

Without a stage, the CLI selects the first stage whose effective gate-aware state is not complete. Missing, blocked, stale, context-blocked, and ineligible states remain visible. Explicit stage selection cannot bypass missing predecessors or readiness. Completed runs print completion instead of another task.

## Save artifacts between prompts

The CLI does not call a coding agent directly. The operating loop is:

1. Obtain the current prompt.
2. Execute its authorized work through a coding agent.
3. Save its actual requested artifact in the run directory.
4. Check readiness and obtain the next prompt.

For example, the request artifact is `.my-dev-kit-orchestrator/runs/<run-id>/artifacts/request-brief.txt`.

One coding-agent session may perform this loop continuously. It still obeys native stage order and readiness. It cannot terminate a required full-stack user flow successfully at backend-only implementation.

## Example: graph-guided architecture context

This is bounded task retrieval, not complete onboarding. For an unfamiliar project, first obtain `ARCHITECTURE_ASSIMILATION_PASS` under the [canonical Architecture Assimilation gate](https://github.com/dailephd/my-dev-kit/blob/main/docs/ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md#6-existing-project-onboarding-workflow). That result is manual workflow evidence, not an artifact automatically created or checked by this CLI.

```bash
<MY_DEV_KIT_CLI> index --root . --src src --out .my-dev-kit --call-graph --json
<MY_DEV_KIT_CLI> search --index .my-dev-kit --query "<task term>" --limit 20 --json
<MY_DEV_KIT_CLI> lookup --index .my-dev-kit --node "<node-id>" --depth 1 --json
<MY_DEV_KIT_CLI> slice --index .my-dev-kit --node "<node-id>" --depth 2 --direction both --json
<MY_DEV_KIT_CLI> source --index .my-dev-kit --node "<symbol-node-id>" --max-lines 160 --format numbered
my-dev-kit-orchestrator init
my-dev-kit-orchestrator start --mode feature "<request>"
my-dev-kit-orchestrator prompt
```

Follow predecessor gates before requesting `architecture-context`. Save the retrieval report under `reports/architecture-context-retrieval-report.txt` and the synthesized packet under `artifacts/architecture-context-packet.txt` in the run. Later stages consume the packet's relevant conclusions rather than a raw graph dump.

## Supply implementation and test context manually

The v1.2.1 evidence workflow remains manual. Feature, repair, refactor, harden, and extraction have implementation and test requirements. Test mode has only the test-context requirement.

1. Start or resume the correct run.
2. Read generated supplemental templates in `artifacts/` and `reports/`.
3. Run the verified `<MY_DEV_KIT_CLI>` for the current repository/source state.
4. Populate required metadata and sections.
5. Reference raw capsule, audit, and index evidence by path instead of copying full JSON.
6. Run `status` and `check` or `check --all`.
7. Print the target prompt again and proceed only when its readiness permits normal work.

The released `@dailephd/my-dev-kit@1.10.4` package is the historical verified producer authority for this contract. New runs must record the actual compatible producer version used. No source checkout path is part of the public interface.

Fixed supplemental paths:

```text
artifacts/implementation-context-packet.txt
reports/implementation-context-retrieval-report.txt
artifacts/test-context-packet.txt
reports/test-context-retrieval-report.txt
```

When blocked, a direct implementation/test prompt is refresh-only and prohibits normal work. `prompt` display is read-only: it does not create templates/sidecars or change `run.json`, lifecycle state, or supplemental evidence.

A blocked result identifies a deterministic primary blocker, primary reason, corrective action, evidence target, and ordered issue codes. These same canonical details flow through prompts, status, checks, verification, judge, correction routing, and exports. Regenerate evidence rather than edit a generated result to claim readiness.

## Start an extraction run

Extraction transfers bounded behavior without requiring the target to inherit the source architecture. The source is read-only unless separately authorized. The target owns implementation, tests, and reports.

```bash
npx @dailephd/my-dev-kit-orchestrator start --mode extraction \
  --source "<source-repo-root>" \
  --target "<target-repo-root>" \
  "<extraction request>"
```

PowerShell:

```powershell
npx @dailephd/my-dev-kit-orchestrator start --mode extraction `
  --source "C:\source-repository" `
  --target "C:\target-repository" `
  "Extract a bounded workflow into the target repository."
```

### Separate source and target indexes

```bash
<MY_DEV_KIT_CLI> index --root "<source-repo-root>" --src "<source-root-relative-to-project>" --out .my-dev-kit --json
<MY_DEV_KIT_CLI> index --root "<target-repo-root>" --src "<target-source-root-relative-to-project>" --out .my-dev-kit --json
```

Index the target only when it contains useful source. Never mix repository identities. The user must create the target repository before starting extraction because `--create-target` is not implemented.

Work through native stages in order. The five pre-implementation analysis stages produce six gate files because `porting-map` also produces the do-not-port list. Complete them before target implementation. Judge against the golden behavior contract and report reused, rewritten, discarded, and preserved behavior.

## Check run status

```bash
my-dev-kit-orchestrator status
my-dev-kit-orchestrator status --run 20260621T120000-release-docs
```

Status reports run ID/mode/request/folder, current stage, prompts and artifacts, supporting reports, context decisions/freshness/adequacy/blockers, and the next command. Its judge/final-report integrity section shows expected and authored verdicts, acceptance, correction state, and eligibility from the shared canonical decision.

`status` is human-readable and has no JSON option.

## List runs

```bash
my-dev-kit-orchestrator list
my-dev-kit-orchestrator list --mode feature
my-dev-kit-orchestrator list --mode repair
```

The list includes run ID, mode, shortened request, status, creation timestamp, next stage, and folder.

## Common working pattern

```bash
my-dev-kit-orchestrator init
my-dev-kit-orchestrator start "add command to export prompt summaries"
my-dev-kit-orchestrator prompt
# Execute the current stage and save its requested artifact.
my-dev-kit-orchestrator status
my-dev-kit-orchestrator check
my-dev-kit-orchestrator prompt
```

Keep the same run and candidate identity through corrections. Do not start another run merely because the chat or coding-agent session changed.

## Mark artifact state

```bash
my-dev-kit-orchestrator mark <artifact-name> --state <state> [--reason "<reason>"]
```

Settable states are `incomplete` and `blocked`, both requiring a reason, and `complete`, with an optional reason. `missing` and `stale` are computed rather than manually set.

```bash
my-dev-kit-orchestrator mark request-brief.txt --state blocked --reason "Required product decision missing"
my-dev-kit-orchestrator mark behavior-model.txt --state incomplete --reason "Edge cases missing"
my-dev-kit-orchestrator mark request-brief.txt --state complete
my-dev-kit-orchestrator mark pseudocode-packet.txt --state blocked --reason "Need design decision" --run 20260601T120000-add-logging
```

Marking complete cannot override current readiness or final-report eligibility.

## Interpret lifecycle state in status output

```text
Artifacts:
  [complete   ] artifacts/request-brief.txt
  [stale      ] artifacts/architecture-context-packet.txt
                Reason: request-brief.txt changed after completion
  [missing    ] artifacts/behavior-model.txt
  [blocked    ] artifacts/pseudocode-packet.txt
                Reason: Required pagination decision missing
  [incomplete ] artifacts/test-strategy-packet.txt
```

Use the actual detailed status output for the current run. These lines illustrate state meanings, not exact output snapshots to hand-author.

## Continue an incomplete, blocked, or stale stage

`prompt` includes lifecycle context before the current stage instructions. Blocked work must retain the missing decision or evidence rather than fabricate it. Stale work must reconcile with newer upstream artifacts. Context-sensitive stages may require evidence refresh before any normal source/test editing.

Resolve the earliest invalidated gate, regenerate its evidence, and then revisit downstream artifacts. Do not advance by reusing a stale PASS.

## Runs without lifecycle metadata

Runs predating `artifact-state.json` retain compatible file-present/file-missing handling where applicable. No migration is required just because the run predates v0.3.0. Current supported integrity/readiness requirements are not bypassed by that compatibility rule.

## Follow judge correction routing

After `judge-report.txt` is saved, status and prompt use its accepted correction state. An implementation mismatch routes to implementation. An accepted PASS has no active correction. If canonical readiness expects `NEED_CONTEXT`, an authored PASS is rejected and cannot clear correction state or authorize a final report.

### Verdict routing

- `DESIGN_INCOMPLETE`: behavior-model.
- `PSEUDOCODE_INCOMPLETE`: pseudocode-packet.
- `IMPLEMENTATION_MISMATCH`: implementation.
- `TEST_COVERAGE_INCOMPLETE`: test-strategy.
- `ARCHITECTURE_MISMATCH`: architecture-context.
- `NEED_VERIFICATION`: verification.
- `NEED_CONTEXT`: architecture-context is the historical/general default. For current context readiness, use the canonical `Recommended next stage`: implementation first when it is blocked, otherwise test-implementation. Test mode uses test-implementation.
- `SCOPE_VIOLATION` and `BLOCKED`: external resolution, no correction stage.
- `PASS`: no correction only when accepted by integrity gates.

A valid recommended-stage override applies under the normal routing contract, but cannot override canonical `NEED_CONTEXT` routing with conflicting prose. No new verdict or correction artifact is introduced.

### Correction prompts and trace suggestions

When correction is active, `prompt` selects the bounded correction stage and includes the verdict, stage, judge artifact, relevant predecessors, optional design map, and scope restrictions. The CLI does not edit files, call an LLM, execute an agent, or restart the run automatically.

Trace checks can suggest owning stages deterministically: missing `BEH` targets point to behavior-model, missing `PSE` targets to pseudocode-packet, missing `TST` targets to test-strategy, and malformed/orphan trace IDs to design-map. Such suggestions do not create new native stages or override readiness.

### Final-report eligibility

A normal final report requires accepted judge PASS, no active correction, complete/non-stale required predecessors, and current readiness. Explicitly requesting `prompt final-report` when ineligible returns blocking guidance. An existing final report, a lifecycle complete record, or `mark final-report.txt --state complete` cannot bypass it. The mark attempt is rejected before changing lifecycle state.

## Check trace links

```bash
my-dev-kit-orchestrator check --trace
my-dev-kit-orchestrator check --design-map
my-dev-kit-orchestrator check --strict --trace
my-dev-kit-orchestrator check --strict --design-map
```

Trace checks distinguish malformed IDs, duplicate declarations, orphan IDs, and missing link targets. Canonical IDs use a prefix from `REQ`, `CTX`, `BEH`, `INV`, `TRN`, `PSE`, `TST`, `IMP`, `VER`, or `RISK`, followed by a hyphen and at least three zero-padded digits. Links use `FROM_ID -> TO_ID`, one per line.

Codes:

- `TRACE_MALFORMED_ID`: fail for a noncanonical trace-like token.
- `TRACE_DUPLICATE_ID`: warn for a duplicate declaration.
- `TRACE_ORPHAN_ID`: warn for an unreferenced declared ID.
- `TRACE_MISSING_LINK_TARGET`: fail for an undeclared link target.

Trace IDs are optional. Artifacts with no trace IDs pass the trace check without invented requirements. `check --trace` persists `trace-check-results.json`, which status summarizes when present. A not-run trace check is not a passed check.

## Check artifact and prompt content

```bash
my-dev-kit-orchestrator check
my-dev-kit-orchestrator check --artifact request-brief
my-dev-kit-orchestrator check --artifact request-brief.txt
my-dev-kit-orchestrator check --prompts
my-dev-kit-orchestrator check --strict
my-dev-kit-orchestrator check --run 20260624T120000-add-logging
my-dev-kit-orchestrator check --root /path/to/project
```

Artifact findings distinguish missing files/sections from warning-level empty sections, placeholders, and status mismatches. Prompt checks inspect required stage content and distinguish missing/empty prompts from optional omissions. Status reports the saved content-check summary or not-run state.

By default warning-only results can exit 0. Failures exit 1. Strict mode also fails on warnings. Check results and generated report writes do not advance stages or mutate lifecycle state. Blocking repository-context issues remain nonzero and duplicate failures for a context kind are suppressed.

## Check artifact contracts and stage gates

```bash
my-dev-kit-orchestrator check --artifacts
my-dev-kit-orchestrator check --artifacts --strict
my-dev-kit-orchestrator check --artifacts --run 20260624T120000-add-logging
my-dev-kit-orchestrator check --all
my-dev-kit-orchestrator check --all --strict
```

Artifact checks cover:

- `CONTRACT_MISSING_FILE`
- `CONTRACT_EMPTY_FILE`
- `CONTRACT_MISSING_SECTION`
- `CONTRACT_BLANK_SECTION`, failing in strict mode
- `CONTRACT_PLACEHOLDER_SECTION`, failing in strict mode
- `CONTRACT_MALFORMED_JSON`
- `CONTRACT_MISSING_FIELD`
- `CONTRACT_INVALID_FIELD`
- `CONTRACT_PREDECESSOR_MISSING`, failing in strict mode
- `CONTRACT_STAGE_NO_CONTRACT`, failing in strict mode

Registered JSON artifacts remain strict JSON with structured-field validation. Text artifacts use their section contracts. Shared existence/predecessor/integrity checking does not impose one syntax on every artifact.

`check --artifacts` also reports context readiness and judge/final-report integrity. Structurally valid sections do not imply run eligibility. `check --all` combines artifact contracts, stage gates, trace and design-map checks, correction state, context readiness, and judge/final-report integrity. A rejected, malformed, or unknown judge verdict fails integrity. An ordinary accepted correction-required verdict is reported and does not fail solely because correction remains necessary.

## Export a run handoff

```bash
my-dev-kit-orchestrator export
my-dev-kit-orchestrator export --run 20260624T120000-add-logging
my-dev-kit-orchestrator export --out handoff.txt
my-dev-kit-orchestrator export --out handoff.txt --overwrite
```

Export includes identity/status/current stage, original request, artifact checklist, missing artifacts, accepted judge result, correction state, verification excerpt, content/trace summaries, structured context readiness, and the next command. It never presents an integrity-rejected authored PASS as accepted.

Default output is stdout. `--out` writes a file and refuses an existing file unless `--overwrite` is supplied. It rejects raw parent traversal, symlink targets, directory targets, and nonexistent parent directories. It does not copy referenced external evidence or embed full raw capsules/audits. Preserve separately required project-level handoff facts through the canonical ecosystem guide.

## Troubleshooting

- Start a run before asking for its prompt/status/check/export.
- Confirm `--run` and `--root` when discovery fails.
- Do not use custom start output for a workflow that must resume through the current CLI.
- Missing artifacts in a new run are findings, not a CLI crash.
- Recover a blocked context through fresh matching producer evidence, not manual readiness edits.
- The CLI does not run agents, Gradle, my-dev-kit, Observer, security validation, or publication.
- Report material tool/workflow failures and safe fallbacks through the canonical ecosystem feedback record. A local workaround is not evidence that an automatic integration exists.
