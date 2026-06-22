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

## Future extraction mode implementation

When the runtime implementation of `--mode extraction` is added, it will require:

- add `extraction` to the workflow mode definitions in `src/workflows.ts` with the planned stage order
- parse `--source` and `--target` flags in the `start` command
- store source and target repository paths in run metadata (`run.json`)
- generate extraction-specific prompts in `src/promptGenerator.ts` for each extraction stage
- add extraction artifact contracts matching the documented paths in `docs/ARTIFACTS.md`
- add status and progression behavior that handles the two-repo model
- preserve source repository read-only behavior by default
- add Jest tests for:
  - `extraction` mode stage order
  - `--source` and `--target` flag parsing
  - extraction artifact path generation
  - source/target run metadata storage
  - extraction-specific prompt content

Do not implement extraction runtime before those items are explicitly scoped. Do not use this documentation as a substitute for proper source-code review when the time comes.

## Verification expectations

- Confirm user-facing documentation matches the shipped command behavior.
- Verify changes with the narrowest relevant checks first, then broader ones when needed.
- Run at least `npx tsc --noEmit`, `npm test`, and `npm run build` for release-facing changes when feasible.
- Run `npm run lint` when changing TypeScript files.
- Report skipped checks and unresolved risks clearly in release work.
