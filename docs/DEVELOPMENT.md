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

- start from the branch named in the task or release prompt
- use branch names that describe the task clearly
- keep documentation-only work scoped to documentation and validation changes
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
- `src/traceChecker.ts`: deterministic trace link checker, `trace-check-results.json` persistence, and trace-aware correction suggestions (v0.5.0-v0.6.0)
- `src/judgeParser.ts`: judge verdict parser, `JUDGE_VERDICTS`, `parseJudgeReport` (v0.6.0)
- `src/correctionRouter.ts`: deterministic correction routing model, `routeJudgeVerdict`, `parseAndRoute` (v0.6.0)
- `src/correctionState.ts`: reads judge-report.txt and computes correction state per run (v0.6.0)
- `src/__tests__/`: Jest coverage for CLI behavior and workflow logic

## Development notes

- Keep the command surface small. The project is a workflow shell, not a large automation platform.
- Do not add direct LLM execution or automatic `my-dev-kit` execution.
- Prefer edits that preserve the existing workflow architecture instead of introducing parallel systems.
- Keep run folders local and untracked.
- When behavior changes, keep docs aligned with real CLI output, stage definitions, artifact paths, and package metadata.
- Run `npm run docs:check` when changing user-facing documentation.

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

## Judge correction routing implementation (v0.6.0)

`src/judgeParser.ts` parses judge report content:

- `JUDGE_VERDICTS`: const tuple of all supported verdict strings
- `parseJudgeReport(content)`: reads `Verdict:` and `Recommended next stage:` from plain-text judge report; case-insensitive label match; returns `ParsedJudgeReport` with parsed fields and any parse error

`src/correctionRouter.ts` routes verdicts to correction stages:

- `CORRECTABLE_STAGES`: stages that can receive a correction route
- `VERDICT_ROUTE_TABLE`: maps non-PASS verdicts to default correction stages
- `routeJudgeVerdict(parsed, options)`: pure routing function, no file I/O
- `parseAndRoute(content, options)`: convenience wrapper
- conflict detection: recommended stage vs. routing table -> warning in normal mode, `strictFail` + error in strict mode
- `SCOPE_VIOLATION` and `BLOCKED` route to `blocked` status

`src/correctionState.ts` wires the parser and router to the run folder:

- `readCorrectionState(runFolder, options)`: reads `artifacts/judge-report.txt` fresh each call; returns null when no judge report exists; no persistence file
- `isCorrectionActive(runFolder)`: convenience helper

`src/traceChecker.ts` trace-aware correction suggestions (added in v0.6.0):

- `suggestCorrectionStageFromTraceIssue(issue)`: maps `TRACE_MISSING_LINK_TARGET` context (ID prefix) to the owning stage; `TRACE_MALFORMED_ID` and `TRACE_ORPHAN_ID` suggest `design-map`
- `buildTraceCorrectionSuggestions(results)`: produces deduplicated suggestion strings for check output

## Trace checker implementation (v0.5.0)

`src/traceModel.ts` defines the canonical trace ID format:

- `TRACE_PREFIXES`: `['REQ','CTX','BEH','INV','TRN','PSE','TST','IMP','VER','RISK']`
- `TRACE_ID_RE`: `/^(REQ|CTX|BEH|INV|TRN|PSE|TST|IMP|VER|RISK)-(\d{3,})$/`
- `isValidTraceId(id)`: returns true for canonical format (e.g., `BEH-001`)
- `isMalformedTraceId(text)`: returns true for near-miss tokens (e.g., `BEH001`, `FOO-001`) that are not valid trace IDs

`src/traceParser.ts` provides low-level parsing utilities. For checker use, prefer `src/traceChecker.ts`.

`src/traceChecker.ts` owns all trace check logic:

- `parseDeclaredTraceIds(content)`: finds trace IDs on non-link lines only - lines containing `->` are skipped so that link target IDs are not counted as declared. This is critical for correct `TRACE_MISSING_LINK_TARGET` detection.
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

## Adding a workflow mode

Greenfield demonstrates the expected extension pattern. A new mode extends
the existing shared registries instead of introducing a parallel workflow or
artifact subsystem:

