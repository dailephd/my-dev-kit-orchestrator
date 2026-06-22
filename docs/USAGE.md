# Usage

This guide covers the practical `v0.1.0` CLI flow.

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

## Planned: extraction mode (v0.2.1)

`--mode extraction` is planned for a future release. The examples below document the intended command shape for when the runtime implementation is available.

### What extraction mode is for

Extraction mode transfers a bounded feature, workflow, subsystem, or behavior from an existing source repository into a new or separate target repository.

- the source repository is evidence for the porting analysis; it is treated as read-only by default
- the target repository is where the extracted workflow is implemented, tested, verified, and reported
- the orchestrator must not assume the target should inherit the source architecture

### Planned command shape

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

### Planned extraction workflow loop

When the runtime is available, the intended loop is:

1. start the extraction run
2. work through the extraction stages in order
3. save each extraction artifact before moving to the next stage
4. no implementation until all five pre-implementation artifacts are complete
5. implement only in the target repository
6. verify against the golden behavior contract in the judge stage

### What `--create-target` would do (possible future behavior)

A `--create-target` flag that initializes the target repository before the run is a possible future addition. It is not implemented in the current release. Do not assume this flag exists.

### Note on implementation state

The examples above document the intended command shape. They will not work until the runtime implementation of `--mode extraction` is available. See [docs/ROADMAP.md](ROADMAP.md) for the planned timeline.

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
