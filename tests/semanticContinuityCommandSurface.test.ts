// v1.5.0 Batch 5: Semantic Continuity on the existing command surface
// (status, check, export, and the live judge prompt), plus cross-surface
// agreement and the "no new persisted state / no new public surface"
// invariants.
//
// Every surface must project the SAME canonical RunIntegrityGateResult, so the
// agreement test compares them on one blocked and one warning fixture.
//
// The ordinary artifact-content checkers are stubbed for this file only:
// fixture artifacts are minimal, so their content/contract checks always fail
// and would mask the semantic exit-code behavior under test. Everything
// semantic (gate, judge integrity, context readiness) is real.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../src/artifactChecker', () => ({
  ...jest.requireActual('../src/artifactChecker'),
  checkAllArtifacts: () => [],
}));
jest.mock('../src/promptChecker', () => ({
  ...jest.requireActual('../src/promptChecker'),
  checkAllPrompts: () => [],
}));
jest.mock('../src/contractChecker', () => ({
  ...jest.requireActual('../src/contractChecker'),
  checkRunArtifactContracts: () => ({ modeValid: true, modeIssues: [], results: [] }),
  checkStageGates: () => [],
}));
jest.mock('../src/traceChecker', () => ({
  ...jest.requireActual('../src/traceChecker'),
  checkAllTraces: () => [],
}));

import { RunMetadata } from '../src/run';
import { VALID_MODES } from '../src/types';
import { createProgram } from '../src/program';
import { runCli } from './cliTestHelpers';
import { makeSemanticRun, strategyBlock, writePriorArtifacts } from './semanticRunTestHelpers';

const NONCRITICAL = strategyBlock('RSP-001', { criticality: 'noncritical' });

type Opts = Parameters<typeof makeSemanticRun>[1];

