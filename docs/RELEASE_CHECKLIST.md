# Release Checklist

Use this checklist for release-readiness work. This file is a checklist
template, not evidence that the listed steps have already run. The current
release is `v1.2.3`; older releases remain historical baselines.

## Current release baseline

- [ ] package metadata and `node dist/cli.js --version` match the target release
- [ ] docs describe seven modes and list `greenfield` as the seventh
- [ ] docs describe 79 native stages and preserve exact stage order
- [ ] docs describe the 13 greenfield stages and implemented artifact paths
- [ ] docs describe all current greenfield starter profiles (`typescript-cli`, `nextjs-app`, `android-compose`) sourced from `SUPPORTED_PROFILES` in `resolveGreenfieldProfile.ts`, not a hardcoded list
- [ ] docs identify current `v1.2.3` and scope older versions historically

## Required local validation

- [ ] `npm run docs:check`
- [ ] `npm run lint:docs`
- [ ] `npm run lint`
- [ ] `npm run test:security`
- [ ] `npx jest tests/documentationConsistency.test.ts --runInBand`
- [ ] `npm run typecheck`
- [ ] `npm test -- --runInBand`
- [ ] `npm run build`
- [ ] `node dist/cli.js --version`
- [ ] `node dist/cli.js --help`
- [ ] `npm run smoke:context`
- [ ] `npm pack --dry-run`
- [ ] `git diff --check`

## Documentation and context-readiness audit

- [ ] if a local project plan exists, confirm it is untracked, ignored, absent
  from package output, and not linked as public documentation
- [ ] public technical documents contain no detailed planning chapters,
  candidate architecture, implementation-batch tracking, or contradictory
  current-version status
- [ ] required headings, forbidden headings, and major heading order satisfy
  the preservation manifest
- [ ] all eight CLI commands and seven workflow modes match built `--help`
- [ ] all 79 native stages have catalog identities and instruction-packet sidecars
- [ ] the two specialized greenfield scaffold-renderer exceptions are disclosed
- [ ] the exact 11 context-sensitive direct stages are documented (five
  implementation context and six test context)
- [ ] all instruction/context schemas are documented as `1.0.0`
- [ ] all four fixed supplemental context paths match source constants
- [ ] docs state that repository retrieval is manual and use
  `<MY_DEV_KIT_CLI>` rather than guaranteeing a mismatched published executable
- [ ] docs state that supplemental context files and sidecars are not native
  lifecycle artifacts
- [ ] docs state that `TaskState` and `StageContextBundle` are not persisted
- [ ] docs state that `status` has no JSON option
- [ ] refresh-only prompts, verification/judge review, `NEED_CONTEXT`, and the
  exact `Recommended next stage` policy are documented
- [ ] every refresh-required result has a deterministic primary blocker,
  primary reason, corrective action, evidence target, and ordered issue codes
- [ ] `status`, `check`, prompts, verification, judge, correction routing, and
  `export` present the canonical blocker consistently
- [ ] the historical readiness matrix covers valid, contradictory, mismatched,
  truncated, unmapped, stale, schema-major-1, and legacy evidence
- [ ] docs claim only repository and index identity checks implemented by the
  raw and supplemental context contracts, not workflow, stage, or run identity
- [ ] Node.js 24 is the required runtime and blocking cross-platform matrix;
  Node.js 26 coverage is supplementary and described separately from local
  Node.js 24.11.0 evidence

## Temporary-directory smoke

- [ ] run `init`
- [ ] run `start --mode greenfield "<project idea>"`
- [ ] run `prompt`
- [ ] run `status`
- [ ] run `list`
- [ ] run `check --artifacts` and record expected missing-artifact findings
- [ ] run `check --all` and record expected missing-artifact findings
- [ ] run `export --out greenfield-export.txt`
- [ ] run `export --out ../unsafe-export.txt` and confirm rejection
- [ ] remove the temporary directory

## v1.2.0 Android Compose greenfield smoke

Repeat the temporary-directory smoke above with an explicit Android Compose
request, in a separate temporary directory:

