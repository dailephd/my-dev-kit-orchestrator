# my-dev-kit-orchestrator

A CLI-first workflow tool for design-first software development with coding agents.

## What it is

`my-dev-kit-orchestrator` helps you guide a coding agent through a structured design-to-code workflow instead of writing one large unstructured prompt.

The tool generates stage-specific prompts that keep the coding agent focused on one step at a time:

```
request
  → architecture context
  → behavior model
  → pseudocode packet
  → behavior-derived test strategy
  → implementation
  → test implementation
  → verification
  → judge
  → final report
```

Each stage produces a named artifact. The next stage reads those artifacts. Implementation and testing both work from the same pseudocode and behavior model.

## v0.1.0 command surface

```
my-dev-kit-orchestrator init
my-dev-kit-orchestrator start "<request>"
my-dev-kit-orchestrator start --mode feature "<request>"
my-dev-kit-orchestrator start --mode repair "<observed behavior>"
my-dev-kit-orchestrator start --mode test "<test target>"
my-dev-kit-orchestrator start --mode refactor "<refactor goal>"
my-dev-kit-orchestrator start --mode harden "<hardening goal>"
my-dev-kit-orchestrator status
my-dev-kit-orchestrator status --run <run-id>
my-dev-kit-orchestrator prompt
my-dev-kit-orchestrator prompt <stage>
my-dev-kit-orchestrator prompt <stage> --run <run-id>
my-dev-kit-orchestrator list
my-dev-kit-orchestrator list --mode <mode>
```

### Options

| Option | Description |
|--------|-------------|
| `--root <path>` | Project root directory (default: current working directory) |
| `--mode <mode>` | Workflow mode: feature \| repair \| test \| refactor \| harden |
| `--name <run-name>` | Readable name to include in the run ID |
| `--run <run-id>` | Select a specific run by ID |
| `--output-dir <path>` | Custom run output directory |

## Basic workflow

1. Initialize the workspace in your project:

   ```
   my-dev-kit-orchestrator init
   ```

2. Start a workflow run:

   ```
   my-dev-kit-orchestrator start "add user authentication to the login page"
   ```

3. Print the next stage prompt:

   ```
   my-dev-kit-orchestrator prompt
   ```

4. Paste the prompt into your coding agent.

5. Save the returned artifact into the run folder (e.g. `artifacts/request-brief.txt`).

6. Run `prompt` again to get the next stage:

   ```
   my-dev-kit-orchestrator prompt
   ```

7. Check progress:

   ```
   my-dev-kit-orchestrator status
   ```

8. List previous runs:

   ```
   my-dev-kit-orchestrator list
   ```

## Supported modes

| Mode | Use when |
|------|----------|
| `feature` | Adding or changing behavior (default) |
| `repair` | Observed behavior differs from intended design |
| `test` | Designing or implementing comprehensive tests for existing behavior |
| `refactor` | Changing code structure while preserving behavior |
| `harden` | Improving robustness, validation, and failure handling |

## Run folder layout

Each run is stored in `.my-dev-kit-orchestrator/runs/<run-id>/`:

```
.my-dev-kit-orchestrator/
  config.json
  runs/
    <run-id>/
      00-request.txt         # original request
      run.json               # run metadata and stage definitions
      prompts/               # generated stage prompts
        01-request-brief.prompt.txt
        02-architecture-context.prompt.txt
        03-behavior-model.prompt.txt
        ...
      artifacts/             # stage output artifacts (you paste/save these)
        request-brief.txt
        architecture-context-packet.txt
        behavior-model.txt
        ...
      reports/               # reports (future use)
```

The next stage is determined by the first expected artifact that is missing from `artifacts/`.

## Example usage

```bash
# Initialize workspace
my-dev-kit-orchestrator init

# Start a feature workflow
my-dev-kit-orchestrator start "add dark mode toggle to the settings page"

# Print and paste the first stage prompt
my-dev-kit-orchestrator prompt
# → paste into coding agent, get back RequestBrief
# → save output as .my-dev-kit-orchestrator/runs/<run-id>/artifacts/request-brief.txt

# Print the next stage prompt
my-dev-kit-orchestrator prompt
# → continues to architecture-context stage

# Print a specific stage prompt
my-dev-kit-orchestrator prompt implementation

# Check status
my-dev-kit-orchestrator status

# List all runs filtered by mode
my-dev-kit-orchestrator list --mode feature
```

## Architecture context and my-dev-kit

The architecture-context stage prompt includes guidance for using `my-dev-kit` when it is available in your project. This is prompt-driven, not automated.

If `my-dev-kit` is configured, the prompt instructs the coding agent to use graph-guided retrieval before broad file reading:

```
npx @dailephd/my-dev-kit <command>
```

`my-dev-kit-orchestrator` does not execute `my-dev-kit` automatically. The coding agent follows the prompt.

## What v0.1.0 does not do

- Does not call an LLM directly
- Does not execute your coding agent automatically
- Does not validate artifact content or enforce JSON schemas (artifacts are plain text files)
- Does not automatically run `my-dev-kit` commands
- Does not implement automatic judge routing or multi-agent orchestration
- Does not generate a design map

v0.1.0 is a practical workflow launcher and prompt manager. You paste the generated prompt into a coding agent, save the returned artifact, and continue stage by stage.

## Installation

```bash
npm install
npm run build
npm link  # makes my-dev-kit-orchestrator available globally
```

Or run directly:

```bash
npx my-dev-kit-orchestrator <command>
```

## Development

```bash
npm run typecheck    # TypeScript type checking
npm test             # run all tests
npm run build        # compile to dist/
npm run lint         # lint src/
```
