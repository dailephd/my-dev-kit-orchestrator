# Usage

This guide covers the CLI command surface and common workflows.

## Initialize a project workspace

Create the local workspace in the current directory:

```bash
my-dev-kit-orchestrator init
```

Use an explicit root:

```bash
my-dev-kit-orchestrator init --root /path/to/project
```

Result:

- creates `.my-dev-kit-orchestrator/`
- creates `.my-dev-kit-orchestrator/runs/`
- writes `.my-dev-kit-orchestrator/config.json` if it does not already exist

## Start a run

Start a default `feature` workflow:

```bash
my-dev-kit-orchestrator start "add structured logging to the import pipeline"
```

Start a specific mode:

```bash
my-dev-kit-orchestrator start --mode repair "CSV export omits the final column"
my-dev-kit-orchestrator start --mode test "coverage for status command error cases"
my-dev-kit-orchestrator start --mode refactor "split prompt generation helpers by workflow"
my-dev-kit-orchestrator start --mode harden "guard invalid run IDs in prompt command"
```

Use a readable run suffix:

```bash
my-dev-kit-orchestrator start --name prompt-hardening "guard invalid run IDs in prompt command"
```

Write runs outside the default workspace:

```bash
my-dev-kit-orchestrator start --output-dir /tmp/orchestrator-runs "add release summary output"
```

Result:

- initializes the workspace if needed
- creates a new run folder
- writes `00-request.txt`
- writes `run.json`
- writes all prompt files for the chosen workflow

## Print prompts

Print the next prompt for the most recent run:

```bash
my-dev-kit-orchestrator prompt
```

Print a specific stage:

```bash
my-dev-kit-orchestrator prompt behavior-model
my-dev-kit-orchestrator prompt implementation
```

Print a prompt for a selected run:

```bash
my-dev-kit-orchestrator prompt verification --run 20260621T120000-release-docs
```

Behavior notes:

- `prompt` without a stage prints the first stage whose expected artifact file is missing
- `prompt <stage>` refuses to continue if prior required artifacts are missing
- completed runs print a completion message instead of another stage prompt

## Save artifacts between prompts

The CLI does not call a coding agent directly in `v0.1.0`.

Expected manual loop:

1. run `my-dev-kit-orchestrator prompt`
2. paste the prompt into a coding agent
3. save the returned artifact into the run folder
4. run `my-dev-kit-orchestrator prompt` again

Example artifact path:

```text
.my-dev-kit-orchestrator/runs/<run-id>/artifacts/request-brief.txt
```

## Example: graph-guided architecture context

The architecture-context stage can be handled as a task-specific prompt that uses both tools in one flow.

Typical command sequence:

```bash
npx @dailephd/my-dev-kit index --root . --src src --out .my-dev-kit --call-graph --json
npx @dailephd/my-dev-kit search --index .my-dev-kit --query "<task term>" --limit 20 --json
npx @dailephd/my-dev-kit lookup --index .my-dev-kit --node "<node-id>" --depth 1 --json
npx @dailephd/my-dev-kit slice --index .my-dev-kit --node "<node-id>" --depth 2 --direction both --json
npx @dailephd/my-dev-kit source --index .my-dev-kit --node "<symbol-node-id>" --max-lines 160 --format numbered
my-dev-kit-orchestrator init
my-dev-kit-orchestrator start --mode feature "<request>"
my-dev-kit-orchestrator prompt architecture-context
my-dev-kit-orchestrator status
my-dev-kit-orchestrator prompt
```

In that flow, the coding agent should:

- use `my-dev-kit` to gather retrieval evidence relevant to the requested change
- save the supporting retrieval report to `.my-dev-kit-orchestrator/runs/<run-id>/reports/architecture-context-retrieval-report.txt`
- save the synthesized architecture context to `.my-dev-kit-orchestrator/runs/<run-id>/artifacts/architecture-context-packet.txt`
- continue the orchestrator workflow from the next stage

The ArchitectureContextPacket should summarize the relevant design context for the change. Later stages should consume that synthesized artifact rather than raw retrieval output.

## Extraction mode (v0.2.1)

`--mode extraction` is available in v0.2.1.

### What extraction mode is for

Extraction mode transfers a bounded feature, workflow, subsystem, or behavior from an existing source repository into a new or separate target repository.