- [ ] run `init`
- [ ] run `start --mode greenfield "Create an Android Compose habit tracker app"`
- [ ] run `prompt` (confirm the run stays `mode: greenfield`, never a separate mobile/Android mode)
- [ ] run `status`
- [ ] run `list`
- [ ] run `check --artifacts` and record expected missing-artifact findings
- [ ] run `check --all` and record expected missing-artifact findings
- [ ] run `export --out android-compose-export.txt`
- [ ] run `export --out ../unsafe-export.txt` and confirm rejection
- [ ] confirm no Gradle command was executed and no Android SDK was required anywhere in this smoke pass
- [ ] remove the temporary directory

## Cross-platform and security gates

- [ ] required validation covers `windows-latest`, `macos-15`, and
  `ubuntu-latest` with Node.js 24
- [ ] pre-release validation covers the same operating systems with Node.js 24
  and supplementary Node.js 26 jobs
- [ ] after the branch is pushed, record the actual live CI result separately
- [ ] `my-dev-kit-lab` self-validation passes
- [ ] `my-dev-kit-lab` target security validation passes

## Scope and limitations audit

- [ ] Android Compose support is profile-guided planning only: the orchestrator does not run Gradle and does not require the Android SDK
- [ ] generic mobile requests remain ambiguous/unresolved rather than silently selecting a profile; iOS, Flutter, and React Native remain unsupported; no mobile mode exists
- [ ] shared artifact checking is used; no `validateGreenfieldArtifacts.ts` exists
- [ ] component docs remain empty until brief schema module/component hints exist
- [ ] `src/__tests__/*.test.ts` and `tests/**/*.spec.ts` remain intentionally split
- [ ] release notes do not claim autonomous project generation, publication, or security execution by the CLI itself
- [ ] release notes disclose manual `my-dev-kit` execution and that the
  released `@dailephd/my-dev-kit@1.10.4` package is the verified producer
  authority

### v1.2.2 release preparation and publication procedure

This procedure is inactive until a separately authorized release workflow
begins. Completing this checklist does not itself authorize a release.

1. Verify the corrected `v1.2.2` candidate commit and a clean candidate branch.
2. Confirm that `@dailephd/my-dev-kit-orchestrator@1.2.2` is available on npm.
3. Create `release/v1.2.2` from the verified candidate.
4. Update `package.json` and both package-lock root version fields to `1.2.2`.
5. Update the changelog and release-state documentation for the release.
6. Run `npm ci` and the complete configured validation suite.
7. Revalidate compatibility against published `my-dev-kit@1.10.3`.
8. Inspect the complete `npm pack --dry-run` inventory.
9. Commit the exact release files and push `release/v1.2.2`.
10. Create a pull request targeting `main`.
11. Require passing CI, review, and the repository's approved pull-request gate.
12. Merge only through that approved pull-request gate.
13. Verify the merged release commit on `main`.
14. Create and push tag `v1.2.2` at the verified merged commit.
15. Create the GitHub Release for `v1.2.2` and verify its tag and commit.
16. Verify npm authentication, registry state, and version availability again.
17. Run `npm publish --access public` as the final publication command because
    it requires the user's passkey.
18. Verify the published `@dailephd/my-dev-kit-orchestrator@1.2.2` package.
19. Verify that npm `latest` resolves to `1.2.2`.
20. Run read-only post-publication CLI and compatibility smoke tests.

## v1.0.0 checklist

### Artifact contract check verification

- [ ] `check --artifacts` shows CONTRACT_MISSING_FILE for all missing artifacts
- [ ] `check --artifacts` shows [pass] when all artifacts present with required sections
- [ ] `check --artifacts --strict` exits 1 on BLANK_SECTION
- [ ] `check --artifacts --strict` exits 1 on PLACEHOLDER_SECTION
- [ ] `check --artifacts --strict` exits 1 on PREDECESSOR_MISSING
- [ ] `check --artifacts` exits 1 on CONTRACT_MISSING_FILE (fail severity)
- [ ] `check --artifacts` exits 1 on CONTRACT_MISSING_SECTION (fail severity)
- [ ] `resolveArtifactContractsForMode` returns non-null for all 6 modes

### Stage gate verification

