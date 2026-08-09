# Commands

> Canonical command reference. `docs/USAGE.md` is retained as a compatibility mirror for existing links; new command-reference links and substantive command updates belong here.

This guide is the complete user-facing command reference. For exact stage
procedures, see [Workflows](WORKFLOWS.md). For artifact contracts and paths,
see [Artifacts](ARTIFACTS.md). The cross-cutting ownership and compatibility
map is in [Contracts](CONTRACTS.md).

## Install or run the CLI

Run the published package without a global installation:

```bash
npx @dailephd/my-dev-kit-orchestrator --help
```

After installing the package, use the executable directly:

```bash
npm install @dailephd/my-dev-kit-orchestrator
my-dev-kit-orchestrator --help
```

From this repository, build and run the local executable:

```bash
npm install
npm run build
node dist/cli.js --help
```

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

`start --output-dir <path>` can place a run outside the default workspace:

```bash
my-dev-kit-orchestrator start --output-dir /tmp/orchestrator-runs "add release summary output"
```

In `v1.2.3`, this is a placement-only option. `prompt`, `status`, `list`,
`mark`, `check`, and `export` search only
`.my-dev-kit-orchestrator/runs/` under the selected project root, and none of
them accepts `--output-dir`. They cannot rediscover or select a custom-output
run, even with `--run`. For a resumable workflow, omit `--output-dir` and use
the default run directory. If a custom-output run already exists, its files
remain inspectable on disk, but the public CLI cannot advance that run.

Result:

- initializes the workspace if needed
- creates a new run folder
- writes `00-request.txt`
- writes `run.json`
- writes all prompt files for the chosen workflow

## Start and inspect a greenfield run

Greenfield mode bootstraps a project before useful code exists:

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

For example:

```bash
my-dev-kit-orchestrator start --mode greenfield "Create a sample TypeScript CLI app"
```

Next.js example:

```bash
my-dev-kit-orchestrator start --mode greenfield "Create a Next.js web dashboard"
```

Android Compose example:

```bash
my-dev-kit-orchestrator start --mode greenfield "Create an Android Compose habit tracker app"
```

The greenfield foundation supports three starter profiles: `typescript-cli`,
`nextjs-app`, and `android-compose`. Android Compose support is profile-guided
planning and prompt support: the generated stack decision, docs, and scaffold
plan describe a Kotlin/Jetpack Compose/Gradle project, and validation guidance
lists Gradle commands (`./gradlew build`, `./gradlew testDebugUnitTest`, and an
optional device/emulator-dependent `./gradlew connectedAndroidTest`) -- the
orchestrator does not run Gradle itself. `start` does not parse the request
into a profile; a coding agent resolves the profile later, when it executes
the `starter-profile` stage prompt. Each generated prompt remains specific to
the current stage regardless of profile. Paste that bounded prompt into the
coding agent, save the required artifact in the run folder, and then request
the next prompt.

`check --artifacts` and `check --all` use the shared artifact and contract
checkers for greenfield runs, for every profile. On a newly created run they
report missing stage artifacts and may exit with code 1; that is a completed
check with findings, not a CLI crash. `export` produces the same portable run
handoff used by other modes. `--out` rejects raw `..` path-traversal segments
in the given argument and refuses symlink or directory targets before writing
anything.

Once a profile is selected, `status` and `check`/`check --all` also report
scaffold and readiness findings for the run: whether the scaffold plan
conforms to the selected profile, whether generated-file and
verification-command evidence is present, and whether the first vertical
slice is complete. A run created before this validation existed receives
explicit legacy treatment instead of being retroactively failed.

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

- `prompt` without a stage selects the first stage whose effective,
  gate-aware artifact state is not complete; incomplete, blocked, stale,
  context-blocked, and final-report-ineligible stages remain current
- `prompt <stage>` refuses to continue when a prior required artifact file is
  missing; selecting a stage explicitly does not bypass that stage's lifecycle
  or run-integrity decision, so a context-blocked implementation or test stage
  produces recovery guidance instead of normal work
- completed runs print a completion message instead of another stage prompt

## Save artifacts between prompts

The CLI does not call a coding agent directly.

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

