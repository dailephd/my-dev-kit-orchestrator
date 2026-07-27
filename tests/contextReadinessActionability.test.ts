import {
  ContextReadinessResult,
  compareContextReadinessIssues,
  contextReadinessIssueDefinition,
  createContextReadinessIssue,
  finalizeContextReadinessResult,
} from '../src/instructions/contextReadiness';

function proposedResult(overrides: Partial<ContextReadinessResult> = {}): ContextReadinessResult {
  return {
    schemaVersion: '1.0.0',
    kind: 'implementation',
    role: 'implementation',
    decision: 'refresh-required',
    classification: 'stale',
    stageId: 'stage.feature.implementation',
    packetPath: '/run/artifacts/implementation-context-packet.txt',
    reportPath: '/run/reports/implementation-context-retrieval-report.txt',
    issues: [],
    warnings: [],
    blockingIssueCodes: [],
    affectedResponsibilityIds: [],
    evaluatedFreshness: 'stale',
    evaluatedAdequacy: 'sufficient',
    requiredEvidenceTruncated: 'no',
    readyWithAssumptions: false,
    provenanceSummary: '1 provenance record(s)',
    ...overrides,
  };
}

describe('context readiness actionable blocker finalization', () => {
  it('fails closed without throwing when refresh-required has no error issue', () => {
    const result = finalizeContextReadinessResult(proposedResult());
    expect(result.decision).toBe('refresh-required');
    expect(result.primaryIssue).toBeDefined();
    expect(result.issues).toContain(result.primaryIssue);
    expect(result.blockerSummary).toEqual(
      expect.objectContaining({
        primaryCode: 'CONTEXT_READINESS_CONTRACT_VIOLATION',
        blockingIssueCodes: ['CONTEXT_READINESS_CONTRACT_VIOLATION'],
        supportingIssueCodes: [],
      }),
    );
    expect(result.primaryIssue?.correctiveAction).not.toBe('');
    expect(result.primaryIssue?.evidenceTarget).not.toBe('');
  });

  it('converts ready-with-error into refresh-required and keeps the canonical issue actionable', () => {
    const error = createContextReadinessIssue(
      'CONTEXT_FRESHNESS_STALE',
      'error',
      'The evidence is stale.',
      'stage.feature.implementation',
      'implementation',
    );
    const result = finalizeContextReadinessResult(
      proposedResult({
        decision: 'ready',
        classification: 'ready',
        issues: [error],
      }),
    );
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('incompatible');
    expect(result.blockerSummary?.primaryCode).toBe('CONTEXT_FRESHNESS_STALE');
  });

  it('recovers an unregistered error code through the internal contract issue', () => {
    const unknown = createContextReadinessIssue(
      'CONTEXT_UNKNOWN_ERROR',
      'error',
      'Unknown readiness failure.',
      'stage.feature.implementation',
      'implementation',
    );
    expect(unknown).toMatchObject({
      code: 'CONTEXT_READINESS_CONTRACT_VIOLATION',
      sourceCode: 'CONTEXT_UNKNOWN_ERROR',
      priority: 0,
    });
    const result = finalizeContextReadinessResult(proposedResult({ issues: [unknown] }));
    expect(result.blockerSummary?.primaryCode).toBe('CONTEXT_READINESS_CONTRACT_VIOLATION');
  });

  it('uses one deterministic priority and issue ordering authority', () => {
    const stageId = 'stage.feature.implementation';
    const candidates = [
      createContextReadinessIssue(
        'CONTEXT_REQUIRED_EVIDENCE_TRUNCATED',
        'error',
        'Required evidence was truncated.',
        stageId,
        'implementation',
      ),
      createContextReadinessIssue(
        'CONTEXT_PACKET_TEMPLATE',
        'error',
        'The packet is a template.',
        stageId,
        'implementation',
      ),
      createContextReadinessIssue(
        'CONTEXT_ADEQUACY_INSUFFICIENT',
        'error',
        'Adequacy is insufficient.',
        stageId,
        'implementation',
      ),
      createContextReadinessIssue(
        'CONTEXT_FRESHNESS_STALE',
        'error',
        'Freshness is stale.',
        stageId,
        'implementation',
      ),
    ];

    const forward = finalizeContextReadinessResult(proposedResult({ issues: candidates }));
    const reverse = finalizeContextReadinessResult(proposedResult({ issues: [...candidates].reverse() }));
    const expectedCodes = [
      'CONTEXT_PACKET_TEMPLATE',
      'CONTEXT_FRESHNESS_STALE',
      'CONTEXT_ADEQUACY_INSUFFICIENT',
      'CONTEXT_REQUIRED_EVIDENCE_TRUNCATED',
    ];

    expect(forward.blockingIssueCodes).toEqual(expectedCodes);
    expect(reverse.blockingIssueCodes).toEqual(expectedCodes);
    expect(forward.blockerSummary).toEqual(reverse.blockerSummary);
    expect([...candidates].sort(compareContextReadinessIssues).map((issue) => issue.code)).toEqual(expectedCodes);
  });

  it('deduplicates blocker codes while retaining distinct ordered issues', () => {
    const stageId = 'stage.feature.implementation';
    const first = createContextReadinessIssue(
      'CONTEXT_SOURCE_SUMMARY_MISMATCH',
      'error',
      'Freshness differs.',
      stageId,
      'implementation',
      { field: 'freshness' },
    );
    const second = createContextReadinessIssue(
      'CONTEXT_SOURCE_SUMMARY_MISMATCH',
      'error',
      'Adequacy differs.',
      stageId,
      'implementation',
      { field: 'adequacy' },
    );
    const result = finalizeContextReadinessResult(proposedResult({ issues: [first, second] }));
    expect(result.issues).toHaveLength(2);
    expect(result.blockingIssueCodes).toEqual(['CONTEXT_SOURCE_SUMMARY_MISMATCH']);
    expect(result.blockerSummary?.supportingIssueCodes).toEqual([]);
  });

  it('defines action, target, and numeric priority for every mandated blocker category', () => {
    const codes = [
      'CONTEXT_READINESS_CONTRACT_VIOLATION',
      'CONTEXT_PACKET_MISSING',
      'CONTEXT_REPORT_MISSING',
      'CONTEXT_PACKET_TEMPLATE',
      'CONTEXT_REPORT_TEMPLATE',
      'CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH',
      'CONTEXT_SOURCE_SUMMARY_MISMATCH',
      'CONTEXT_SOURCE_REPOSITORY_MISMATCH',
      'CONTEXT_SOURCE_INDEX_IDENTITY_MISSING',
      'CONTEXT_DECLARED_INDEX_IDENTITY_MISMATCH',
      'CONTEXT_SOURCE_ROLE_MISMATCH',
      'CONTEXT_FRESHNESS_STALE',
      'CONTEXT_FRESHNESS_UNKNOWN',
      'CONTEXT_ADEQUACY_INSUFFICIENT',
      'CONTEXT_ADEQUACY_CONFLICT',
      'CONTEXT_ADEQUACY_UNKNOWN',
      'CONTEXT_REQUIRED_EVIDENCE_TRUNCATED',
      'CONTEXT_PROVENANCE_MISSING',
      'CONTEXT_TEST_STRATEGY_MISSING',
      'CONTEXT_TEST_RESPONSIBILITY_ID_MISSING',
      'CONTEXT_TEST_RESPONSIBILITY_ID_INVALID',
      'CONTEXT_RESPONSIBILITY_MAPPINGS_TRUNCATED',
      'CONTEXT_CRITICAL_RESPONSIBILITY_PARTIALLY_MAPPED',
      'CONTEXT_CRITICAL_RESPONSIBILITY_MISSING_MAPPING',
    ];
    for (const code of codes) {
      expect(contextReadinessIssueDefinition(code)).toEqual(
        expect.objectContaining({
          priority: expect.any(Number),
          correctiveAction: expect.any(String),
          evidenceTarget: expect.any(String),
        }),
      );
    }
  });

  it('keeps ready results free of primary blockers and blocking codes', () => {
    const result = finalizeContextReadinessResult(
      proposedResult({
        decision: 'ready',
        classification: 'ready',
        evaluatedFreshness: 'fresh',
      }),
    );
    expect(result.decision).toBe('ready');
    expect(result.primaryIssue).toBeUndefined();
    expect(result.blockerSummary).toBeUndefined();
    expect(result.blockingIssueCodes).toEqual([]);
  });
});