- [ ] `checkStageGates` returns no violations when no artifacts exist
- [ ] Gate 1: pseudocode-packet without behavior-model produces violation
- [ ] Gate 2: implementation without pseudocode-packet produces violation
- [ ] Gate 3: test-implementation without test-strategy produces violation
- [ ] Gate 5: judge without verification produces violation
- [ ] Gate 6: final-report without judge produces violation
- [ ] violations have severity:fail and include missingArtifact, presentArtifact, suggestedFix

### check --all verification

- [ ] `check --all` produces all four section headers
- [ ] `check --all` persists trace-check-results.json
- [ ] `check --all` includes correction routing output
- [ ] `check --all` exits 1 on any contract fail or gate violation

### Export command verification

- [ ] `export` prints run identity, request, artifact checklist to stdout
- [ ] `export --out <file>` writes to file and prints confirmation
- [ ] `export --out <existing>` exits 1 with message about --overwrite
- [ ] `export --out <existing> --overwrite` succeeds
- [ ] export refuses symlink output path
- [ ] export traversal-guard gap is tracked as a separate cross-mode follow-up
- [ ] export text contains no em dash, en dash, smart quotes, or ellipsis

### Version verification

- [ ] `node dist/cli.js --version` prints `1.0.0`
- [ ] `package.json` version is `1.0.0`

### CI verification

- [ ] GitHub Actions validate.yml uses macos-15 (not macos-latest)
- [ ] GitHub Actions validate.yml includes CLI export smoke step
- [ ] CI passes on ubuntu-latest, windows-latest, macos-15 with Node 24

## v0.6.0 checklist

### Judge verdict parser verification

- [ ] `parseJudgeReport('Verdict: PASS')` returns `{ verdict: 'PASS', parseError: null }`
- [ ] `parseJudgeReport` handles all 10 supported verdict tokens
- [ ] `parseJudgeReport` returns `verdict: null, parseError: <msg>` for unknown token
- [ ] `parseJudgeReport` returns `verdict: null, parseError: null` when no Verdict: line
- [ ] `parseJudgeReport` parses `Recommended next stage:` field
- [ ] `parseJudgeReport` parses `Recommended next stage if not PASS:` variant
- [ ] `isValidVerdict` returns true for all supported verdicts and false for others

### Correction routing verification

- [ ] `NEED_CONTEXT` routes to `architecture-context`
- [ ] `DESIGN_INCOMPLETE` routes to `behavior-model`
- [ ] `PSEUDOCODE_INCOMPLETE` routes to `pseudocode-packet`
- [ ] `IMPLEMENTATION_MISMATCH` routes to `implementation`
- [ ] `TEST_COVERAGE_INCOMPLETE` routes to `test-strategy` (default)
- [ ] `TEST_COVERAGE_INCOMPLETE` routes to `test-implementation` when recommended
- [ ] `ARCHITECTURE_MISMATCH` routes to `architecture-context` (default)
- [ ] `NEED_VERIFICATION` routes to `verification`
- [ ] `SCOPE_VIOLATION` produces `blocked` status with `isBlocked: true`
- [ ] `BLOCKED` produces `blocked` status with `isBlocked: true`
- [ ] conflict between table and recommended stage produces warning in normal mode
- [ ] conflict between table and recommended stage produces `strictFail` in strict mode
- [ ] unknown verdict produces `unknown_verdict` status with error

### Status correction output verification

- [ ] `status` shows `Judge correction: PASS` when judge report has PASS
- [ ] `status` shows verdict and routed stage for correction_required verdicts
- [ ] `status` shows blocked state for SCOPE_VIOLATION / BLOCKED
- [ ] `status` shows no Judge correction section when no judge report exists (backward compat)

### Prompt correction behavior verification

- [ ] `prompt` prints correction-stage prompt when IMPLEMENTATION_MISMATCH verdict present
- [ ] correction prompt contains `Stage: <stage> (correction)`
- [ ] correction prompt includes judge-report.txt as input
- [ ] correction prompt includes design-map.txt when present in run
- [ ] correction prompt does not include unrelated workflow modes
- [ ] correction prompt stop conditions include no automatic execution instruction
- [ ] `prompt` prints blocked message when SCOPE_VIOLATION / BLOCKED verdict
- [ ] `prompt` normal flow unchanged when no judge report exists (backward compat)