- the source repository is evidence for the porting analysis; it is treated as read-only by default
- the target repository is where the extracted workflow is implemented, tested, verified, and reported
- the orchestrator must not assume the target should inherit the source architecture

### Command

```bash
npx my-dev-kit-orchestrator start --mode extraction \
  --source "<source-repo-root>" \
  --target "<target-repo-root>" \
  "<extraction request>"
```

### Windows example

```powershell
npx my-dev-kit-orchestrator start --mode extraction `
  --source "Z:\Users\newuser\Projects\scientific-literature-explorer-v1" `
  --target "Z:\Users\newuser\Projects\biolit-neighborhoods" `
  "Extract search, ranked results, pagination, paper selection, evidence-set construction, and semantic paper-neighborhood workflow."
```

### Source and target index separation

Each repository uses its own `.my-dev-kit` index directory. The coding agent indexes the source repository separately from the target repository.

Source repository index:

```bash
npx @dailephd/my-dev-kit index --root <source-repo-root> --out <source-repo-root>/.my-dev-kit
```

Target repository index (if the target already has source to inspect):

```bash
npx @dailephd/my-dev-kit index --root <target-repo-root> --out <target-repo-root>/.my-dev-kit
```

Do not mix source and target retrieval results. Mixing them would undermine the porting analysis.

### Extraction workflow loop

The current runtime loop is:

1. start the extraction run
2. work through the extraction stages in order
3. save each extraction artifact before moving to the next stage
4. no implementation until all five pre-implementation artifacts are complete
5. implement only in the target repository
6. verify against the golden behavior contract in the judge stage

### What `--create-target` would do (possible future behavior)

A `--create-target` flag that initializes the target repository before the run is a possible future addition. It is not implemented in the current release. Do not assume this flag exists.

---

## Check run status

Show the most recent run:

```bash
my-dev-kit-orchestrator status
```

Show a selected run:

```bash
my-dev-kit-orchestrator status --run 20260621T120000-release-docs
```

`status` prints:

- run ID
- mode
- original request
- run folder
- current or next stage
- available prompts
- present and missing artifacts
- supporting reports (for example, the architecture-context retrieval report)
- suggested next command

## List runs

List all runs:

```bash
my-dev-kit-orchestrator list
```

Filter by mode:

```bash
my-dev-kit-orchestrator list --mode feature
my-dev-kit-orchestrator list --mode repair
```

`list` prints:

- run ID
- mode
- shortened request label
- status
- created timestamp
- next stage
- run folder

## Common working pattern

```bash
my-dev-kit-orchestrator init
my-dev-kit-orchestrator start "add command to export prompt summaries"
my-dev-kit-orchestrator prompt
# save artifacts/request-brief.txt
my-dev-kit-orchestrator prompt
# save artifacts/architecture-context-packet.txt
my-dev-kit-orchestrator status
my-dev-kit-orchestrator list
```

## Mark command (v0.3.0)

Use `mark` to manually set the lifecycle state of a run artifact.

```bash
my-dev-kit-orchestrator mark <artifact-name> --state <state> [--reason "<reason>"]
```

Supported states:

- `incomplete` — artifact exists but is not finished; reason required
- `blocked` — artifact cannot be completed due to a blocker; reason required
- `complete` — artifact is ready for downstream stages; reason optional

Not supported (computed automatically):

- `missing` — computed from file absence
- `stale` — computed from upstream artifact timestamps

Examples:

```bash
# Mark an artifact as blocked with a required reason
my-dev-kit-orchestrator mark request-brief.txt --state blocked --reason "Waiting for PM sign-off"

# Mark an artifact as incomplete with a reason
my-dev-kit-orchestrator mark behavior-model.txt --state incomplete --reason "Edge cases not documented yet"

# Mark an artifact as complete (reason optional)
my-dev-kit-orchestrator mark request-brief.txt --state complete

# Mark a specific run's artifact
my-dev-kit-orchestrator mark pseudocode-packet.txt --state blocked --reason "Need design decision" --run 20260601T120000-add-logging
```

## Status with lifecycle states (v0.3.0)

The `status` command shows the lifecycle state of each artifact:

```text
Artifacts:
  [complete   ] artifacts/request-brief.txt
  [stale      ] artifacts/architecture-context-packet.txt
                Reason: request-brief.txt changed after architecture-context-packet.txt was completed
  [missing    ] artifacts/behavior-model.txt
  [blocked    ] artifacts/pseudocode-packet.txt
                Reason: Waiting for design decision on pagination
  [incomplete ] artifacts/test-strategy-packet.txt
                Reason: Performance test cases not written yet
