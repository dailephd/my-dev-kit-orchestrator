# Development

## Prerequisites

The package does not declare a Node.js version range in `package.json`. The
ordinary validation workflow runs on Node.js 22 and Node.js 24, while the
pre-release matrix uses Node.js 26 as supplementary forward-compatibility
evidence before publication. Both
workflows cover `ubuntu-latest`, `windows-latest`, and `macos-15`. Local
compatibility validation used Node.js 24.11.0. The completed feature branch also
has live cross-platform CI evidence from its validation checkpoint.

## Local setup

Install dependencies:

```bash
npm ci
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

Documentation checks:

```bash
npm run docs:check
npm run lint:docs
```

Typecheck:

```bash
npm run typecheck
```

Run tests:

```bash
npm test -- --runInBand
```

Run security-focused package checks:

```bash
npm run test:security
```

Run the greenfield suites:

```bash
npx jest tests/greenfield --silent
```

Build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

## Contribution boundaries

- start from the branch named in the task or release prompt
- use branch names that describe the task clearly
- keep documentation-only work scoped to documentation and validation changes
- do not push, tag, or publish unless explicitly asked

## Source layout

Important implementation files:

- `src/program.ts`: root CLI program, command registration, version
- `src/commands/`: `init`, `start`, `status`, `prompt`, `list`, `mark`, `check`,
  and `export`
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
- `src/greenfield/`: brief, profile, bootstrap, scaffold, and greenfield-mode
  implementation
- `src/__tests__/`: Jest coverage for shared CLI behavior and workflow logic
- `tests/greenfield/`: greenfield and starter-profile regression suites
- `docs/`: public documentation and release guidance
- `dist/`: generated build output; do not edit or commit it
- `.my-dev-kit-orchestrator/` and `.my-dev-kit/`: local generated state; keep
  both untracked

## Development notes

- Keep the command surface small. The project is a workflow shell, not a large automation platform.
- Do not add direct LLM execution or automatic `my-dev-kit` execution.
- Prefer edits that preserve the existing workflow architecture instead of introducing parallel systems.
- Keep run folders local and untracked.
- When behavior changes, keep docs aligned with real CLI output, stage definitions, artifact paths, and package metadata.
- Run `npm run docs:check` when changing user-facing documentation.

## Instruction and context source ownership

- `src/workflows.ts`: workflow stage order and prompt/artifact filenames
- `src/instructions/catalog.ts`, `catalogIds.ts`, and `catalogTypes.ts`:
  instruction entries, stable IDs, and schema/version constants
- `src/instructions/catalogValidation.ts`: exact catalog validation
- `src/instructions/catalogResolver.ts`: exact-ID dependency resolution
- `src/instructions/workflowInstructionPacket.ts`: packet assembly
- `src/instructions/workflowInstructionPacketSerialization.ts`: canonical
  packet serialization and sidecar path/content
- `src/instructions/workflowInstructionPacketRenderer.ts`: generalized packet
  rendering
- `src/instructions/taskState.ts`: in-memory `TaskState`
- `src/instructions/stageContextBundle.ts`: in-memory `StageContextBundle`
- `src/instructions/supplementalContextTypes.ts` and
  `supplementalContextContracts.ts`: supplemental schemas and contracts
- `src/instructions/supplementalContextParser.ts`: bounded document parser
- `src/instructions/stageRepositoryEvidenceRequirements.ts`: exact 11-stage
  requirement registry and four fixed paths
- `src/instructions/repositoryEvidenceReference.ts`: structural evidence
  reference assembly
- `src/instructions/myDevKitEvidenceSummary.ts`: raw capsule/audit projection
- `src/instructions/testResponsibilityCriticality.ts`: criticality and mapping
  parsing
- `src/instructions/contextReadiness.ts`: per-requirement readiness evaluation
- `src/instructions/runContextReadiness.ts`: mode-level aggregation and
  deterministic recommendation
- `src/promptGenerator.ts`: packet/context prompt integration and refresh-only
  rendering
- `src/commands/status.ts`, `check.ts`, and `export.ts`: readiness presentation,
  validation, and portable summary

## Validation and compatibility fixtures

Run the release-facing validation set from a clean dependency installation:

```bash
npm ci
npm run typecheck
npm test -- --runInBand
npm run build
npm run docs:check
npm run smoke:cli
npm run smoke:context
npm run lint
npm run lint:docs
npm run test:security
node dist/cli.js --version
node dist/cli.js --help
npm pack --dry-run
git diff --check
```

The compatibility manifest is derived from runtime workflow, CLI, schema, and
verdict owners. The v1.2.0 baseline inventory and prompt hashes protect
unchanged contracts; v1.2.1 prompt hashes protect intentional packet/context
structure. Ready-context helpers, legacy-run fixtures, and deterministic
generators cover readiness and compatibility. Two fixture-generator tests are
intentionally skipped during an ordinary suite and run only when regenerating
fixtures. Tests and fixtures are excluded from npm package output because the
package `files` policy includes only `dist`.

Context-readiness changes require both focused owner tests and the historical
readiness matrix. The historical readiness matrix covers accepted producer
evidence, raw and supplemental contradictions, repository and index
mismatches, truncation, provenance, responsibility mappings, stale evidence,
schema-major-1 evidence, and legacy runs. Consumer integration tests must
confirm that prompts, `status`, `check`, verification, judge, correction
routing, and `export` preserve the canonical primary blocker.

### Manual my-dev-kit integration caveat

The orchestrator does not execute `my-dev-kit`. A verified CLI must be selected
and run manually. The published `@dailephd/my-dev-kit@1.10.3` package is the
verified authority for the corrected role-aware producer behavior; no local
worktree path is part of the public contract.

### Known instruction and context limitations

- `scaffold-plan` and `scaffold-implementation` retain the specialized
  greenfield scaffold renderer.
- Extraction command examples are not fully promoted into command catalog
  entries.
- Extraction has no generic `architecture-context` stage; exact
  `NEED_CONTEXT` recommendations are safe, but generic non-`NEED_CONTEXT`
  architecture routing remains a pre-existing edge case.
- There is no automatic retrieval, status JSON option, shared schema package,
  or `my-dev-kit-lab` runtime integration.

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
- Complete validation requires both `npm test` and `npm run verify`, in either
  order, each exactly once. `npm test` runs the complete Jest suite. `npm run
  verify` runs the non-test verification chain (typecheck, build, lint,
  lint:docs, docs:check, the package-content security contract check, and the
  CLI smoke checks) and intentionally excludes the test suite, so running
  both does not execute the suite twice. `npm run verify` alone is not a
  substitute for `npm test`.
- Keep ordinary validation on Node.js 22 and Node.js 24, with the supplementary
  Node.js 26 pre-release matrix, across `ubuntu-latest`, `windows-latest`, and
  `macos-15`.
- Report skipped checks and unresolved risks clearly in release work.

## Validation matrix

| Change | Required checks |
| --- | --- |
| Documentation only | `npm run docs:check`, `npm run lint:docs` |
| CLI behavior | Targeted tests, `npx tsc --noEmit`, `npm test`, `npm run build`, CLI smoke |
| Artifact or check behavior | Targeted checker tests plus the full CLI validation set |
| Greenfield profile | `npx jest tests/greenfield --silent` plus the full validation set |

Keep contributor validation separate from package publication. Do not bump,
tag, publish, or create a release as part of an ordinary development change.