### Trace-aware correction suggestions

- [ ] `check --trace` with `TRACE_MISSING_LINK_TARGET` shows `Suggested correction stage:`
- [ ] missing `BEH-NNN` target suggests `behavior-model`
- [ ] missing `PSE-NNN` target suggests `pseudocode-packet`
- [ ] missing `TST-NNN` target suggests `test-strategy`
- [ ] `TRACE_MALFORMED_ID` suggests `design-map`
- [ ] `TRACE_ORPHAN_ID` suggests `design-map`
- [ ] check output without trace issues shows no Correction suggestions section

### CLI smoke (correction mode)

- [ ] `npm run smoke:cli -- correction` passes on `ubuntu-latest`
- [ ] `npm run smoke:cli -- correction` passes on `windows-latest`
- [ ] `npm run smoke:cli -- correction` passes on `macos-latest`

### Version bump verification

- [ ] `node dist/cli.js --version` outputs `0.6.0`
- [ ] `package.json` version is `0.6.0`

### Non-goal audit

Run:

```bash
rg -n "automatic.*code.*modif|automatic.*agent|LLM.*infer|LLM.*judge|judge.*execut|auto.*repair|autonomous.*runtime|direct.*LLM|openai|anthropic|langchain" src README.md docs CHANGELOG.md package.json
```

Expected: no implemented non-goal behavior; references in docs as future/non-goal items only.

### Forbidden wording check

```bash
rg -n "\bbridge\b|Bridge|BRIDGE" README.md docs CHANGELOG.md src package.json .github
```

Expected: no matches.

### Package dry-run

- [ ] `npm pack --dry-run` does not include `node_modules/`
- [ ] `npm pack --dry-run` does not include `.my-dev-kit-orchestrator/`
- [ ] `npm pack --dry-run` does not include `.my-dev-kit/`
- [ ] `npm pack --dry-run` does not include `agents.txt`, `claude.txt`, or `docs/*.txt`
- [ ] `npm pack --dry-run` does not include `.env` files, logs, tarballs
- [ ] only `dist/` and `README.md` are included in the published package

### OS matrix CI (GitHub Actions)

- [ ] `ubuntu-latest` - typecheck, tests, build, lint, all smoke tests pass
- [ ] `windows-latest` - typecheck, tests, build, lint, all smoke tests pass
- [ ] `macos-latest` - typecheck, tests, build, lint, all smoke tests pass

### Smoke test coverage

- [ ] normal smoke passes on all three OSes
- [ ] lifecycle smoke passes on all three OSes
- [ ] extraction smoke passes on all three OSes
- [ ] check smoke passes on all three OSes
- [ ] trace smoke passes on all three OSes
- [ ] correction smoke passes on all three OSes

## v0.5.0 checklist

### Trace checker verification

- [ ] `check --trace` is registered and appears in `check --help` output
- [ ] `check --design-map` is registered and appears in `check --help` output
- [ ] `check --trace` with no artifacts reports no issues (exits 0)
- [ ] `check --trace` shows `Trace check results for run:` header
- [ ] `check --trace` detects `TRACE_MALFORMED_ID` as `[fail]` (e.g., `BEH001`)
- [ ] `check --trace` detects `TRACE_DUPLICATE_ID` as `[warn]`
- [ ] `check --trace` detects `TRACE_ORPHAN_ID` as `[warn]` when links exist
- [ ] `check --trace` detects `TRACE_MISSING_LINK_TARGET` as `[fail]` for undeclared link targets
- [ ] `check --trace` exits 1 when any artifact has a `fail` issue
- [ ] `check --strict --trace` exits 1 when any artifact has a `warn` issue
- [ ] `check --trace` persists `trace-check-results.json` in the run folder
- [ ] `check --design-map` shows `Design map check for run:` header
- [ ] `check --design-map` reports `MISSING_FILE` when `artifacts/design-map.txt` absent
- [ ] well-formed artifacts with correct trace IDs pass with exit 0
- [ ] `status` shows `Trace check: not run` before first `check --trace`
- [ ] `status` shows `Trace check: N pass, N warn, N fail` after `check --trace`
- [ ] `parseDeclaredTraceIds` skips lines containing `->` (prevents false link-target declarations)

