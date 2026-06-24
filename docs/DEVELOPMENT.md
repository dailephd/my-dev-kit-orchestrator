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
- `src/commands/`: `init`, `start`, `status`, `prompt`, `list`, `mark`, `check`
- `src/workflows.ts`: workflow stage order and artifact mappings
- `src/promptGenerator.ts`: stage-specific prompt text generation
- `src/run.ts`: run creation and run metadata handling
- `src/stageDetector.ts`: artifact presence checks and next-stage detection
- `src/workspace.ts`: workspace creation and config handling
- `src/artifactChecker.ts`: artifact content checks and section requirement registry (v0.4.0)
- `src/promptChecker.ts`: prompt quality checks and check-results persistence (v0.4.0)
- `src/traceModel.ts`: trace prefix constants, canonical ID regex, `isValidTraceId`, `isMalformedTraceId` (v0.5.0)
- `src/traceParser.ts`: trace ID and link parsing utilities (v0.5.0)
- `src/traceChecker.ts`: deterministic trace link checker and `trace-check-results.json` persistence (v0.5.0)
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

## Trace checker implementation (v0.5.0)

`src/traceModel.ts` defines the canonical trace ID format:

- `TRACE_PREFIXES`: `['REQ','CTX','BEH','INV','TRN','PSE','TST','IMP','VER','RISK']`
- `TRACE_ID_RE`: `/^(REQ|CTX|BEH|INV|TRN|PSE|TST|IMP|VER|RISK)-(\d{3,})$/`
- `isValidTraceId(id)`: returns true for canonical format (e.g., `BEH-001`)
- `isMalformedTraceId(text)`: returns true for near-miss tokens (e.g., `BEH001`, `FOO-001`) that are not valid trace IDs

`src/traceParser.ts` provides low-level parsing utilities. For checker use, prefer `src/traceChecker.ts`.

`src/traceChecker.ts` owns all trace check logic:

- `parseDeclaredTraceIds(content)`: finds trace IDs on non-link lines only — lines containing `->` are skipped so that link target IDs are not counted as declared. This is critical for correct `TRACE_MISSING_LINK_TARGET` detection.
- `checkArtifactTrace(runFolder, artifactFile)`: checks one artifact for malformed IDs, duplicate declared IDs, orphan IDs, and missing link targets. Missing files return `passed: true` with no issues (the artifact checker handles missing files separately).
- `checkAllTraces(meta)`: runs `checkArtifactTrace` for all run artifact files
- `checkDesignMapTrace(runFolder)`: shorthand for checking `artifacts/design-map.txt`
- `readTraceCheckResults(runFolder)` and `writeTraceCheckResults(runFolder, data)`: persistence for `trace-check-results.json`. Writes are atomic via a `.tmp` rename.

### Orphan detection rule

A declared trace ID is orphan only if trace links exist in the artifact. If the artifact has no links at all, no orphan warnings are raised. This prevents false positives for artifacts that use trace IDs as labels without linking.

## Artifact content checker implementation (v0.4.0)

`src/artifactChecker.ts` contains the section requirement registry and all check logic.

- `SECTION_REGISTRY`: maps artifact kind names (e.g., `'RequestBrief'`) to arrays of required section names
- `STAGE_TO_KIND`: maps stage names across all workflow modes to artifact kind names
- `parseArtifact(content)`: regex `/^([A-Z][A-Za-z0-9 ()/-]{0,79}):\s*(.*)$/` matches section headers (must start with uppercase to exclude list items and numeric lines)
- `checkArtifact(runFolder, artifactFile, stageName, stateFile)`: runs all checks for a single artifact
- `checkAllArtifacts(meta, stateFile)`: runs `checkArtifact` for every stage including `additionalArtifactFiles`

### Extending the section requirement registry

To add required sections for a new artifact kind:

1. Add the artifact kind name to `SECTION_REGISTRY` in `src/artifactChecker.ts`
2. Map the stage name to the artifact kind in `STAGE_TO_KIND`
3. Ensure the section names match the exact headers the coding agent will produce (the promptGenerator return-format templates are the source of truth)

### Check results persistence

`src/promptChecker.ts` owns `artifact-check-results.json` persistence:

- `getCheckResultsPath(runFolder)`: returns the results file path
- `readCheckResults(runFolder)`: reads and parses `artifact-check-results.json`, returns `null` if absent
- `writeCheckResults(runFolder, data)`: writes `artifact-check-results.json`

`status` command reads `artifact-check-results.json` via `readCheckResults` to render the content check summary line.

## Verification expectations

- Confirm user-facing documentation matches the shipped command behavior.
- Verify changes with the narrowest relevant checks first, then broader ones when needed.
- Run at least `npx tsc --noEmit`, `npm test`, and `npm run build` for release-facing changes when feasible.
- Run `npm run lint` when changing TypeScript files.
- Keep the GitHub Actions OS matrix on `ubuntu-latest`, `windows-latest`, and `macos-latest` for release-facing CI work.
- Report skipped checks and unresolved risks clearly in release work.
