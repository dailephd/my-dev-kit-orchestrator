# Development

## Local setup

Install dependencies:

```bash
npm install
```

Build the CLI:

```bash
npm run build
```

Run the compiled CLI locally:

```bash
node dist/cli.js --help
```

## Common development commands

Typecheck:

```bash
npx tsc --noEmit
```

Run tests:

```bash
npm test
```

Build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

## Branch expectations

For `v0.1.0` work:

- start from `feature/v0.1.0-workflow-shell` unless a task says otherwise
- use professional branch names that describe the task clearly
- merge task branches back into `feature/v0.1.0-workflow-shell`
- do not push, tag, or publish unless explicitly asked

## Source layout

Important implementation files:

- `src/program.ts`: root CLI program, command registration, version
- `src/commands/`: `init`, `start`, `status`, `prompt`, `list`
- `src/workflows.ts`: workflow stage order and artifact mappings
- `src/promptGenerator.ts`: stage-specific prompt text generation
- `src/run.ts`: run creation and run metadata handling
- `src/stageDetector.ts`: artifact presence checks and next-stage detection
- `src/workspace.ts`: workspace creation and config handling
- `src/__tests__/`: Jest coverage for CLI behavior and workflow logic

## Development notes

- Keep the command surface small. `v0.1.0` is a workflow shell, not a large automation platform.
- Do not add direct LLM execution or automatic `my-dev-kit` execution in `v0.1.0`.
- Prefer edits that preserve the existing workflow architecture instead of introducing parallel systems.
- Keep run folders local and untracked.
- When behavior changes, keep docs aligned with the real CLI output and stage definitions.

## Extraction mode implementation (v0.2.1)

`--mode extraction` is implemented in v0.2.1. Implementation files:

- `src/types.ts`: `extraction` added to `VALID_MODES`
- `src/workflows.ts`: `EXTRACTION_STAGES`, `ADDITIONAL_ARTIFACT_MAP` for the `porting-map` dual-artifact stage, and `extraction` entry in `WORKFLOW_DEFINITIONS`
- `src/run.ts`: `sourceRepoRoot` and `targetRepoRoot` optional fields in `RunMetadata` and `createRun` options
- `src/commands/start.ts`: `--source` and `--target` options; validation that both are required for extraction mode; `projectRoot` set to `targetRepoRoot` for extraction runs
- `src/promptGenerator.ts`: `sourceRepoRoot` and `targetRepoRoot` in `PromptContext`; extraction-specific prompt functions for all 14 stages
- `src/stageDetector.ts`: `allArtifactsPresent` helper checks primary and `additionalArtifactFiles`; `source-architecture-context` added to `STAGE_SUPPORTING_REPORTS`
- `src/commands/status.ts`: source and target repository paths shown for extraction runs
- `src/__tests__/extraction-mode.test.ts`: dedicated extraction mode test suite

## Verification expectations

- Confirm user-facing documentation matches the shipped command behavior.
- Verify changes with the narrowest relevant checks first, then broader ones when needed.
- Run at least `npx tsc --noEmit`, `npm test`, and `npm run build` for release-facing changes when feasible.
- Run `npm run lint` when changing TypeScript files.
- Keep the GitHub Actions OS matrix on `ubuntu-latest`, `windows-latest`, and `macos-latest` for release-facing CI work.
- Report skipped checks and unresolved risks clearly in release work.