### Trace model verification

- [ ] `TRACE_PREFIXES` = `['REQ','CTX','BEH','INV','TRN','PSE','TST','IMP','VER','RISK']`
- [ ] `isValidTraceId('BEH-001')` returns `true`
- [ ] `isValidTraceId('BEH001')` returns `false`
- [ ] `isValidTraceId('FOO-001')` returns `false`
- [ ] `isMalformedTraceId('BEH001')` returns `true`
- [ ] `isMalformedTraceId('FOO-001')` returns `true`
- [ ] `isMalformedTraceId('BEH-001')` returns `false` (valid ID, not malformed)

### CLI smoke (trace mode)

- [ ] `npm run smoke:cli -- trace` passes on `ubuntu-latest`
- [ ] `npm run smoke:cli -- trace` passes on `windows-latest`
- [ ] `npm run smoke:cli -- trace` passes on `macos-latest`

### Version bump verification

- [ ] `node dist/cli.js --version` outputs `0.5.0`
- [ ] `package.json` version is `0.5.0`

### Non-goal audit

Run:

```bash
rg -n "automatic.*code.*symbol|AST.*dependency.*graph|coverage.*instrument|LLM.*trace.*infer|judge.*correction.*routing|design.map.*visuali|automatic.*my-dev-kit|direct.*LLM|openai|anthropic|langchain" src README.md docs CHANGELOG.md package.json
```

Expected: no implemented non-goal behavior; references in docs as future/non-goal items only.

### Forbidden wording check

```bash
rg -n "\bbridge\b|Bridge|BRIDGE" README.md docs CHANGELOG.md src package.json .github
```

Expected: no matches.

### Package dry-run

- [ ] `npm pack --dry-run` does not include `node_modules/`
- [ ] `npm pack --dry-run` does not include `.my-dev-kit-orchestrator/`
- [ ] `npm pack --dry-run` does not include `.my-dev-kit/`
- [ ] `npm pack --dry-run` does not include `agents.txt`, `claude.txt`, or `docs/*.txt`
- [ ] `npm pack --dry-run` does not include `.env` files, logs, tarballs
- [ ] only `dist/` is included in the published package

### OS matrix CI (GitHub Actions)

- [ ] `ubuntu-latest` - typecheck, tests, build, lint, all smoke tests pass
- [ ] `windows-latest` - typecheck, tests, build, lint, all smoke tests pass
- [ ] `macos-latest` - typecheck, tests, build, lint, all smoke tests pass

### Smoke test coverage

- [ ] normal smoke (`npm run smoke:cli -- normal`) passes on all three OSes
- [ ] lifecycle smoke (`npm run smoke:cli -- lifecycle`) passes on all three OSes
- [ ] extraction smoke (`npm run smoke:cli -- extraction`) passes on all three OSes
- [ ] check smoke (`npm run smoke:cli -- check`) passes on all three OSes
- [ ] trace smoke (`npm run smoke:cli -- trace`) passes on all three OSes

## v0.4.0 checklist

### Artifact content checker verification

- [ ] `check` command is registered and appears in `--help` output
- [ ] `check` with no arguments runs all artifact and prompt checks
- [ ] `check` shows `Check results for run:` header
- [ ] `check --artifact request-brief` checks only that artifact (by stage name)
- [ ] `check --artifact request-brief.txt` checks only that artifact (by filename)
- [ ] `check --prompts` checks only generated prompt files
- [ ] `check --strict` exits 1 on any `warn` in addition to `fail`
- [ ] `check` exits 1 when any artifact check has severity `fail`
- [ ] `check` exits 0 when all checks pass
- [ ] `MISSING_FILE` reported as `[fail]` for absent artifact files
- [ ] `MISSING_SECTION` reported as `[fail]` for missing required sections
- [ ] `EMPTY_SECTION` reported as `[warn]` for sections with no content
- [ ] `PLACEHOLDER_CONTENT` reported as `[warn]` for placeholder artifacts
- [ ] `STATUS_MISMATCH` reported as `[warn]` when artifact `Status:` conflicts with lifecycle state
- [ ] `artifact-check-results.json` created in run folder after full `check` run
- [ ] `status` shows `Content check: N pass, N warn, N fail` when results exist
- [ ] `status` shows `Content check: not run` when no results exist

