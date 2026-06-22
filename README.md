# my-dev-kit-orchestrator

`my-dev-kit-orchestrator` is a CLI-first workflow shell for design-first software development with coding agents.

It is for teams or individual developers who want a coding agent to work through a bounded sequence of design, pseudocode, testing, implementation, and verification steps instead of jumping straight from a raw request to code.

## Capabilities

`v0.1.0` provided the workflow shell:

- a small CLI command surface
- five workflow modes: `feature`, `repair`, `test`, `refactor`, `harden`
- local run folders under `.my-dev-kit-orchestrator/runs/`
- stage-specific prompt generation
- plain-text prompt and artifact files
- simple stage advancement based on expected artifact file existence

`v0.2.1` adds extraction mode:

- `--mode extraction` for transferring a bounded feature, workflow, or subsystem from an existing source repository into a new or separate target repository
- `--source <path>` and `--target <path>` options required for extraction runs
- the source repository is used for inspection and evidence only; the target repository is where the extracted workflow is implemented, tested, verified, and reported
- source and target `.my-dev-kit` index directories are kept separate
- extraction-specific 14-stage workflow with artifact gates before implementation begins: `SourceWorkflowMap`, `SourceToTargetPortingMap`, `DoNotPortList`, `GoldenBehaviorContract`, and `TargetArchitectureProposal`
- run artifacts placed under the target repository by default
- see [docs/WORKFLOWS.md](docs/WORKFLOWS.md) for the full extraction workflow and [docs/ARTIFACTS.md](docs/ARTIFACTS.md) for artifact contracts

`v0.2.0` added graph-guided architecture context support:

- architecture-context stage prompt now guides the coding agent through graph-guided context acquisition with `my-dev-kit`
- generated prompt includes the full retrieval sequence, retrieval evidence report template, and ArchitectureContextPacket template
- `status` command shows supporting report presence for the architecture-context stage
- stage progression remains based on required artifact presence only

The CLI owns workflow order and prompt generation. Each run advances as the expected artifact files appear on disk.

## How it works with my-dev-kit

`my-dev-kit` and `my-dev-kit-orchestrator` have different responsibilities.

- `my-dev-kit` retrieves bounded project context through graph-guided architecture context workflows such as indexing, search, lookup, slice generation, source retrieval, and optional semantic inspection
- `my-dev-kit-orchestrator` organizes the staged design-to-code workflow after context acquisition
- the coding agent records retrieval evidence in `reports/architecture-context-retrieval-report.txt`
- the coding agent synthesizes that evidence into `artifacts/architecture-context-packet.txt`
- downstream stages consume the ArchitectureContextPacket rather than raw retrieval output

See [ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/WORKFLOWS.md](docs/WORKFLOWS.md), and [docs/ARTIFACTS.md](docs/ARTIFACTS.md) for the detailed design.

## Non-goals for v0.1.0

Version `0.1.0` does not include:

- direct LLM execution
- automatic coding-agent execution
- automatic `my-dev-kit` command execution
- full JSON schema validation for artifacts
- automatic judge routing
- design-map generation
- extra low-level CLI commands beyond `init`, `start`, `status`, `prompt`, and `list`

Architecture-context prompts may suggest use of `my-dev-kit` when it is available, but `my-dev-kit-orchestrator` does not run `my-dev-kit` automatically.

## Command surface

```text
my-dev-kit-orchestrator init
my-dev-kit-orchestrator start "<request>"
my-dev-kit-orchestrator start --mode <feature|repair|test|refactor|harden> "<request>"
my-dev-kit-orchestrator status
my-dev-kit-orchestrator status --run <run-id>
my-dev-kit-orchestrator prompt
my-dev-kit-orchestrator prompt <stage>
my-dev-kit-orchestrator prompt <stage> --run <run-id>
my-dev-kit-orchestrator list
my-dev-kit-orchestrator list --mode <mode>
```

Common flags:

- `--root <path>`: use a specific project root
- `--mode <mode>`: choose the workflow mode for `start`
- `--name <run-name>`: use a readable suffix in the run ID
- `--run <run-id>`: target a specific run for `status` or `prompt`
- `--output-dir <path>`: write runs outside the default workspace