```

## Prompt behavior with lifecycle states (v0.3.0)

When the current artifact is blocked, incomplete, or stale, the `prompt` command prepends a lifecycle context block before the standard stage prompt:

```text
=== LIFECYCLE CONTEXT ===
Current artifact state: blocked
Reason: Waiting for PM sign-off

This artifact is blocked. Do not guess or fabricate missing information.
Document the blocker clearly in the artifact. Identify what external input
or decision is needed before work can continue.
=========================

Stage: request-brief
...
```

For stale artifacts, the context instructs the agent to reconcile against newer upstream artifacts.

## Backward compatibility (v0.3.0)

Existing runs without an `artifact-state.json` continue to work:

- artifact file present → `complete`
- artifact file missing → `missing`

No migration is required for runs created before v0.3.0.

## Judge correction routing (v0.6.0)

When a run's judge report contains a non-PASS verdict, `status` and `prompt` integrate correction routing automatically.

### Status shows correction state

After `judge-report.txt` is saved, `status` shows a Judge correction section:

```text
Judge correction: IMPLEMENTATION_MISMATCH → correction required
  Routed stage: implementation
```

For PASS:

```text
Judge correction: PASS — no correction required
```

For SCOPE_VIOLATION or BLOCKED:

```text
Judge correction: SCOPE_VIOLATION — run is blocked
  This run requires external resolution before it can continue.
```

No judge report → the section is omitted (backward compatible with pre-v0.6.0 runs).

### Prompt prints the correction stage

When correction is active, `prompt` prints a bounded correction-stage prompt instead of the normal next-stage prompt:

```bash
my-dev-kit-orchestrator prompt
```

The correction prompt includes:

- stage name with correction context (e.g., `Stage: implementation (correction)`)
- the judge verdict and routed stage
- `judge-report.txt` and required prior stage inputs
- `design-map.txt` if present
- stop conditions: revise only the corrected artifact, no automatic execution, no broadened scope

### Verdict routing table

| Verdict | Default correction stage |
|---------|------------------------|
| `NEED_CONTEXT` | `architecture-context` |
| `DESIGN_INCOMPLETE` | `behavior-model` |
| `PSEUDOCODE_INCOMPLETE` | `pseudocode-packet` |
| `IMPLEMENTATION_MISMATCH` | `implementation` |
| `TEST_COVERAGE_INCOMPLETE` | `test-strategy` |
| `ARCHITECTURE_MISMATCH` | `architecture-context` |
| `NEED_VERIFICATION` | `verification` |
| `SCOPE_VIOLATION` | blocked (no correction stage) |
| `BLOCKED` | blocked (no correction stage) |
| `PASS` | no correction (run continues normally) |

A `Recommended next stage:` field in the judge report overrides the table default when it names a valid correctable stage.

### Trace-aware correction suggestions (v0.6.0)

When `check --trace` or `check --design-map` finds trace issues, the output includes a correction suggestion:

```text
Correction suggestions:
  Suggested correction stage: pseudocode-packet  (TRACE_MISSING_LINK_TARGET)
  Suggested correction stage: design-map  (TRACE_MALFORMED_ID)