### Prompt quality checker verification

- [ ] `check --prompts` reports `[pass]` for all generated prompt files
- [ ] `PROMPT_MISSING_FILE` reported for absent prompt files
- [ ] `PROMPT_EMPTY` reported for empty prompt files
- [ ] `PROMPT_MISSING_STAGE_HEADER` reported for prompts without `Stage:` line
- [ ] `PROMPT_MISSING_TASK_SECTION` reported for prompts without `Task:` section
- [ ] `PROMPT_MISSING_OUTPUT_ARTIFACT` reported as warn for prompts without `Required output artifact:`
- [ ] `PROMPT_PLACEHOLDER` reported as warn for placeholder prompt text

### CLI smoke (check mode)

- [ ] `npm run smoke:cli -- check` passes on `ubuntu-latest`
- [ ] `npm run smoke:cli -- check` passes on `windows-latest`
- [ ] `npm run smoke:cli -- check` passes on `macos-latest`

### Version bump verification

- [ ] `node dist/cli.js --version` outputs `0.4.0`
- [ ] `package.json` version is `0.4.0`

### Non-goal audit

Run:

```bash
rg -n "schema validation|Zod|AJV|joi|yup|LLM.*judge|semantic.*grading|automatic.*rewrite|judge.*routing|trace.*ID|direct.*LLM|openai|anthropic|langchain" src README.md docs CHANGELOG.md package.json
```

Expected: no implemented non-goal behavior; references in docs as future/non-goal items only.

### Forbidden wording check

```bash
rg -n "\bbridge\b|Bridge|BRIDGE" README.md docs CHANGELOG.md src package.json .github
```

Expected: no matches.

### Package dry-run

- [ ] `npm pack --dry-run` does not include `node_modules/`
- [ ] `npm pack --dry-run` does not include `.my-dev-kit-orchestrator/`
- [ ] `npm pack --dry-run` does not include `.my-dev-kit/`
- [ ] `npm pack --dry-run` does not include `agents.txt`, `claude.txt`, or `docs/*.txt`
- [ ] `npm pack --dry-run` does not include `.env` files, logs, tarballs
- [ ] only `dist/` is included in the published package

### OS matrix CI (GitHub Actions)

- [ ] `ubuntu-latest` - typecheck, tests, build, lint, all smoke tests pass
- [ ] `windows-latest` - typecheck, tests, build, lint, all smoke tests pass
- [ ] `macos-latest` - typecheck, tests, build, lint, all smoke tests pass

### Smoke test coverage

- [ ] normal smoke (`npm run smoke:cli -- normal`) passes on all three OSes
- [ ] lifecycle smoke (`npm run smoke:cli -- lifecycle`) passes on all three OSes
- [ ] extraction smoke (`npm run smoke:cli -- extraction`) passes on all three OSes
- [ ] check smoke (`npm run smoke:cli -- check`) passes on all three OSes

## v0.3.0 checklist

### Lifecycle model verification

- [ ] `artifact-state.json` is created in the run folder on first `mark` command
- [ ] `artifact-state.json` absent -> file-existence-only fallback works (backward compat)
- [ ] `mark <artifact> --state blocked --reason "..."` writes state file
- [ ] `mark <artifact> --state incomplete --reason "..."` writes state file
- [ ] `mark <artifact> --state complete` writes state file (no reason required)
- [ ] `mark <artifact> --state stale` exits with error (computed, not manual)
- [ ] `mark <artifact> --state missing` exits with error (computed, not manual)
- [ ] `mark <artifact> --state blocked` without `--reason` exits with error
- [ ] `mark <artifact> --state incomplete` without `--reason` exits with error
- [ ] `mark` with unknown artifact shows known artifact list and exits with error
- [ ] marking `complete` without file warns but does not crash; effective state is `missing`

### Status lifecycle verification

