import { consumeBoundedObserverEvidence, OBSERVER_EVIDENCE_BOUNDS } from '../src';

function artifact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifactKind: 'my-frontend-observer/bounded-agent-context', schemaVersion: '1.0.0', contextId: 'context-1', contextRequestId: 'request-1',
    producer: { name: 'my-frontend-observer', version: '0.6.0' }, provenance: { generatedAt: '2026-09-01T00:00:00.000Z' },
    projectionProfile: 'frontend-change-review', sources: { observationIds: ['observation-1'] }, targets: [],
    adequacy: { state: 'adequate', reasons: [] }, omissions: [], truncations: [], ...overrides,
  };
}
function correlation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { runtimeTargetId: 'target-1', runtimeEvidenceRefs: [], staticProducer: { name: 'my-dev-kit', version: '1.0.0', indexId: 'index-1' }, status: 'unavailable', candidates: [], provenance: { correlatedAt: '2026-09-01T00:00:00.000Z' }, ...overrides };
}
function expectInvalid(value: unknown, disposition = 'MALFORMED_OBSERVER_ARTIFACT') {
  const result = consumeBoundedObserverEvidence({ artifact: value });
  expect(result).toMatchObject({ ok: false, disposition });
}

describe('consumeBoundedObserverEvidence', () => {
  it('maps valid adequate, partial, and inadequate Observer artifacts without conflating validity and adequacy', () => {
    expect(consumeBoundedObserverEvidence({ artifact: artifact() })).toMatchObject({ ok: true, readiness: 'READY' });
    expect(consumeBoundedObserverEvidence({ artifact: artifact({ adequacy: { state: 'partial', reasons: [{ code: 'static-correlation-ambiguous' }] } }) })).toMatchObject({ ok: true, readiness: 'READY_WITH_PARTIAL_EVIDENCE' });
    expect(consumeBoundedObserverEvidence({ artifact: artifact({ adequacy: { state: 'inadequate', reasons: [{ code: 'required-runtime-target-unavailable' }] } }) })).toMatchObject({ ok: true, readiness: 'BLOCKED_INADEQUATE_EVIDENCE' });
  });

  it('fails closed for malformed wire data, unsupported schema, producer mismatch, and missing provenance', () => {
    expectInvalid(null);
    expectInvalid(artifact({ artifactKind: 'wrong' }));
    expectInvalid(artifact({ schemaVersion: '2.0.0' }), 'UNSUPPORTED_OBSERVER_SCHEMA');
    expectInvalid(artifact({ producer: { name: 'other-observer', version: '0.6.0' } }));
    expectInvalid(artifact({ provenance: {} }));
  });

  it('preserves correlation states and does not infer ownership or replace ambiguity', () => {
    const correlated = correlation({ status: 'correlated', candidates: [{ candidateId: 'file:src/a.ts', kind: 'file', evidenceRefs: [{ path: 'targetEvidence.a' }] }] });
    const ambiguous = correlation({ status: 'ambiguous', candidates: [{ candidateId: 'file:src/a.ts', kind: 'file', evidenceRefs: [] }, { candidateId: 'symbol:src/a.ts#A', kind: 'symbol', evidenceRefs: [] }] });
    const result = consumeBoundedObserverEvidence({ artifact: artifact({ correlations: [correlated, ambiguous] }) });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.evidence.correlations?.map((entry) => entry.status)).toEqual(['correlated', 'ambiguous']);
    expect(result.evidence.correlations?.[0]).not.toHaveProperty('owner');
  });

  it('rejects incoherent correlation status/candidate relationships and candidate identity prefixes', () => {
    expectInvalid(artifact({ correlations: [correlation({ status: 'correlated', candidates: [] })] }));
    expectInvalid(artifact({ correlations: [correlation({ status: 'ambiguous', candidates: [{ candidateId: 'file:src/a.ts', kind: 'file', evidenceRefs: [] }] })] }));
    expectInvalid(artifact({ correlations: [correlation({ status: 'correlated', candidates: [{ candidateId: 'symbol:x', kind: 'file', evidenceRefs: [] }] })] }));
  });

  it('accepts duplicate same-identity candidates when the producer declares the record ambiguous, without inventing another classification', () => {
    const duplicated = correlation({ status: 'ambiguous', candidates: [{ candidateId: 'file:src/a.ts', kind: 'file', evidenceRefs: [] }, { candidateId: 'file:src/a.ts', kind: 'file', evidenceRefs: [] }] });
    const result = consumeBoundedObserverEvidence({ artifact: artifact({ correlations: [duplicated] }) });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.evidence.correlations?.[0]?.status).toBe('ambiguous');
  });

  it('matches every released material bound at its limit and rejects one over', () => {
    const refs = (count: number) => Array.from({ length: count }, (_, index) => ({ path: `e-${index}` }));
    const candidates = (count: number) => Array.from({ length: count }, (_, index) => ({ candidateId: `file:src/${index}.ts`, kind: 'file', evidenceRefs: [] }));
    const omissions = (count: number) => Array.from({ length: count }, (_, index) => ({ subject: `o-${index}`, reason: 'not-observed', required: false }));
    const truncations = (count: number) => Array.from({ length: count }, (_, index) => ({ subject: `t-${index}`, limit: 1, actualCount: 2, required: false }));
    const targets = (count: number) => Array.from({ length: count }, (_, index) => ({ targetId: `target-${index}` }));
    const correlations = (count: number) => Array.from({ length: count }, (_, index) => correlation({ runtimeTargetId: `target-${index}` }));
    const cases: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
      ['targets', artifact({ targets: targets(OBSERVER_EVIDENCE_BOUNDS.maxRuntimeTargets) }), artifact({ targets: targets(OBSERVER_EVIDENCE_BOUNDS.maxRuntimeTargets + 1) })],
      ['relationship refs', artifact({ targets: [{ targetId: 'target-1', relationshipEvidence: refs(OBSERVER_EVIDENCE_BOUNDS.maxRelationshipEvidencePerTarget) }] }), artifact({ targets: [{ targetId: 'target-1', relationshipEvidence: refs(OBSERVER_EVIDENCE_BOUNDS.maxRelationshipEvidencePerTarget + 1) }] })],
      ['omissions', artifact({ omissions: omissions(OBSERVER_EVIDENCE_BOUNDS.maxOmissions) }), artifact({ omissions: omissions(OBSERVER_EVIDENCE_BOUNDS.maxOmissions + 1) })],
      ['truncations', artifact({ truncations: truncations(OBSERVER_EVIDENCE_BOUNDS.maxTruncations) }), artifact({ truncations: truncations(OBSERVER_EVIDENCE_BOUNDS.maxTruncations + 1) })],
      ['correlations', artifact({ correlations: correlations(OBSERVER_EVIDENCE_BOUNDS.maxCorrelationRecords) }), artifact({ correlations: correlations(OBSERVER_EVIDENCE_BOUNDS.maxCorrelationRecords + 1) })],
      ['static candidates', artifact({ correlations: [correlation({ status: 'ambiguous', candidates: candidates(OBSERVER_EVIDENCE_BOUNDS.maxStaticCandidatesPerTarget) })] }), artifact({ correlations: [correlation({ status: 'ambiguous', candidates: candidates(OBSERVER_EVIDENCE_BOUNDS.maxStaticCandidatesPerTarget + 1) })] })],
      ['text summary', artifact({ correlations: [correlation({ evidenceBasis: 'x'.repeat(OBSERVER_EVIDENCE_BOUNDS.maxTextSummaryChars) })] }), artifact({ correlations: [correlation({ evidenceBasis: 'x'.repeat(OBSERVER_EVIDENCE_BOUNDS.maxTextSummaryChars + 1) })] })],
      ['correlation refs', artifact({ correlations: [correlation({ runtimeEvidenceRefs: refs(OBSERVER_EVIDENCE_BOUNDS.maxEvidenceRefsPerCorrelationField) })] }), artifact({ correlations: [correlation({ runtimeEvidenceRefs: refs(OBSERVER_EVIDENCE_BOUNDS.maxEvidenceRefsPerCorrelationField + 1) })] })],
    ];
    for (const [name, atLimit, oneOver] of cases) {
      expect(consumeBoundedObserverEvidence({ artifact: atLimit })).toMatchObject({ ok: true });
      expectInvalid(oneOver);
    }
  });

  it('is deterministic, does not mutate nested caller values, and strips unknown extension payloads', () => {
    const input = artifact({ correlations: [correlation({ status: 'correlated', candidates: [{ candidateId: 'file:src/a.ts', kind: 'file', evidenceRefs: [{ path: 'runtime.a' }] }], unknownNested: { unbounded: Array(100).fill('x') } })], unknownTopLevel: { hidden: true } });
    const before = JSON.parse(JSON.stringify(input));
    const first = consumeBoundedObserverEvidence({ artifact: input });
    const second = consumeBoundedObserverEvidence({ artifact: input });
    expect(first).toEqual(second);
    expect(input).toEqual(before);
    if (first.ok) {
      expect(first.evidence).not.toHaveProperty('unknownTopLevel');
      expect(first.evidence.correlations?.[0]).not.toHaveProperty('unknownNested');
    }
  });
});