- `VALID_MODES` in `src/types.ts`
- `WORKFLOW_DEFINITIONS` and `ARTIFACT_MAP` in `src/workflows.ts`
- `STAGE_TO_KIND` and `SECTION_REGISTRY` in `src/artifactChecker.ts`

Mode-local constants may be spread into those registries, as greenfield does,
but the shared registries remain authoritative. Reuse existing stage names
and artifact paths when the stage semantics are shared.

Tests for a mode addition should cover its exact stage order, artifact paths,
required artifact sections, prompt generation, lifecycle progression,
`start`, `prompt`, `status`, and `list`. Also cover `check --artifacts`,
`check --all`, and `export`, plus regression coverage for existing modes.

The repository currently has both `src/__tests__/*.test.ts` and
`tests/**/*.spec.ts`. This convention split is a maintenance follow-up; do not
move tests merely while adding a mode.

## Adding a greenfield profile

Android Compose (`src/greenfield/profiles/androidComposeProfile.ts`)
demonstrates the expected extension pattern for a new greenfield starter
profile:

- register the new profile id in `GreenfieldProfileId`
  (`src/greenfield/profiles/profileTypes.ts`)
- provide every required `GreenfieldProfile` field, including the two command
  fields:
  - `setupCommands: GreenfieldProfileCommand[]` -- setup guidance (may be
    `[]` if the toolchain needs no separate install step, as with Gradle's
    wrapper); never executed by the orchestrator
  - `validationCommands: GreenfieldProfileCommand[]` -- validation guidance,
    each entry `{ command, purpose, required, environmentNotes? }`; mark a
    command `required: false` with an `environmentNotes` string when it
    depends on something the orchestrator cannot verify (e.g. a connected
    device or emulator)
- register the profile in `SUPPORTED_PROFILES`
  (`src/greenfield/profiles/resolveGreenfieldProfile.ts`)
- add a small, explicit, bounded set of aliases to `PROFILE_ALIASES` if the
  profile has reasonable alternate names -- do not add fuzzy or partial-word
  matching; a near-miss (e.g. a prefix or substring of a real alias) must not
  resolve to the new profile
- do not silently select the new profile from an ambiguous, technology-
  unspecified signal (e.g. a bare "mobile" request); prefer returning
  `'unresolved'` and require an explicit request or a recognized alias
- keep any genuinely unsupported adjacent platform (e.g. a competing
  framework) unaliased so it continues to fall through to `'unsupported'`

If the new profile's content legitimately mentions a term that would
otherwise look like a violation for other profiles (as Android/Jetpack/Kotlin
terms do for `android-compose`), make the check profile-conditional rather
than removing it globally:

- `buildBootstrapBundle.ts`'s validation-rules builder
- `validateBootstrapDocs()` (`src/greenfield/bootstrap/validateBootstrapDocs.ts`)

Required tests for a new profile: profile-shape tests (required fields,
command fields, unsupported conditions), profile-resolution tests (explicit
id, each alias, near-miss non-matches, regression for existing profiles),
bootstrap-bundle tests (profile-conditional validation rules), project-docs
bootstrap tests (profile-aware `validateBootstrapDocs` behavior), and
scaffold-plan tests (the new profile's `setupCommands`/`validationCommands`
flow through unchanged, with no hardcoded assumption from another profile
leaking in).

Do not hardcode a profile list in documentation or in
`scripts/check-docs-consistency.mjs`; extract supported profile ids from
`SUPPORTED_PROFILES` in `resolveGreenfieldProfile.ts` the same way modes are
extracted from `VALID_MODES` and greenfield stages from
`GREENFIELD_STAGE_NAMES`, so docs and the docs-consistency gate cannot drift
from source when a profile is added or removed.

## Verification expectations

- Confirm user-facing documentation matches the shipped command behavior.
- Verify changes with the narrowest relevant checks first, then broader ones when needed.
- Run at least `npx tsc --noEmit`, `npm test`, and `npm run build` for release-facing changes when feasible.
- Run `npm run lint` when changing TypeScript files.
- Keep the GitHub Actions OS matrix on `ubuntu-latest`, `windows-latest`, and `macos-15` for release-facing CI work, with Node 22 and Node 24.
- Report skipped checks and unresolved risks clearly in release work.
