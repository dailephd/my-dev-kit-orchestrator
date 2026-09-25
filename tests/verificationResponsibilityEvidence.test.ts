import {
  validateVerificationResponsibilities,
  evaluateVerificationAttribution,
  VerificationIssueCode,
} from '../src/instructions/verificationResponsibilityEvidence';
import { SemanticResponsibility } from '../src/instructions/semanticResponsibility';

function codes(text: string): VerificationIssueCode[] {
  return validateVerificationResponsibilities(text).issues.map((i) => i.code);
}

const ID = 'verification responsibility ID: RSP-001';
const REC = (cmd = 'npm test', cwd = '.', exit = '0') =>
  `verification evidence:\ncommand: ${cmd}\nworking directory: ${cwd}\nexit code: ${exit}`;
const PASS = `${ID}\nverification status: pass\n\n${REC()}`;

describe('valid declarations', () => {
  it('parses pass with one record', () => {
    const r = validateVerificationResponsibilities(PASS);
    expect(r.issues).toEqual([]);
    expect(r.declarations).toEqual([
      {
        responsibilityId: 'RSP-001',
        status: 'pass',
        evidence: [{ command: 'npm test', workingDirectory: '.', exitCode: 0, recordIndex: 0 }],
        blockIndex: 0,
      },
    ]);
  });

  it('parses pass with multiple records in order, preserving verbatim commands', () => {
    const text = `${ID}\nverification status: pass\n${REC('npm test -- tests/a.spec.ts: x')}\n${REC('npm run typecheck', 'C:\\repo')}`;
    const r = validateVerificationResponsibilities(text);
    expect(r.issues).toEqual([]);
    expect(r.declarations[0].evidence).toEqual([
      { command: 'npm test -- tests/a.spec.ts: x', workingDirectory: '.', exitCode: 0, recordIndex: 0 },
      { command: 'npm run typecheck', workingDirectory: 'C:\\repo', exitCode: 0, recordIndex: 1 },
    ]);
  });

  it('parses fail with evidence', () => {
    const r = validateVerificationResponsibilities(`${ID}\nverification status: fail\n${REC('npm test', '.', '1')}`);
    expect(r.issues).toEqual([]);
    expect(r.declarations[0].status).toBe('fail');
  });

  it.each(['skipped', 'blocked'])('parses %s with a reason and no evidence', (status) => {
    const r = validateVerificationResponsibilities(`${ID}\nverification status: ${status}\nreason: no runner available`);
    expect(r.issues).toEqual([]);
    expect(r.declarations[0]).toEqual({
      responsibilityId: 'RSP-001',
      status,
      reason: 'no runner available',
      evidence: [],
      blockIndex: 0,
    });
  });

  it('accepts negative and large exit codes', () => {
    const r = validateVerificationResponsibilities(
      `${ID}\nverification status: fail\n${REC('a', '.', '-1')}\n${REC('b', '.', '4294967295')}`,
    );
    expect(r.issues).toEqual([]);
    expect(r.declarations[0].evidence.map((e) => e.exitCode)).toEqual([-1, 4294967295]);
  });
});

describe('ID errors', () => {
  it('reports missing ID', () => {
    expect(codes(`verification responsibility ID:\nverification status: pass\n${REC()}`)).toEqual([
      'VERIFICATION_RESPONSIBILITY_ID_MISSING',
    ]);
  });
  it.each(['RSP-01', 'RSP001', 'RESP-001', 'rsp-001', 'TST-1'])('rejects %s', (id) => {
    expect(codes(`verification responsibility ID: ${id}\nverification status: pass\n${REC()}`)).toEqual([
      'VERIFICATION_RESPONSIBILITY_ID_INVALID',
    ]);
  });
  it('reports duplicates; the first stays authoritative', () => {
    const r = validateVerificationResponsibilities(`${PASS}\n${ID}\nverification status: fail\n${REC('x', '.', '1')}`);
    expect(r.issues.map((i) => i.code)).toEqual(['VERIFICATION_RESPONSIBILITY_DUPLICATE']);
    expect(r.duplicateResponsibilityIds).toEqual(['RSP-001']);
    expect(r.declarations).toHaveLength(1);
    expect(r.declarations[0].status).toBe('pass');
  });
});

