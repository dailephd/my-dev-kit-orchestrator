# v1.2.3 Batch 4 corrected-positive fixture

## Source and purpose

A minimal, deterministic positive counterpart to
`tests/fixtures/v123-batch4/frozen-run/` (AGENTS.txt v1.2.3 Batch 4 section
5.2). Represents the same bounded feature-mode workflow with valid producer
evidence from a corrected (v1.10.4+) producer:

- `implementation-capsule.json` / `implementation-audit.json`: raw evidence
  declaring `roleAdequacy.status: "context sufficient for implementation"`,
  optional-only truncation (`truncation.records[].requiredEvidenceLost:
  false`), and the additive `roleConditionCoverage[]` field (v1.10.4) with
  both required conditions (`implementation.selected-owner`,
  `implementation.required-contract`) satisfied and a retained witness --
  proving Batch 1's condition-aware parsing accepts this evidence as ready
  rather than blocking on the optional truncation alone.
- `test-capsule.json` / `test-audit.json`: raw evidence declaring one mapped
  critical responsibility (`TST-CORRECTED-001`) and no truncation.
- `judge-report.txt`: an authored `Verdict: PASS` -- the canonical expected
  verdict once repository context is ready, which Batch 3's judge-integrity
  evaluation must accept.

`<FIXTURE_INDEX>` is a placeholder token test setup replaces with the
disposable temp directory's own index path, keeping this fixture free of
machine-specific paths.

## Consumers

`tests/v123Batch4FrozenRegression.test.ts` builds a real run around this
evidence and asserts that readiness, the RunIntegrityGate, judge integrity,
and final-report eligibility all accept it -- proving the complete positive
matrix (AGENTS.txt v1.2.3 Batch 4 section 6) end to end, including the
v1.10.4 additive fields the frozen-negative fixture's producer version
predates.

## Immutability

Tests verify this directory's file contents are unchanged after every
replay. Do not edit these files except to correct an error in the fixture
itself.