```

Suggestions are deterministic — they map trace ID prefixes to owning stages without any LLM inference:

- missing `BEH-NNN` link target → suggest `behavior-model`
- missing `PSE-NNN` link target → suggest `pseudocode-packet`
- missing `TST-NNN` link target → suggest `test-strategy`
- malformed trace ID → suggest `design-map`
- orphan ID → suggest `design-map`

### What correction routing does not do

- correction routing does not modify files automatically
- correction routing does not execute agents
- correction routing does not call an LLM
- correction routing does not restart the run automatically

After the correction prompt is used, the coding agent revises the artifact manually. The run resumes normally from the corrected stage.

## Trace check command (v0.5.0)

Use `check --trace` to run deterministic trace link checks on all run artifacts.

```bash
my-dev-kit-orchestrator check --trace
```

Check only the DesignMap artifact (required sections + trace links):

```bash
my-dev-kit-orchestrator check --design-map
```

Exit 1 on any warn in addition to fail:

```bash
my-dev-kit-orchestrator check --strict --trace
my-dev-kit-orchestrator check --strict --design-map
```

### What trace check reports

For each artifact that contains trace IDs or trace links:

- `[pass]` — no trace issues
- `[warn]` — possible problem (duplicate declared ID, orphan ID that appears in no link)
- `[fail]` — definite problem (malformed trace ID token, link target not declared in this artifact)

### Trace check codes

| Code | Severity | Meaning |
|------|----------|---------|
| `TRACE_MALFORMED_ID` | `fail` | A token looks like a trace ID but is not in valid canonical format (e.g., `BEH001`, `FOO-001`) |
| `TRACE_DUPLICATE_ID` | `warn` | The same trace ID is declared more than once in the artifact |
| `TRACE_ORPHAN_ID` | `warn` | A declared trace ID is never referenced in any trace link in the artifact |
| `TRACE_MISSING_LINK_TARGET` | `fail` | A trace link references a valid trace ID that is not declared in this artifact |

### Trace ID format

Canonical format: `PREFIX-NNN` where:

- `PREFIX` is one of: `REQ`, `CTX`, `BEH`, `INV`, `TRN`, `PSE`, `TST`, `IMP`, `VER`, `RISK`
- `NNN` is a zero-padded number with 3 or more digits (e.g., `001`, `012`, `100`)

Link format: `FROM_ID -> TO_ID` (one link per line)

Trace IDs are optional. The trace checker only runs when you call `check --trace`. Artifacts without any trace IDs pass silently.

### trace-check-results.json

After `check --trace`, results are persisted to `trace-check-results.json` in the run folder.

The `status` command shows a trace check summary when results exist:

```text
Trace check: 3 pass, 1 warn, 0 fail  (run: my-dev-kit-orchestrator check --trace)
```

Before `check --trace` has been run:

```text
Trace check: not run  (run: my-dev-kit-orchestrator check --trace)
```

## Check command (v0.4.0)

Use `check` to run deterministic content checks on artifacts and prompts.

```bash
my-dev-kit-orchestrator check
```

Check a single artifact by stage name or filename:

```bash
my-dev-kit-orchestrator check --artifact request-brief
my-dev-kit-orchestrator check --artifact request-brief.txt
```

Check only generated prompt files:

```bash
my-dev-kit-orchestrator check --prompts
```

Exit 1 on any warn in addition to fail (CI strict mode):

```bash
my-dev-kit-orchestrator check --strict
```

Target a specific run:

```bash
my-dev-kit-orchestrator check --run 20260624T120000-add-logging
my-dev-kit-orchestrator check --root /path/to/project
```

### What check reports

For each artifact:

- `[pass]` — no issues
- `[warn]` — possible problem (empty section, placeholder content, status mismatch)
- `[fail]` — definite problem (missing file, missing required section)

For each prompt:

- `[pass]` — all required prompt elements present
- `[warn]` — prompt missing optional elements (output artifact declaration, placeholder text)
- `[fail]` — prompt missing file, empty, or missing required stage elements

Example output:

```text
Check results for run: 20260624T120000-add-logging

Artifacts:
  [pass] artifacts/request-brief.txt
  [fail] artifacts/architecture-context-packet.txt
         MISSING_FILE: artifact file does not exist
  [warn] artifacts/behavior-model.txt
         PLACEHOLDER_CONTENT: artifact content appears to be placeholder or stub

Prompts:
  [pass] prompts/01-request-brief.txt
  [pass] prompts/02-architecture-context.txt

Summary:
  Artifacts: 1 pass, 1 warn, 1 fail
  Prompts: 2 pass, 0 warn, 0 fail
```

### How status shows check results

After `check` has been run, `status` shows a summary line:

```text
Content check: 1 pass, 1 warn, 1 fail  (run: my-dev-kit-orchestrator check)
```

Before `check` has been run:

```text
Content check: not run  (run: my-dev-kit-orchestrator check)
```

### Check severity

| Severity | Meaning | Default exit behavior |
|----------|---------|----------------------|
| `pass` | No issues found | continues |
| `warn` | Possible problem | exits 0 (exits 1 with `--strict`) |
| `fail` | Definite problem | exits 1 |

### Content checks do not affect stage advancement

The `check` command reports quality issues for human review. It does not block stage advancement. Stage advancement continues to be based on artifact file existence and lifecycle state.