describe('status errors', () => {
  it('reports missing and blank status', () => {
    expect(codes(`${ID}\n${REC()}`)).toEqual(['VERIFICATION_RESPONSIBILITY_STATUS_MISSING']);
    expect(codes(`${ID}\nverification status:\n${REC()}`)).toEqual(['VERIFICATION_RESPONSIBILITY_STATUS_MISSING']);
  });
  it.each(['passed', 'success', 'failure', 'not-run', 'unknown', 'PASS'])('rejects %s', (s) => {
    expect(codes(`${ID}\nverification status: ${s}\n${REC()}`)).toEqual(['VERIFICATION_RESPONSIBILITY_STATUS_INVALID']);
  });
});

describe('evidence structure', () => {
  const wrap = (rec: string) => `${ID}\nverification status: pass\n${rec}`;
  it('reports missing command', () => {
    expect(codes(wrap('verification evidence:\nworking directory: .\nexit code: 0'))).toEqual([
      'VERIFICATION_RESPONSIBILITY_COMMAND_MISSING',
    ]);
  });
  it('reports missing working directory', () => {
    expect(codes(wrap('verification evidence:\ncommand: x\nexit code: 0'))).toEqual([
      'VERIFICATION_RESPONSIBILITY_WORKING_DIRECTORY_MISSING',
    ]);
  });
  it('reports NUL in working directory', () => {
    expect(codes(wrap(REC('x', 'a\0b')))).toEqual(['VERIFICATION_RESPONSIBILITY_WORKING_DIRECTORY_MISSING']);
  });
  it('reports missing exit code', () => {
    expect(codes(wrap('verification evidence:\ncommand: x\nworking directory: .'))).toEqual([
      'VERIFICATION_RESPONSIBILITY_EXIT_CODE_MISSING',
    ]);
  });
  it.each(['abc', '1.5', '0x1', '1e3', ' '])('reports non-integer exit code "%s"', (v) => {
    const c = codes(wrap(REC('x', '.', v)));
    expect(c).toEqual([v.trim() === '' ? 'VERIFICATION_RESPONSIBILITY_EXIT_CODE_MISSING' : 'VERIFICATION_RESPONSIBILITY_EXIT_CODE_INVALID']);
  });
  it('does not double-report a malformed record as missing evidence', () => {
    expect(codes(wrap('verification evidence:\ncommand: x'))).not.toContain('VERIFICATION_RESPONSIBILITY_EVIDENCE_MISSING');
  });
});

describe('status rules', () => {
  it.each(['pass', 'fail'])('%s without evidence', (s) => {
    expect(codes(`${ID}\nverification status: ${s}`)).toEqual(['VERIFICATION_RESPONSIBILITY_EVIDENCE_MISSING']);
  });
  it.each(['skipped', 'blocked'])('%s without reason', (s) => {
    expect(codes(`${ID}\nverification status: ${s}`)).toEqual(['VERIFICATION_RESPONSIBILITY_REASON_MISSING']);
    expect(codes(`${ID}\nverification status: ${s}\nreason:  `)).toEqual(['VERIFICATION_RESPONSIBILITY_REASON_MISSING']);
  });
});

describe('diagnostic inconsistencies', () => {
  it('flags pass with every exit code nonzero without rewriting status', () => {
    const r = validateVerificationResponsibilities(`${ID}\nverification status: pass\n${REC('a', '.', '1')}\n${REC('b', '.', '2')}`);
    expect(r.issues.map((i) => i.code)).toEqual(['VERIFICATION_RESPONSIBILITY_STATUS_EVIDENCE_INCONSISTENT']);
    expect(r.declarations[0].status).toBe('pass');
  });
  it('flags fail with every exit code zero without rewriting status', () => {
    const r = validateVerificationResponsibilities(`${ID}\nverification status: fail\n${REC()}`);
    expect(r.issues.map((i) => i.code)).toEqual(['VERIFICATION_RESPONSIBILITY_STATUS_EVIDENCE_INCONSISTENT']);
    expect(r.declarations[0].status).toBe('fail');
  });
  it('does not flag mixed exit codes', () => {
    expect(codes(`${ID}\nverification status: pass\n${REC()}\n${REC('b', '.', '3')}`)).toEqual([]);
    expect(codes(`${ID}\nverification status: fail\n${REC()}\n${REC('b', '.', '3')}`)).toEqual([]);
  });
});

