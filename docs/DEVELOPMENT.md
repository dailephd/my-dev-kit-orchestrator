# Development

Continuous-integration coverage is documented in [CI/CD](CI_CD.md); the
maintainer publication procedure is documented in [Release](RELEASE.md).

## Prerequisites

Node.js 24 or later is required, and `package.json` declares `>=24`. The
ordinary validation workflow requires Node.js 24. The pre-release matrix also
uses Node.js 26 as supplementary forward-compatibility evidence. Both workflows
cover `ubuntu-latest`, `windows-latest`, and `macos-15`.

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
- `src/stageDetector.ts`: effective lifecycle and run-integrity-aware next-stage
  detection, with file-presence helpers retained for backward compatibility
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
  implementation, including `src/greenfield/fullstack/` (implemented
  candidate, unpublished): the single supported full-stack capability
  (`fullstack-web` + `nextjs` + `nextjs-app` + PostgreSQL + Prisma + Docker),
  resolved and validated separately from starter-profile selection and
  composed additively into `src/greenfield/scaffold/buildScaffoldPlan.ts` and
  `src/greenfield/readiness/`
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
- Update the preservation manifest when a canonical document role, protected
  structure, or source-owned inventory changes; extend the existing checker
  instead of adding a parallel documentation framework.
- Review `git status`, stage exact files, and keep generated reports, build
  output, coverage, package archives, and local run/index state untracked.

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
- `src/promptGenerator.ts`: packet/context prompt integration, refresh-only
  rendering, and (`v1.2.3`) final-report blocked
  rendering
- `src/commands/status.ts`, `check.ts`, and `export.ts`: readiness
  presentation, validation, and portable summary, all consuming the same
  canonical run-integrity and judge-integrity decision
- `src/runIntegrityGate.ts` (`v1.2.3`): the sole
  canonical run-integrity evaluator; every readiness-sensitive command reads
  its result instead of recomputing readiness
- `src/judgeIntegrity.ts` (`v1.2.3`): authored
  judge-verdict acceptance against the gate's expected verdict, canonical
  `NEED_CONTEXT` correction routing, and final-report eligibility
- `src/instructions/supplementalPairReconciliation.ts`: packet/report pair
  reconciliation shared by `contextReadiness.ts`
- `src/artifactLifecycle.ts` and `src/stageDetector.ts`: artifact lifecycle
  resolution and stage detection, with gate-aware variants consumed by
  `prompt.ts`, `mark.ts`, and `status.ts`

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

Run-integrity, judge-integrity, and final-report-eligibility changes
(`v1.2.3`) additionally require:

```bash
npx jest tests/contextReadiness.test.ts tests/myDevKitEvidenceSummary.test.ts tests/contextReadinessHistoricalMatrix.test.ts --runInBand
npx jest tests/runIntegrityGate.test.ts tests/runIntegrityGateCliIntegration.test.ts tests/runIntegrityGateFrozenRunReplay.test.ts --runInBand
npx jest tests/judgeIntegrity.test.ts tests/judgeIntegrityCliIntegration.test.ts tests/correctedReadyReplay.test.ts --runInBand
npx jest tests/v123Batch4FrozenRegression.test.ts tests/v123Batch4NegativeMatrix.test.ts tests/v123Batch4LegacyCompatibility.test.ts --runInBand
```

`tests/fixtures/v123-batch4/{frozen-run,corrected-run}/` are permanent,
committed regression fixtures: a distillation of a real historical defect
(an authored `PASS` judge verdict accepted while repository context was
refresh-required) and its corrected counterpart. Tests copy their contents
into a disposable directory before any mutation and assert the fixture files
are unchanged afterward; never edit them except to correct an error in the
distillation itself.

Standardized-document, full-stack capability, and judge/final-report
lifecycle changes (`v1.3.1`, implemented candidate, unpublished)
additionally require:

```bash
npx jest tests/greenfield --runInBand
```

`tests/greenfield/fullstackCapability.spec.ts`,
`fullstackReadiness.spec.ts`, and `fullstackScaffoldComposition.spec.ts`
cover full-stack capability resolution/validation and its additive
composition into scaffold planning and readiness.
`tests/greenfield/readinessLifecycleCorrection.spec.ts` covers the
judge/final-report readiness gate (`TST-B5C-001` through `TST-B5C-016`) and
the verification-report artifact-path regression
(`TST-VPATH-001` through `TST-VPATH-010`), which proves the generated
verification/judge/final-report prompts, canonical greenfield readiness, and
final-report artifact-lifecycle validation all agree on
`artifacts/verification-report.txt`.

To extend supported project types, web frameworks, or environment
capabilities safely: represent a new dimension as its own field (like
`projectType`/`webFramework`) rather than folding it into
`GreenfieldProfileId`; resolve and validate a new capability under
`src/greenfield/fullstack/` (or a sibling directory) the same way, with its
own resolver and validator; and compose its targets/commands additively into
`buildScaffoldPlan.ts` and the existing readiness evaluator rather than
creating a second scaffold format, readiness engine, or artifact identity.
The same no-parallel-registry rule that applies to profiles
(`src/greenfield/profiles/`) applies to canonical documents
(`src/greenfield/bootstrap/projectDocBootstrapTypes.ts`) and capabilities: one
owner per concern, extracted dynamically by
`scripts/check-docs-consistency.mjs` rather than hardcoded into
documentation.