function withRun<T>(opts: Opts, stage: string | null, fn: (meta: RunMetadata, tmp: string) => T): T {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-semantic-surface-'));
  try {
    const meta = makeSemanticRun(tmp, opts);
    if (stage) writePriorArtifacts(meta, stage);
    return fn(meta, tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// The four canonical states, each evaluated at the judge stage (all legs active).
const READY: [Opts, string] = [{}, 'judge'];
const WARNING: [Opts, string] = [{ strategy: NONCRITICAL, ver: null }, 'judge'];
const BLOCKED: [Opts, string] = [{ ver: null }, 'judge'];
// Before the strategy stage has been passed, continuity is pending (and the gate ready).
const PENDING: [Opts, string] = [{ strategy: null, impl: null, test: null, ver: null }, 'test-strategy'];
const LEGACY: [Opts, string] = [{ version: null, ver: null }, 'judge'];

const CHECK_MODES: Array<[string, string[]]> = [
  ['default', []],
  ['--artifacts', ['--artifacts']],
  ['--all', ['--all']],
];

// ─── status ─────────────────────────────────────────────────────────────────

describe('status: Semantic continuity section', () => {
  it('pending: shows a compact ready/pending summary', () => {
    withRun(PENDING[0], PENDING[1], (_m, tmp) => {
      const out = runCli(['status', '--root', tmp]).output;
      expect(out).toContain('Semantic continuity:');
      expect(out).toContain('Contract version: 1.0.0');
      expect(out).toContain('Semantic classification: ready');
      expect(out).toContain('Continuity state: pending');
      expect(out).toContain('Run integrity ready: yes');
      expect(out).not.toContain('Blocking codes');
    });
  });

  it('ready: shows a complete continuity state with responsibility totals', () => {
    withRun(READY[0], READY[1], (_m, tmp) => {
      const out = runCli(['status', '--root', tmp]).output;
      expect(out).toContain('Semantic classification: ready');
      expect(out).toContain('Continuity state: complete');
      expect(out).toContain('Critical responsibilities (total / unsatisfied): 1 / 0');
      expect(out).toContain('Noncritical responsibilities (total / unsatisfied): 0 / 0');
      expect(out).not.toContain('Recommended correction stage');
    });
  });

  it('warning: shows warning IDs and codes without blocked wording', () => {
    withRun(WARNING[0], WARNING[1], (_m, tmp) => {
      const out = runCli(['status', '--root', tmp]).output;
      expect(out).toContain('Semantic classification: warning');
      expect(out).toContain('Warning responsibility IDs: RSP-001');
      expect(out).toContain('Warning codes: SEMANTIC_CONTINUITY_NONCRITICAL_RESPONSIBILITY_UNSATISFIED');
      expect(out).toContain('Noncritical responsibilities (total / unsatisfied): 1 / 1');
      expect(out).toContain('Run integrity ready: yes');
      expect(out).not.toContain('Blocking responsibility IDs');
      expect(out).not.toContain('Recommended correction stage');
    });
  });

  it('blocked: shows the blocker, codes, and the canonical correction stage', () => {
    withRun(BLOCKED[0], BLOCKED[1], (_m, tmp) => {
      const out = runCli(['status', '--root', tmp]).output;
      expect(out).toContain('Semantic classification: blocked');
      expect(out).toContain('Run integrity ready: no');
      expect(out).toContain('Critical responsibilities (total / unsatisfied): 1 / 1');
      expect(out).toContain('Blocking responsibility IDs: RSP-001');
      expect(out).toContain('Blocking codes: SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED');
      expect(out).toContain('Recommended correction stage: verification');
    });
  });

  it('unsupported version: blocked with no recommended correction stage', () => {
    withRun({ version: '9.9.9' }, 'judge', (_m, tmp) => {
      const out = runCli(['status', '--root', tmp]).output;
      expect(out).toContain('Contract version: 9.9.9');
      expect(out).toContain('Semantic classification: blocked');
      expect(out).toContain('Recommended correction stage: (none: external resolution required)');
    });
  });

  it('legacy absent-version run: no Semantic continuity output at all', () => {
    withRun(LEGACY[0], LEGACY[1], (_m, tmp) => {
      expect(runCli(['status', '--root', tmp]).output).not.toContain('Semantic continuity');
    });
  });

  it('greenfield is unaffected', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-semantic-greenfield-'));
    try {
      runCli(['start', 'a new app', '--mode', 'greenfield', '--root', tmp]);
      expect(runCli(['status', '--root', tmp]).output).not.toContain('Semantic continuity');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ─── check ──────────────────────────────────────────────────────────────────

describe('check: Semantic continuity section and exit codes', () => {
  it.each(CHECK_MODES)('ready → pass, exit 0 (%s)', (_label, args) => {
    withRun(READY[0], READY[1], (_m, tmp) => {
      const r = runCli(['check', ...args, '--root', tmp]);
      expect(r.output).toContain('=== Semantic continuity ===');
      expect(r.output).toContain('[pass] Semantic continuity 1.0.0: ready (continuity: complete)');
      expect(r.exitCode).toBeUndefined();
    });
  });

  it.each(CHECK_MODES)('pending continuity inside a ready gate stays pass (%s)', (_label, args) => {
    withRun(PENDING[0], PENDING[1], (_m, tmp) => {
      const r = runCli(['check', ...args, '--root', tmp]);
      expect(r.output).toContain('[pass] Semantic continuity 1.0.0: ready (continuity: pending)');
      expect(r.exitCode).toBeUndefined();
    });
  });

  it.each(CHECK_MODES)('warning → warn, exit 0 normally (%s)', (_label, args) => {
    withRun(WARNING[0], WARNING[1], (_m, tmp) => {
      const r = runCli(['check', ...args, '--root', tmp]);
      expect(r.output).toContain('[warn] Semantic continuity 1.0.0: warning');
      expect(r.output).toContain('Warning responsibility IDs: RSP-001');
      expect(r.output).not.toContain('Primary blocking code');
      expect(r.exitCode).toBeUndefined();
    });
  });

  it.each(CHECK_MODES)('warning + --strict → exit 1 (%s)', (_label, args) => {
    withRun(WARNING[0], WARNING[1], (_m, tmp) => {
      expect(runCli(['check', ...args, '--strict', '--root', tmp]).exitCode).toBe(1);
    });
  });

  it.each(CHECK_MODES)('ready + --strict stays exit 0 (%s)', (_label, args) => {
    withRun(READY[0], READY[1], (_m, tmp) => {
      expect(runCli(['check', ...args, '--strict', '--root', tmp]).exitCode).toBeUndefined();
    });
  });

  it.each(CHECK_MODES)('blocked → fail, exit 1, with the blocker details (%s)', (_label, args) => {
    withRun(BLOCKED[0], BLOCKED[1], (_m, tmp) => {
      const r = runCli(['check', ...args, '--root', tmp]);
      expect(r.output).toContain('[fail] Semantic continuity 1.0.0: blocked');
      expect(r.output).toContain('Primary blocking code: SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED');
      expect(r.output).toContain('Primary reason: Responsibility "RSP-001" (critical) is incomplete at the verification leg.');
      expect(r.output).toContain('Affected responsibility: RSP-001');
      expect(r.output).toContain('Broken leg: verification');
      expect(r.output).toContain('Recommended correction stage: verification');
      expect(r.exitCode).toBe(1);
    });
  });

  it('check --all summary reports the semantic result', () => {
    withRun(BLOCKED[0], BLOCKED[1], (_m, tmp) => {
      expect(runCli(['check', '--all', '--root', tmp]).output).toContain('Semantic continuity: fail');
    });
    withRun(WARNING[0], WARNING[1], (_m, tmp) => {
      expect(runCli(['check', '--all', '--root', tmp]).output).toContain('Semantic continuity: warn');
    });
  });

  it('unsupported version fails check with no correction stage', () => {
    withRun({ version: '9.9.9' }, 'judge', (_m, tmp) => {
      const r = runCli(['check', '--all', '--root', tmp]);
      expect(r.output).toContain('Primary blocking code: SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED');
      expect(r.output).toContain('Recommended correction stage: (none: external resolution required)');
      expect(r.exitCode).toBe(1);
    });
  });

  it.each(CHECK_MODES)('legacy run has no semantic section and is not failed by it (%s)', (_label, args) => {
    withRun(LEGACY[0], LEGACY[1], (_m, tmp) => {
      const r = runCli(['check', ...args, '--root', tmp]);
      expect(r.output).not.toContain('Semantic continuity');
      expect(r.exitCode).toBeUndefined();
    });
  });

  it('narrow commands do not gain a global semantic section and no check --semantic flag exists', () => {
    withRun(BLOCKED[0], BLOCKED[1], (_m, tmp) => {
      expect(runCli(['check', '--trace', '--root', tmp]).output).not.toContain('=== Semantic continuity ===');
      expect(runCli(['check', '--help']).output).not.toContain('--semantic');
    });
  });
});

// ─── export ─────────────────────────────────────────────────────────────────

describe('export: Semantic continuity section', () => {
  it('blocked: compact canonical summary plus run identity', () => {
    withRun(BLOCKED[0], BLOCKED[1], (_m, tmp) => {
      const out = runCli(['export', '--root', tmp]).output;
      expect(out).toContain('Semantic continuity: active (1.0.0)');
      expect(out).toContain('=== Semantic continuity ===');
      for (const line of [
        'contractVersion: 1.0.0',
        'semanticClassification: blocked',
        'continuityState:',
        'runIntegrityReady: false',
        'criticalResponsibilityCount: 1',
        'criticalUnsatisfiedResponsibilityIds: RSP-001',
        'noncriticalResponsibilityCount: 0',
        'noncriticalUnsatisfiedResponsibilityIds: (none)',
        'blockingCodes: SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED',
        'warningCodes: (none)',
        'expectedJudgeVerdict: NEED_CONTEXT',
        'recommendedCorrectionStage: verification',
      ]) {
        expect(out).toContain(line);
      }
    });
  });

  it('warning and ready summaries', () => {
    withRun(WARNING[0], WARNING[1], (_m, tmp) => {
      const out = runCli(['export', '--root', tmp]).output;
      expect(out).toContain('semanticClassification: warning');
      expect(out).toContain('noncriticalUnsatisfiedResponsibilityIds: RSP-001');
      expect(out).toContain('warningResponsibilityIds: RSP-001');
      expect(out).toContain('expectedJudgeVerdict: PASS');
      expect(out).toContain('recommendedCorrectionStage: (none)');
    });
    withRun(READY[0], READY[1], (_m, tmp) => {
      const out = runCli(['export', '--root', tmp]).output;
      expect(out).toContain('semanticClassification: ready');
      expect(out).toContain('continuityState: complete');
      expect(out).toContain('runIntegrityReady: true');
    });
  });

  it('never copies raw capsule, audit, or parser output', () => {
    withRun(BLOCKED[0], BLOCKED[1], (meta, tmp) => {
      const out = runCli(['export', '--root', tmp]).output;
      const capsule = fs.readFileSync(path.join(meta.runFolder, 'implementation-capsule.json'), 'utf8');
      expect(out).not.toContain(capsule);
      for (const raw of ['responsibilityMappings', 'productionSymbols', 'roleAdequacy', 'comparedIdentities', 'symbol:src/a.ts#run']) {
        expect(out).not.toContain(raw);
      }
      // Only the compact section: no full continuity object dump.
      expect(out).not.toContain('"responsibilities"');
      expect(out).not.toContain('missingUpstreamTraceIds');
    });
  });

  it('legacy export has no semantic section and does not claim activation', () => {
    withRun(LEGACY[0], LEGACY[1], (_m, tmp) => {
      const out = runCli(['export', '--root', tmp]).output;
      expect(out).not.toContain('Semantic continuity');
    });
  });
});

// ─── live judge prompt ──────────────────────────────────────────────────────

describe('judge prompt: canonical Semantic Continuity summary', () => {
  function judgePrompt(tmp: string): string {
    return runCli(['prompt', 'judge', '--root', tmp]).output;
  }

  it('ready: shows the complete state and PASS expectation with the judge policy', () => {
    withRun(READY[0], READY[1], (_m, tmp) => {
      const out = judgePrompt(tmp);
      expect(out).toContain('Required output artifact: JudgeReport');
      expect(out).toContain('Semantic continuity contract: 1.0.0');
      expect(out).toContain('Semantic classification: ready');
      expect(out).toContain('Continuity state: complete');
      expect(out).toContain('Run integrity ready: yes');
      expect(out).toContain('Expected judge verdict: PASS');
      expect(out).toContain('RunIntegrityGate is the canonical deterministic integrity decision');
      expect(out).toContain('do not override a canonical NEED_CONTEXT with PASS');
      expect(out).not.toContain('Judge freely on the complete evidence');
    });
  });

  it('warning-only: shows warning IDs but expects PASS and does not demand a non-PASS verdict', () => {
    withRun(WARNING[0], WARNING[1], (_m, tmp) => {
      const out = judgePrompt(tmp);
      expect(out).toContain('Required output artifact: JudgeReport');
      expect(out).toContain('Semantic classification: warning');
      expect(out).toContain('Warning responsibility IDs: RSP-001');
      expect(out).toContain('Expected judge verdict: PASS');
      expect(out).toContain('noncritical semantic warnings alone do not require a non-PASS verdict');
      expect(out).not.toContain('Blocking responsibility IDs');
      expect(out).not.toContain('Canonical recommended correction stage');
    });
  });

  it('blocked: expected NEED_CONTEXT, blocking RSPs, canonical stage, and PASS prohibited', () => {
    withRun(BLOCKED[0], BLOCKED[1], (_m, tmp) => {
      const out = judgePrompt(tmp);
      expect(out).toContain('Semantic classification: blocked');
      expect(out).toContain('Expected judge verdict: NEED_CONTEXT');
      expect(out).toContain('Blocking responsibility IDs: RSP-001');
      expect(out).toContain('Primary blocking code: SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED');
      expect(out).toContain('Canonical recommended correction stage: verification');
      expect(out).toContain('Do not return PASS');
      expect(out).not.toContain('Judge freely on the complete evidence');
      expect(out).not.toContain('Required output artifact: JudgeReport');
    });
  });

  it('legacy judge prompt has no semantic summary', () => {
    withRun(LEGACY[0], LEGACY[1], (_m, tmp) => {
      const out = judgePrompt(tmp);
      expect(out).not.toContain('Semantic classification');
      expect(out).toContain('Required output artifact: JudgeReport');
    });
  });
});

// ─── cross-surface agreement ────────────────────────────────────────────────

describe('cross-surface agreement on the canonical gate', () => {
  function field(text: string, label: string): string | undefined {
    const m = new RegExp(`${label}:\\s*(.+)`).exec(text);
    return m ? m[1].trim() : undefined;
  }

  it('blocked: status, check, export, and the judge prompt agree', () => {
    withRun(BLOCKED[0], BLOCKED[1], (_m, tmp) => {
      const status = runCli(['status', '--root', tmp]).output;
      const check = runCli(['check', '--all', '--root', tmp]).output;
      const exported = runCli(['export', '--root', tmp]).output;
      const judge = runCli(['prompt', 'judge', '--root', tmp]).output;

      // Classification
      expect(field(status, 'Semantic classification')).toBe('blocked');
      expect(check).toContain('[fail] Semantic continuity 1.0.0: blocked');
      expect(field(exported, 'semanticClassification')).toBe('blocked');
      expect(field(judge, 'Semantic classification')).toBe('blocked');

      // Blocking RSP IDs
      expect(field(status, 'Blocking responsibility IDs')).toBe('RSP-001');
      expect(field(check, 'Blocking responsibility IDs')).toBe('RSP-001');
      expect(field(exported, 'blockingResponsibilityIds')).toBe('RSP-001');
      expect(field(judge, 'Blocking responsibility IDs')).toBe('RSP-001');

      // Primary blocker
      const code = 'SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED';
      expect(field(status, 'Blocking codes')).toBe(code);
      expect(field(check, 'Primary blocking code')).toBe(code);
      expect(field(exported, 'primaryBlockingCode')).toBe(code);
      expect(field(judge, 'Primary blocking code')).toBe(code);

      // Recommended correction stage
      expect(field(status, 'Recommended correction stage')).toBe('verification');
      expect(field(check, 'Recommended correction stage')).toBe('verification');
      expect(field(exported, 'recommendedCorrectionStage')).toBe('verification');
      expect(field(judge, 'Canonical recommended correction stage')).toBe('verification');

      // Expected judge verdict and run integrity
      expect(field(exported, 'expectedJudgeVerdict')).toBe('NEED_CONTEXT');
      expect(field(judge, 'Expected judge verdict')).toBe('NEED_CONTEXT');
      expect(field(status, 'Run integrity ready')).toBe('no');
      expect(field(exported, 'runIntegrityReady')).toBe('false');
      expect(field(judge, 'Run integrity ready')).toBe('no');
    });
  });

  it('warning: every surface reports the same warning IDs and a PASS expectation', () => {
    withRun(WARNING[0], WARNING[1], (_m, tmp) => {
      const status = runCli(['status', '--root', tmp]).output;
      const check = runCli(['check', '--all', '--root', tmp]).output;
      const exported = runCli(['export', '--root', tmp]).output;
      const judge = runCli(['prompt', 'judge', '--root', tmp]).output;
      expect(field(status, 'Semantic classification')).toBe('warning');
      expect(check).toContain('[warn] Semantic continuity 1.0.0: warning');
      expect(field(exported, 'semanticClassification')).toBe('warning');
      expect(field(judge, 'Semantic classification')).toBe('warning');
      expect(field(status, 'Warning responsibility IDs')).toBe('RSP-001');
      expect(field(check, 'Warning responsibility IDs')).toBe('RSP-001');
      expect(field(exported, 'warningResponsibilityIds')).toBe('RSP-001');
      expect(field(judge, 'Warning responsibility IDs')).toBe('RSP-001');
      expect(field(exported, 'expectedJudgeVerdict')).toBe('PASS');
      expect(field(judge, 'Expected judge verdict')).toBe('PASS');
    });
  });
});

// ─── no persisted state, no new public surface, no duplicate parsing ────────

describe('invariants', () => {
  it('surface commands write no semantic state file', () => {
    withRun(BLOCKED[0], BLOCKED[1], (meta, tmp) => {
      for (const args of [['status'], ['check', '--all'], ['export'], ['prompt'], ['prompt', 'judge']]) {
        runCli([...args, '--root', tmp]);
      }
      const names: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) walk(path.join(dir, entry.name));
          else names.push(entry.name);
        }
      };
      walk(tmp);
      for (const forbidden of ['semantic-continuity.json', 'semantic-check-results.json', 'rsp-state.json']) {
        expect(names).not.toContain(forbidden);
      }
      expect(names.filter((n) => /semantic|rsp-state/i.test(n))).toEqual([]);
      expect(JSON.parse(fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8')).semanticContinuityVersion).toBe('1.0.0');
    });
  });

  it('keeps 8 commands and 7 modes, with no activation or status-JSON flag', () => {
    const program = createProgram();
    expect(program.commands.map((c) => c.name()).sort()).toEqual(
      ['check', 'export', 'init', 'list', 'mark', 'prompt', 'start', 'status'],
    );
    expect(VALID_MODES).toHaveLength(7);
    for (const cmd of program.commands) {
      const flags = cmd.options.map((o) => o.long);
      for (const banned of ['--semantic', '--continuity', '--rsp', '--direct', '--full-stage-context']) {
        expect(flags).not.toContain(banned);
      }
    }
    expect(program.commands.find((c) => c.name() === 'status')!.options.map((o) => o.long)).not.toContain('--json');
  });

  it('the package version is unchanged', () => {
    expect(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version).toBe('1.4.1');
  });

  it('artifactChecker does not duplicate Semantic Continuity parsing', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'artifactChecker.ts'), 'utf8');
    expect(source).not.toMatch(/semanticResponsibility|validateSemanticResponsibilities|RSP-\d|semanticContinuity/i);
  });
});