describe('parsing boundaries', () => {
  it('ignores prose before the first block, prose inside a block, and record fields outside a record', () => {
    const text = [
      'Verification notes. command: ignored',
      ID,
      'Random prose line.',
      'command: outside any record',
      'verification status: pass',
      'Another: unrelated field',
      REC(),
    ].join('\n');
    const r = validateVerificationResponsibilities(text);
    expect(r.issues).toEqual([]);
    expect(r.declarations[0].evidence).toHaveLength(1);
  });
  it('starts a new block at each responsibility ID and preserves order', () => {
    const text = `${PASS}\nverification responsibility ID: RSP-002\nverification status: skipped\nreason: r`;
    const r = validateVerificationResponsibilities(text);
    expect(r.declarations.map((d) => [d.responsibilityId, d.status, d.blockIndex])).toEqual([
      ['RSP-001', 'pass', 0],
      ['RSP-002', 'skipped', 1],
    ]);
  });
  it('keeps the first value for a repeated field within a record', () => {
    const r = validateVerificationResponsibilities(
      `${ID}\nverification status: pass\nverification evidence:\ncommand: first\ncommand: second\nworking directory: .\nexit code: 0`,
    );
    expect(r.declarations[0].evidence[0].command).toBe('first');
  });
});

// ─── Attribution ────────────────────────────────────────────────────────────

function rsp(id: string, criticality: 'critical' | 'noncritical' = 'critical'): SemanticResponsibility {
  return {
    responsibilityId: id,
    criticality,
    responsibility: 'r',
    upstreamTraceIds: ['REQ-001'],
    setup: 's',
    actionOrTrigger: 'a',
    expectedResult: 'e',
    testLevel: 'unit',
    blockIndex: 0,
  };
}

function attribute(strategy: SemanticResponsibility[], text: string) {
  const v = validateVerificationResponsibilities(text);
  return evaluateVerificationAttribution({ semanticResponsibilities: strategy, declarations: v.declarations });
}

describe('attribution', () => {
  it.each([
    ['pass', REC(), 'passed'],
    ['fail', REC('x', '.', '1'), 'failed'],
    ['skipped', 'reason: no runner', 'skipped'],
    ['blocked', 'reason: env down', 'blocked'],
  ])('maps %s to %s', (status, body, state) => {
    const r = attribute([rsp('RSP-001')], `${ID}\nverification status: ${status}\n${body}`);
    expect(r.issues).toEqual([]);
    expect(r.responsibilities[0].state).toBe(state);
    expect(r.responsibilities[0].status).toBe(status);
  });

  it('reports missing declarations and orphans; copies criticality', () => {
    const r = attribute(
      [rsp('RSP-001', 'noncritical'), rsp('RSP-002')],
      `${PASS.replace('RSP-001', 'RSP-002')}\nverification responsibility ID: RSP-999\nverification status: skipped\nreason: r`,
    );
    expect(r.responsibilities.map((x) => [x.responsibilityId, x.criticality, x.state])).toEqual([
      ['RSP-001', 'noncritical', 'missing-declaration'],
      ['RSP-002', 'critical', 'passed'],
    ]);
    expect(r.issues.map((i) => [i.code, i.responsibilityId])).toEqual([
      ['VERIFICATION_RESPONSIBILITY_DECLARATION_MISSING', 'RSP-001'],
      ['VERIFICATION_RESPONSIBILITY_ORPHAN', 'RSP-999'],
    ]);
  });

  it('does not infer coverage from command text', () => {
    const r = attribute([rsp('RSP-001'), rsp('RSP-002')], `${ID}\nverification status: pass\n${REC('npm test RSP-002 src/b.ts')}`);
    expect(r.responsibilities.map((x) => x.state)).toEqual(['passed', 'missing-declaration']);
  });

  it('is deterministic and does not mutate inputs', () => {
    const strategy = [rsp('RSP-001')];
    const declarations = validateVerificationResponsibilities(PASS).declarations;
    const snapshot = JSON.stringify([strategy, declarations]);
    const a = evaluateVerificationAttribution({ semanticResponsibilities: strategy, declarations });
    const b = evaluateVerificationAttribution({ semanticResponsibilities: strategy, declarations });
    expect(a).toEqual(b);
    expect(JSON.stringify([strategy, declarations])).toBe(snapshot);
  });
});