### Manual my-dev-kit integration caveat

The orchestrator does not execute `my-dev-kit`. A verified CLI must be selected
and run manually. The released `@dailephd/my-dev-kit@1.10.4` package is the
verified producer authority; no local worktree path is part of the public
contract. `v1.2.3` consumes v1.10.4's additive, condition-aware evidence when
a capsule/audit declares it; older schema-major-1 evidence remains fully
compatible without it.

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
- provide every required `GreenfieldProfile` field, including these four:
  - `setupCommands: GreenfieldProfileCommand[]` -- setup guidance (may be
    `[]` if the toolchain needs no separate install step, as with Gradle's
    wrapper); never executed by the orchestrator
  - `validationCommands: GreenfieldProfileCommand[]` -- validation guidance,
    each entry `{ command, purpose, required, environmentNotes? }`; mark a
    command `required: false` with an `environmentNotes` string when it
    depends on something the orchestrator cannot verify (e.g. a connected
    device or emulator)
  - `allowedDocumentationTerminology: readonly GreenfieldDocumentationTerminologyTag[]`
    -- the closed set of documentation terminology tags
    (`GREENFIELD_DOCUMENTATION_TERMINOLOGY` in `profileTypes.ts`; currently
    `ANDROID_JETPACK` and `NEXTJS_REACT`) this profile's generated docs may
    use. Most profiles use `[]` (no special terminology). Use
    `ANDROID_JETPACK` only for an Android/Jetpack-based profile and
    `NEXTJS_REACT` only for a Next.js/React-based profile.
    `validateGreenfieldProfile()` rejects unsupported or duplicate tags at
    runtime (`GF_PROFILE_UNSUPPORTED_FIELD`); TypeScript rejects them at
    compile time for the built-in profile literals. Adding a genuinely new
    documentation domain (not just a new profile that reuses an existing
    domain) means adding one entry to `GREENFIELD_DOCUMENTATION_TERMINOLOGY`
    plus its corresponding rule in `validateBootstrapDocs.ts` -- do not add a
    profile-ID conditional to work around the closed vocabulary.
  - `targetExpectations: readonly GreenfieldTargetExpectation[]` -- one
    entry per scaffold target this profile requires or permits, each
    `{ id, category, matcher: { kind: 'exact' | 'bounded-pattern', value }, required, purpose, evidenceKind }`.
    Adapt the profile's existing `templateTargets` entries into required
    `'exact'` expectations (`templateTargets` itself stays unchanged; it is
    still what `buildScaffoldPlan.ts` and existing tests consume). Use
    `'bounded-pattern'` only for a genuinely variable, language/package-
    dependent source root (see `targetPatternMatching.ts` for the grammar:
    literal segments, `*` for exactly one segment, at most one `**` for zero
    to eight segments -- no regex, character classes, or brace expansion).
    `category` is descriptive metadata only; it can never by itself satisfy
    an expectation. `validateGreenfieldScaffoldPlan()` uses this list to
    check the generated scaffold plan; it never reads the filesystem.
    Two non-identical expectations must not both be able to match the same
    evidence: `validateGreenfieldProfile()` rejects that as
    `GF_TARGET_OVERLAP` (identical normalized values are `GF_TARGET_DUPLICATE`
    instead), including bounded-pattern-versus-bounded-pattern overlap (e.g.
    `src/*/Main.kt` and `src/app/*` both accept `src/app/Main.kt`); see
    `patternsOverlap()` in `targetPatternMatching.ts`.
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
terms do for `android-compose`), keep the check global but make its
*applicability* profile-owned data rather than adding a new conditional:

- `buildBootstrapBundle.ts`'s validation-rules builder still branches on
  `selectedProfile.profile?.id` directly; follow that existing pattern there.
- `validateBootstrapDocs()` (`src/greenfield/bootstrap/validateBootstrapDocs.ts`)
  does **not** branch on profile id. It reads the selected profile's
  `allowedDocumentationTerminology` and permits only the terminology tags
  that profile declares. Declare the right tag on the new profile instead of
  editing `validateBootstrapDocs.ts`; only touch that file if the new
  profile needs a genuinely new terminology domain (see above).

Required tests for a new profile: profile-shape tests (required fields,
command fields, terminology-tag validity, unsupported conditions),
profile-resolution tests (explicit id, each alias, near-miss non-matches,
regression for existing profiles), bootstrap-bundle tests (profile-
conditional validation rules), project-docs bootstrap tests (profile-aware
`validateBootstrapDocs` behavior for the new profile's declared terminology),
scaffold-plan tests (the new profile's `setupCommands`/
`validationCommands` flow through unchanged, with no hardcoded assumption
from another profile leaking in), and readiness fixtures: a complete,
valid-readiness case in `evaluateGreenfieldReadiness.spec.ts` and a real
disk-backed case in `checkGreenfieldRunReadiness.spec.ts` (writing actual
`scaffold-plan.txt`/scaffold-implementation-report/first-vertical-slice/
verification-report files to a temp run folder) -- an in-memory-only
readiness fixture is not sufficient proof that a new profile works through
the real run-reading path.

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
- Keep required validation on Node.js 24, with supplementary Node.js 26
  pre-release coverage, across `ubuntu-latest`, `windows-latest`, and
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