This example is bounded task retrieval, not complete onboarding for an
unfamiliar existing project. In that case, first follow the Architecture
Assimilation workflow and obtain `ARCHITECTURE_ASSIMILATION_PASS` as defined in
[ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md](ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md#65-architecture-assimilation-gate).
Do not choose an execution mode or start an implementation prompt from this
single feature-oriented sequence alone. The assimilation result is manual; the
current CLI neither creates nor validates it.

Typical command sequence:

```bash
<MY_DEV_KIT_CLI> index --root . --src src --out .my-dev-kit --call-graph --json
<MY_DEV_KIT_CLI> search --index .my-dev-kit --query "<task term>" --limit 20 --json
<MY_DEV_KIT_CLI> lookup --index .my-dev-kit --node "<node-id>" --depth 1 --json
<MY_DEV_KIT_CLI> slice --index .my-dev-kit --node "<node-id>" --depth 2 --direction both --json
<MY_DEV_KIT_CLI> source --index .my-dev-kit --node "<symbol-node-id>" --max-lines 160 --format numbered
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

## Supply implementation and test context manually

The `v1.2.1` release evaluates supplemental repository evidence but does not
retrieve it. Use this sequence for `feature`, `repair`, `refactor`, `harden`,
or `extraction`; test mode uses only the test-context pair.

1. Create or start a run.
2. Inspect the generated supplemental templates in `artifacts/` and `reports/`.
3. Run a verified CLI manually, using `<MY_DEV_KIT_CLI>` as the executable
   selected for your environment.
4. Populate the packet and retrieval-report metadata and required sections.
5. Reference the raw context-capsule, retrieval-audit, and after-index evidence
   files; do not paste their full contents into the supplemental documents.
6. Run `my-dev-kit-orchestrator status`.
7. Run `my-dev-kit-orchestrator check` or
   `my-dev-kit-orchestrator check --all`.
8. Print the target prompt again.
9. Proceed with implementation or test work only when readiness is `ready`.

The released `@dailephd/my-dev-kit@1.10.4` package is the verified producer
authority. Select and verify the exact producer CLI manually; no local
worktree path is part of this public contract.

The fixed files are:

- `artifacts/implementation-context-packet.txt`
- `reports/implementation-context-retrieval-report.txt`
- `artifacts/test-context-packet.txt`
- `reports/test-context-retrieval-report.txt`

When readiness is blocked, a direct `implementation` or
`test-implementation` prompt is refresh-only and prohibits normal work. A
ready direct stage renders its normal task. `prompt` display is read-only: it
does not create sidecars or templates and does not alter `run.json`,
`artifact-state.json`, or supplemental files.

Blocked output identifies one deterministic primary blocker and prints its
primary reason, corrective action, evidence target, and ordered blocking issue
codes. The same canonical details appear in `status`, failing `check` output,
refresh-only prompts, verification and judge context review, correction
routing, and exported readiness summaries.

## Start an extraction run

`--mode extraction` is available in v0.2.1.

### What extraction mode is for

Extraction mode transfers a bounded feature, workflow, subsystem, or behavior from an existing source repository into a new or separate target repository.

- the source repository is evidence for the porting analysis; it is treated as read-only by default
- the target repository is where the extracted workflow is implemented, tested, verified, and reported
- the orchestrator must not assume the target should inherit the source architecture

### Command

```bash
npx @dailephd/my-dev-kit-orchestrator start --mode extraction \
  --source "<source-repo-root>" \
  --target "<target-repo-root>" \
  "<extraction request>"
```

### Windows example

```powershell
npx @dailephd/my-dev-kit-orchestrator start --mode extraction `
  --source "C:\source-repository" `
  --target "C:\target-repository" `
  "Extract a bounded workflow into the target repository."
```

### Source and target index separation

Each repository uses its own `.my-dev-kit` index directory. The coding agent indexes the source repository separately from the target repository.

Source repository index:

```bash
<MY_DEV_KIT_CLI> index --root <source-repo-root> --out <source-repo-root>/.my-dev-kit
```

Target repository index (if the target already has source to inspect):

```bash
<MY_DEV_KIT_CLI> index --root <target-repo-root> --out <target-repo-root>/.my-dev-kit
```

Do not mix source and target retrieval results. Mixing them would undermine the porting analysis.

### Extraction workflow loop

The current runtime loop is:

1. start the extraction run
2. work through the extraction stages in order
3. save each extraction artifact before moving to the next stage
4. no implementation until the five pre-implementation analysis stages have
   produced all six gate artifact files; `porting-map` produces both the
   source-to-target map and the do-not-port list
5. implement only in the target repository
6. verify against the golden behavior contract in the judge stage

### Unsupported `--create-target` option

The CLI does not implement `--create-target`. Create the target repository
before starting an extraction run.

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
- implementation and test context decisions, freshness, adequacy, blocking
  issue summaries, and the recommended next stage when applicable
- suggested next command
- (`v1.2.3`) one "Judge and final-report
  integrity" section showing the expected judge verdict, the authored verdict
  and whether it was accepted, the correction state, and final-report
  eligibility -- the same canonical decision `check`, `prompt`, `mark`, and
  `export` use, so none of these can disagree

`status` is human-readable. The current CLI has no JSON option.

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

## Mark artifact state

Use `mark` to manually set the lifecycle state of a run artifact.

```bash
my-dev-kit-orchestrator mark <artifact-name> --state <state> [--reason "<reason>"]
```

Supported states:

- `incomplete` - artifact exists but is not finished; reason required
- `blocked` - artifact cannot be completed due to a blocker; reason required
- `complete` - artifact is ready for downstream stages; reason optional

Not supported (computed automatically):

- `missing` - computed from file absence
- `stale` - computed from upstream artifact timestamps

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

## Interpret lifecycle state in status output

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

## Continue an incomplete, blocked, or stale stage

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

## Runs without lifecycle metadata

Existing runs without an `artifact-state.json` continue to work:

- artifact file present -> `complete`
- artifact file missing -> `missing`

No migration is required for runs created before v0.3.0.

## Follow judge correction routing

When a run's judge report contains a non-PASS verdict, `status` and `prompt` integrate correction routing automatically.

### Status shows correction state

After `judge-report.txt` is saved, `status` shows a Judge correction section:

```text
Judge correction: IMPLEMENTATION_MISMATCH -> correction required
  Routed stage: implementation
```

For an accepted PASS (repository context ready or not required):

```text
Judge correction: PASS - no correction required
```

For an authored PASS that canonical readiness rejects (context still
`NEED_CONTEXT`; `v1.2.3`):

```text
Expected judge verdict: NEED_CONTEXT
Authored judge verdict: PASS
Verdict accepted: false
Mismatch reason: Authored verdict "PASS" contradicts the canonical expected verdict "NEED_CONTEXT".
Judge correction: correction required
Routed stage: implementation
```

The authored `PASS` is never treated as accepted in this case, and routing
returns to the canonical recommended stage rather than clearing correction
state.

For SCOPE_VIOLATION or BLOCKED:

```text
Judge correction: SCOPE_VIOLATION - run is blocked
  This run requires external resolution before it can continue.
```

No judge report -> the section is omitted (backward compatible with pre-v0.6.0 runs).

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

That table remains the default for historical/general correction routing. In
`v1.2.1`, a judge prompt blocked by context readiness supplies an
exact valid `Recommended next stage`: `implementation` takes priority when
implementation context is blocked, otherwise `test-implementation` is used
(and test mode always uses `test-implementation`). The existing recommended-
stage override honors that value; no new verdict or correction file is added.
In `v1.2.3`, an accepted `NEED_CONTEXT` always
uses this canonical recommended stage -- it overrides both the table default
and a conflicting `Recommended next stage:` value authored in the judge
report itself. Every other verdict's recommended-stage override is
unaffected.
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

Suggestions are deterministic - they map trace ID prefixes to owning stages without any LLM inference:

- missing `BEH-NNN` link target -> suggest `behavior-model`
- missing `PSE-NNN` link target -> suggest `pseudocode-packet`
- missing `TST-NNN` link target -> suggest `test-strategy`
- malformed trace ID -> suggest `design-map`
- orphan ID -> suggest `design-map`

### What correction routing does not do

- correction routing does not modify files automatically
- correction routing does not execute agents
- correction routing does not call an LLM
- correction routing does not restart the run automatically

After the correction prompt is used, the coding agent revises the artifact manually. The run resumes normally from the corrected stage.

### Final-report eligibility (v1.2.3)

A normal `final-report` prompt renders, and `final-report.txt` can complete
the run, only when the judge verdict is accepted `PASS`, no correction route
is active, and every required prior artifact is complete. When it is not
eligible:

```bash
my-dev-kit-orchestrator prompt final-report
```

prints a blocked report instead of the normal `FinalReport` prompt:

```text
Final-report generation is BLOCKED. This run is not eligible for a normal final report.

Expected judge verdict: NEED_CONTEXT
Judge artifact present: true
Judge verdict parse status: parsed
Authored judge verdict: PASS
Judge verdict matches expected: false
Judge verdict accepted: false
```

An existing `final-report.txt` file, an `artifact-state.json` `complete`
record, or `mark final-report.txt --state complete` cannot make an ineligible
run reach the completed state; `mark` rejects the manual completion attempt
before it changes any lifecycle state.

## Check trace links

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

- `[pass]` - no trace issues
- `[warn]` - possible problem (duplicate declared ID, orphan ID that appears in no link)
- `[fail]` - definite problem (malformed trace ID token, link target not declared in this artifact)

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

## Check artifact and prompt content

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

- `[pass]` - no issues
- `[warn]` - possible problem (empty section, placeholder content, status mismatch)
- `[fail]` - definite problem (missing file, missing required section)

For each prompt:

- `[pass]` - all required prompt elements present
- `[warn]` - prompt missing optional elements (output artifact declaration, placeholder text)
- `[fail]` - prompt missing file, empty, or missing required stage elements

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

### Content checks do not mutate lifecycle state

The `check` command is read-only and does not advance stages or mutate
lifecycle state. Context readiness is included: blocking context issues make
the command exit nonzero, while warning-only context conditions do not fail.
Duplicate failures for the same context kind are suppressed.

## Check artifact contracts and stage gates

Use `check --artifacts` to run the v1.0.0 artifact contract checker across all stages:

```bash
my-dev-kit-orchestrator check --artifacts
my-dev-kit-orchestrator check --artifacts --strict
my-dev-kit-orchestrator check --artifacts --run 20260624T120000-add-logging
```

Each stage is checked for:

- missing artifact file (CONTRACT_MISSING_FILE)
- empty artifact file (CONTRACT_EMPTY_FILE)
- missing required section (CONTRACT_MISSING_SECTION)
- blank required section (CONTRACT_BLANK_SECTION; fail in strict mode)
- placeholder-only section content (CONTRACT_PLACEHOLDER_SECTION; fail in strict mode)
- malformed structured JSON (CONTRACT_MALFORMED_JSON)
- missing required structured field (CONTRACT_MISSING_FIELD)
- invalid required structured field (CONTRACT_INVALID_FIELD)
- predecessor artifact missing (CONTRACT_PREDECESSOR_MISSING; fail in strict mode)
- no content contract defined for this artifact kind (CONTRACT_STAGE_NO_CONTRACT; fail in strict mode)

Shared artifact checking does not impose one syntax on every file. Registered
JSON artifacts must remain valid JSON and satisfy their structured contracts;
plain-text artifacts continue to use required section headers.

`check --artifacts` also reports repository-context readiness and (`v1.2.3`)
judge and final-report integrity: structural
section checks passing does not make the command exit 0 when the run is
still context-blocked or the judge verdict was not accepted -- structural
artifact validity and run eligibility are checked separately.

Use `check --all` to run all checks in one pass:

```bash
my-dev-kit-orchestrator check --all
my-dev-kit-orchestrator check --all --strict
```

`check --all` includes a "Judge and final-report integrity" section
alongside contracts, stage gates, trace checks, and repository context
readiness. It fails when the authored judge verdict was rejected, is
malformed, or is unknown; an ordinary accepted correction-required verdict
(for example `IMPLEMENTATION_MISMATCH`) does not fail the command by itself.

`check --all` includes:

- artifact contracts (all stages)
- stage gate violations (detects when downstream artifact exists without required upstream)
- trace checks (all artifacts)
- design-map trace check (if design-map.txt exists)
- correction routing state
- implementation/test context readiness, with duplicate context-kind failures
  suppressed

## Export a run handoff

Use `export` to generate a portable plain-text run handoff for use in another session or agent:

```bash
my-dev-kit-orchestrator export
my-dev-kit-orchestrator export --run 20260624T120000-add-logging
my-dev-kit-orchestrator export --out handoff.txt
my-dev-kit-orchestrator export --out handoff.txt --overwrite
```

The export includes:

- run identity (ID, mode, status, current stage, created timestamp, run folder)
- original request
- artifact checklist (present or missing per stage)
- missing artifact list
- judge verdict, and (`v1.2.3`) whether it was
  accepted -- never a raw authored `PASS` that canonical readiness rejected
- correction state, derived from the same accepted judge state `status` and
  `check` use
- verification evidence excerpt
- content check and trace check summaries
- structured implementation/test context-readiness summary
- next command (with correction context if correction is active)

Export behavior:

- default: print to stdout
- `--out <file>`: write to file; refuses if file already exists
- `--overwrite`: allow replacing an existing output file
- rejects raw parent-path traversal segments, symbolic-link targets,
  directory targets, and non-existent parent directories
- does not embed full raw capsule/audit contents or copy referenced external
  evidence files

## Troubleshooting

- If no run exists, start one with `start` before using `prompt`, `status`,
  `check`, or `export`.
- If a selected run cannot be found, confirm the value passed to `--run` and
  the project selected by `--root`.
- If a run was created with `start --output-dir`, current follow-up commands
  cannot rediscover it. Use the default run directory for resumable runs.
- A new run can make `check --artifacts` or `check --all` exit with status 1
  because required artifacts are missing. The result is a completed structural
  check with findings, not evidence of a CLI crash.
- The CLI generates guidance for external tools. It does not run a coding
  agent, Gradle, `my-dev-kit`, security validation, or publishing commands.
