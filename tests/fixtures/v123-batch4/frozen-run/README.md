# v1.2.3 Batch 4 frozen-negative fixture

## Source and purpose

This fixture is a minimal, deterministic distillation of the real failed
my-dev-kit v1.11.0 Batch 1 orchestrator run
(`20260730T113740-implement-my-dev-kit-v1-11-0-b`), investigated and hashed
in `Z:\Users\newuser\Projects\context-readiness-fix-investigation`. That
investigation directory and the original run under
`Z:\Users\newuser\Projects\my-dev-kit-v1\.my-dev-kit-orchestrator\runs\` are
external to this repository and must never be modified by these tests; this
fixture exists so the regression does not depend on that external directory
being present at all (see `tests/runIntegrityGateFrozenRunReplay.test.ts`,
which reads that external directory directly, for the byte-exact replay of
the original evidence when it is available).

This fixture preserves only the material facts that caused the invalid
historical PASS, per AGENTS.txt v1.2.3 Batch 4 section 5.1:

- `implementation-capsule.json` / `implementation-audit.json`: raw producer
  evidence declaring `roleAdequacy.status: "context insufficient and more
  retrieval required"` with `truncation.records[].requiredEvidenceLost:
  true` -- the real (pre-v1.10.4) producer defect that made implementation
  context refresh-required.
- `test-capsule.json` / `test-audit.json`: raw producer evidence declaring
  `responsibilityMappings.truncated: true` -- the exact Batch 1 regression
  (AGENTS.txt v1.2.3 Batch 1 section 7 / "mapping-claim contradicts raw
  evidence") where a supplemental packet/report pair agreeing
  "Responsibility mappings truncated: no" must still fail closed against
  this raw `true` value.
- `judge-report.txt`: an authored `Verdict: PASS` -- the literal contradiction
  that Batch 3's judge-integrity evaluation must reject, because canonical
  readiness requires `NEED_CONTEXT` given the raw evidence above.
- `final-report.txt`: an authored `Verdict: PASS` final report -- proves that
  a structurally complete-looking final report must not make the run
  eligible or complete.

Fields not needed to reproduce this specific defect (full candidate lists,
budget/allocation diagnostics, real repository paths, timestamps) are
omitted or replaced with the placeholder token `<FIXTURE_INDEX>`, which test
setup replaces with the disposable temp directory's own index path. This
keeps the fixture free of machine-specific paths and semantically identical
to the original (a self-consistent, single index identity referenced by both
`index.indexPath` and `freshness.comparedIdentities[label="afterIndexPath"]`).

## Consumers

`tests/v123Batch4FrozenRegression.test.ts` copies this directory into a
disposable temp directory, builds a real run around it (via `createRun` +
`writeSupplementalContextTemplates`, pointing the packet/report "Source
context capsule:"/"Source retrieval audit:" declarations at the copied
files), and asserts that Batches 1-3's canonical evaluators (readiness, the
RunIntegrityGate, judge integrity, and final-report eligibility) all reject
this evidence exactly as they rejected the original run -- without ever
reading from or writing to this fixture directory itself.

## Immutability

Tests verify this directory's file contents are unchanged after every
replay (see the "fixture immutability" test in
`tests/v123Batch4FrozenRegression.test.ts`). Do not edit these files except
to correct an error in the distillation itself.