## Quick start

1. Install dependencies and build the CLI:

   ```bash
   npm install
   npm run build
   ```

2. Initialize the workspace in your project:

   ```bash
   node dist/cli.js init
   ```

3. Start a workflow run:

   ```bash
   node dist/cli.js start "add audit logging to the export command"
   ```

4. Print the next stage prompt:

   ```bash
   node dist/cli.js prompt
   ```

5. Paste the prompt into your coding tool of choice and save the returned artifact into the run folder.

6. Continue stage by stage:

   ```bash
   node dist/cli.js status
   node dist/cli.js prompt
   node dist/cli.js list
   ```

If you link the package locally, you can use the installed command directly:

```bash
npm link
my-dev-kit-orchestrator --help
```

## Supported modes

### `feature`

Use for new behavior or intentional behavior changes.

Stage order:
`request-brief -> architecture-context -> behavior-model -> pseudocode-packet -> test-strategy -> implementation -> test-implementation -> verification -> judge -> final-report`

### `repair`

Use when observed behavior diverges from intended design.

Stage order:
`observed-behavior-report -> architecture-context -> behavior-trace -> divergence-report -> correction-design -> regression-test-strategy -> implementation -> test-implementation -> verification -> judge -> final-report`

### `test`

Use for behavior-derived test design or test implementation for existing behavior.

Stage order:
`test-target-brief -> architecture-context -> behavior-reconstruction -> pseudocode-summary -> test-strategy -> test-implementation -> verification -> judge -> final-report`

### `refactor`

Use for structure changes that must preserve behavior.

Stage order:
`refactor-brief -> architecture-context -> existing-behavior-map -> preserved-invariant-list -> compatibility-test-strategy -> refactor-pseudocode-packet -> implementation -> test-implementation -> verification -> judge -> final-report`

### `harden`

Use for validation, guard, resilience, and failure-handling work.

Stage order:
`hardening-brief -> architecture-context -> assumption-report -> failure-mode-matrix -> guard-pseudocode-packet -> resilience-test-strategy -> implementation -> test-implementation -> verification -> judge -> final-report`

### `extraction`

Use for transferring a bounded feature, workflow, subsystem, or behavior from an existing source repository into a new or separate target repository.

Requires `--source <path>` (source repo, read-only evidence) and `--target <path>` (target repo, implementation destination).

Stage order:
`request-brief -> source-architecture-context -> source-workflow-map -> porting-map -> golden-behavior-contract -> target-architecture -> behavior-model -> pseudocode-packet -> test-strategy -> implementation -> test-implementation -> verification -> judge -> final-report`

See [docs/WORKFLOWS.md](docs/WORKFLOWS.md) and [docs/ARTIFACTS.md](docs/ARTIFACTS.md) for the full extraction workflow and artifact contracts.

## Run folder layout

Each run lives under `.my-dev-kit-orchestrator/runs/<run-id>/`.

```text
.my-dev-kit-orchestrator/
  config.json
  runs/
    <run-id>/
      00-request.txt
      run.json
      prompts/
      artifacts/
      reports/
```

Key files and folders:

- `00-request.txt`: the original request passed to `start`
- `run.json`: run metadata, mode, and ordered stage definitions
- `prompts/`: generated stage prompt files such as `01-request-brief.prompt.txt`
- `artifacts/`: stage outputs such as `request-brief.txt` and `pseudocode-packet.txt`
- `reports/`: reserved run folder for report-oriented outputs and future expansion

The next stage is determined by the first expected artifact file that is missing for the current workflow.

## Install, build, test

```bash
npm install
npm run build
npx tsc --noEmit
npm test
```

Optional local lint check:

```bash
npm run lint
```

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/USAGE.md](docs/USAGE.md)
- [docs/WORKFLOWS.md](docs/WORKFLOWS.md)
- [docs/ARTIFACTS.md](docs/ARTIFACTS.md)
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- [CHANGELOG.md](CHANGELOG.md)
- [ROADMAP.md](docs/ROADMAP.md)