- [ ] `status` shows `[complete  ]` for present artifact with no state file
- [ ] `status` shows `[missing   ]` for absent artifact with no state file
- [ ] `status` shows `[blocked   ]` and reason for blocked artifacts
- [ ] `status` shows `[incomplete]` and reason for incomplete artifacts
- [ ] `status` shows `[stale     ]` and reason for stale artifacts
- [ ] `status` for extraction runs still shows source/target paths
- [ ] `status` for extraction porting-map dual artifact shows both artifacts

### Prompt lifecycle verification

- [ ] `prompt` for a blocked artifact prepends `=== LIFECYCLE CONTEXT ===` block
- [ ] `prompt` for an incomplete artifact prepends lifecycle context block
- [ ] `prompt` for a stale artifact prepends lifecycle context block
- [ ] normal prompt output (no lifecycle issues) has no context block prepended
- [ ] `prompt` for blocked artifact does not claim content validation is running

### Stale detection verification

- [ ] artifact is stale when upstream has a later `updatedAt` than downstream
- [ ] artifact is not stale when downstream is newer than all upstream
- [ ] extraction `do-not-port-list.txt` changes make downstream artifacts stale
- [ ] supporting reports do not create stale gates

### Package dry-run

- [ ] `npm pack --dry-run` does not include `node_modules/`
- [ ] `npm pack --dry-run` does not include `.my-dev-kit-orchestrator/`
- [ ] `npm pack --dry-run` does not include `.my-dev-kit/`
- [ ] `npm pack --dry-run` does not include `agents.txt`, `claude.txt`, `docs/*.txt`
- [ ] `npm pack --dry-run` does not include `.env` files, logs, tarballs
- [ ] only `dist/` is included in the published package

### OS matrix CI (GitHub Actions)

- [ ] `ubuntu-latest` - typecheck, tests, build, lint, CLI smoke pass
- [ ] `windows-latest` - typecheck, tests, build, lint, CLI smoke pass
- [ ] `macos-latest` - typecheck, tests, build, lint, CLI smoke pass

### Non-goal audit

- [ ] lifecycle CLI smoke passes on `ubuntu-latest`, `windows-latest`, and `macos-latest`
- [ ] extraction CLI smoke passes on `ubuntu-latest`, `windows-latest`, and `macos-latest`

### my-dev-kit-lab security validation

- [ ] `my-dev-kit-lab` build, test, and verify pass before target validation
- [ ] `npm run security:validate` passes in `my-dev-kit-lab` for self-validation, or reports optional skipped tools explicitly
- [ ] `npm run security:validate -- --target "<target-project-root>"` completes and writes target-specific reports under `reports/security/`
- [ ] `npm run security:deps -- --target "<target-project-root>"` completes without modifying the target project
- [ ] `npm run security:package -- --target "<target-project-root>"` completes without modifying the target project
- [ ] `npm run security:semgrep -- --target "<target-project-root>"` runs or reports a clean skip
- [ ] `npm run security:codeql -- --target "<target-project-root>"` runs or reports a clean skip
- [ ] target repository tree is unchanged before and after security validation
- [ ] target security verdict is recorded in the final pre-release report

Run before release:

```bash
rg -n "artifact content validation|required-section validation|schema validation|judge correction|design trace|automatic my-dev-kit|direct LLM|--create-target|ajv|zod|joi|yup|openai|anthropic|langchain" src README.md docs CHANGELOG.md package.json
```

Expected: only references in docs as future/non-goal items; no implemented behavior.

### Forbidden wording check

```bash
rg -n "\bbridge\b|Bridge|BRIDGE" README.md docs CHANGELOG.md src package.json .github
```

Expected: no matches.

## v0.2.1 checklist

### Runtime implementation verification

- [ ] `start --mode extraction --source <path> --target <path> "<request>"` creates a run
- [ ] extraction without `--source` fails with a clear error message
- [ ] extraction without `--target` fails with a clear error message
- [ ] non-extraction modes do not require `--source` or `--target`
- [ ] source and target paths are stored in `run.json`
- [ ] source repository remains read-only evidence during run creation
- [ ] extraction run artifacts are created under the target repo (`<target>/.my-dev-kit-orchestrator/runs/<run-id>/`)
- [ ] `status` shows source and target repo paths for extraction runs
- [ ] extraction mode stage order matches the 14-stage spec
- [ ] `porting-map` stage requires both `source-to-target-porting-map.txt` and `do-not-port-list.txt`
- [ ] `golden-behavior-contract` is required before `pseudocode-packet` can be the next stage
- [ ] implementation cannot be the next stage until all 6 pre-implementation artifacts exist
- [ ] all extraction prompt stages have required sections: Stage, Workflow mode, Task, Required output artifact, Output file, Stop conditions, Return format

### Documentation verification

- [ ] verify extraction docs clearly distinguish source repository (evidence) from target repository (implementation destination)
- [ ] verify source repository is documented as read-only evidence by default
- [ ] verify target repository is documented as the implementation destination
- [ ] verify source and target `.my-dev-kit` directories are documented as separate
- [ ] verify extraction artifacts are documented with paths and responsibilities
- [ ] verify `GoldenBehaviorContract` is documented as mandatory before pseudocode and test strategy
- [ ] verify docs do not recommend copying files directly from source to target
- [ ] verify docs do not recommend recreating the full source architecture in the target
- [ ] verify docs do not use the forbidden legacy term in public-facing descriptions
- [ ] verify ROADMAP.md marks v0.2.1 as implemented
- [ ] verify CHANGELOG.md lists runtime extraction and cross-platform validation additions

### Forbidden wording check

Run a case-insensitive search for the forbidden legacy term across public docs and code-facing text.

Expected: no matches in public documentation files and no literal usage in tests or generated prompt text.

### Extraction terminology consistency check

Run:

```bash
rg -n "extraction|SourceWorkflowMap|SourceToTargetPortingMap|DoNotPortList|GoldenBehaviorContract|TargetArchitectureProposal" README.md docs/ARCHITECTURE.md docs/ROADMAP.md CHANGELOG.md docs/WORKFLOWS.md docs/ARTIFACTS.md docs/USAGE.md
```

Expected: consistent extraction terminology across all updated files.

### Dangerous wording check

Run:

```bash
rg -n "copy files|clone the old system|inherit the full source architecture|read whole source files first" README.md docs
```

Expected: no matches, or matches only in warnings against those behaviors.

### Cross-platform CI verification

- [ ] GitHub Actions OS matrix passes on:
  - [ ] `ubuntu-latest`
  - [ ] `windows-latest`
  - [ ] `macos-latest`
- [ ] typecheck passes on all three OSes
- [ ] `npm test` passes on all three OSes
- [ ] `npm run build` passes on all three OSes
- [ ] `npm run lint` passes on all three OSes
- [ ] CLI smoke passes on all three OSes
- [ ] extraction CLI smoke passes on all three OSes
- [ ] extraction mode tested with OS-native absolute paths
- [ ] extraction mode tested with paths containing spaces
- [ ] extraction mode tested with relative `--source` and `--target` paths normalized to absolute
- [ ] package dry run remains clean

### Validation commands

```bash
npx tsc --noEmit
npm run build
npm test
npm run lint
```

### Package dry-run and forbidden file check

- [ ] `npm pack --dry-run` does not include `node_modules/`
- [ ] `npm pack --dry-run` does not include `.my-dev-kit-orchestrator/`
- [ ] `npm pack --dry-run` does not include `.my-dev-kit/`
- [ ] `npm pack --dry-run` does not include `agents.txt` or `claude.txt`
- [ ] `npm pack --dry-run` does not include `.env` files, logs, temp files, or local tarballs

### File staging check

Stage only:

```bash
git add README.md CHANGELOG.md docs/ARCHITECTURE.md docs/ROADMAP.md docs/WORKFLOWS.md docs/ARTIFACTS.md docs/USAGE.md docs/DEVELOPMENT.md docs/RELEASE_CHECKLIST.md package.json
```

Do not stage:

- `agents.txt`
- `claude.txt`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/*.txt`
- `.idea/`
- `.my-dev-kit-orchestrator/`
- `.my-dev-kit`
- `.env`
- logs
- temporary files
- npm tarballs
