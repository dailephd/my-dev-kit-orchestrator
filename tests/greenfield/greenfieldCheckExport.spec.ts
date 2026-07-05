import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createProgram } from '../../src/program';
import { createRun, RunMetadata } from '../../src/run';
import { initWorkspace } from '../../src/workspace';
import { checkAllArtifacts } from '../../src/artifactChecker';
import { checkRunArtifactContracts, checkStageGates } from '../../src/contractChecker';
import { readArtifactStateFile } from '../../src/artifactLifecycle';
import { buildExportText } from '../../src/commands/export';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-greenfield-check-export-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runCliCaptured(args: string[]): { output: string; exitCode: number | undefined } {
  const lines: string[] = [];
  const errLines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  const origWrite = process.stdout.write.bind(process.stdout);
  const origExit = process.exit;
  let exitCode: number | undefined;
  console.log = (msg: string) => lines.push(msg);
  console.error = (msg: string) => errLines.push(msg);
  process.stdout.write = ((chunk: string) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.exit = ((code?: number) => {
    exitCode = code;
    throw new Error('mdko-test-exit');
  }) as never;

  try {
    createProgram().parse(['node', 'cli', ...args]);
  } catch (e) {
    if ((e as Error).message !== 'mdko-test-exit') throw e;
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.stdout.write = origWrite;
    process.exit = origExit;
  }

  return { output: [...lines, ...errLines].join('\n'), exitCode };
}

function makeGreenfieldRun(tmp: string): RunMetadata {
  initWorkspace(tmp);
  return createRun({
    request: 'Create a sample TypeScript CLI app',
    mode: 'greenfield',
    projectRoot: tmp,
  });
}

// ─── check (default artifact/prompt mode) ──────────────────────────────────────

describe('check command - greenfield artifact checking', () => {
  it('reports MISSING_FILE-equivalent [fail] for a greenfield run with no artifacts', () => {
    const tmp = makeTempDir();
    try {
      makeGreenfieldRun(tmp);
      const { output } = runCliCaptured(['check', '--root', tmp]);
      expect(output).toContain('Check results for run:');
      expect(output).toContain('[fail]');
      expect(output).toContain('idea-brief.json');
    } finally {
      cleanup(tmp);
    }
  });

  it('accepts a present, minimally valid greenfield artifact', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeGreenfieldRun(tmp);
      fs.writeFileSync(
        path.join(meta.runFolder, 'artifacts/idea-brief.json'),
        [
          'Artifact: IdeaBrief',
          'Workflow mode: greenfield',
          'Raw idea: A CLI tool for tracking tasks across a small distributed team.',
          'Constraints: must remain offline-capable',
          'Non-goals: no mobile app in v1',
          'Status: complete',
        ].join('\n'),
        'utf8',
      );
      const { output } = runCliCaptured(['check', '--artifact', 'idea-brief', '--root', tmp]);
      expect(output).toContain('[pass]');
    } finally {
      cleanup(tmp);
    }
  });

  it('does not regress feature mode default check behavior', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'Add a sample feature', mode: 'feature', projectRoot: tmp });
      const { output } = runCliCaptured(['check', '--root', tmp]);
      expect(output).toContain('Check results for run:');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── check --artifacts (contract check) ────────────────────────────────────────

describe('check --artifacts - greenfield contract checking', () => {
  it('resolves a valid mode and 13 stage contracts for a greenfield run', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeGreenfieldRun(tmp);
      const contractResult = checkRunArtifactContracts(meta, {});
      expect(contractResult.modeValid).toBe(true);
      expect(contractResult.results.length).toBe(13);
    } finally {
      cleanup(tmp);
    }
  });

  it('CLI check --artifacts reports contract results for a greenfield run', () => {
    const tmp = makeTempDir();
    try {
      makeGreenfieldRun(tmp);
      const { output } = runCliCaptured(['check', '--artifacts', '--root', tmp]);
      expect(output).toContain('Artifact contract check for run:');
      expect(output).toContain('idea-brief.json');
      expect(output).toContain('mode: greenfield');
    } finally {
      cleanup(tmp);
    }
  });

  it('does not require any Android/mobile artifact in the contract summary', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeGreenfieldRun(tmp);
      const contractResult = checkRunArtifactContracts(meta, {});
      const serialized = JSON.stringify(contractResult).toLowerCase();
      expect(serialized).not.toMatch(/android|react-native|flutter|jetpack/);
    } finally {
      cleanup(tmp);
    }
  });

  it('does not require any release/security/publish artifact in the contract summary', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeGreenfieldRun(tmp);
      const contractResult = checkRunArtifactContracts(meta, {});
      const stageNames = contractResult.results.map((r) => r.stageName).join(' ').toLowerCase();
      const artifactKinds = contractResult.results.map((r) => r.artifactKind).join(' ').toLowerCase();
      for (const forbidden of ['release', 'security', 'publish']) {
        expect(stageNames).not.toContain(forbidden);
        expect(artifactKinds).not.toContain(forbidden);
      }
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── check --all ────────────────────────────────────────────────────────────────

describe('check --all - greenfield', () => {
  it('runs all v1 checks for a fresh greenfield run without throwing', () => {
    const tmp = makeTempDir();
    try {
      makeGreenfieldRun(tmp);
      const { output } = runCliCaptured(['check', '--all', '--root', tmp]);
      expect(output).toContain('Full check for run:');
      expect(output).toContain('=== Artifact contracts ===');
      expect(output).toContain('=== Stage gates ===');
      expect(output).toContain('=== Trace checks ===');
      expect(output).toContain('=== Correction routing ===');
      expect(output).toContain('=== Summary ===');
    } finally {
      cleanup(tmp);
    }
  });

  it('stage gates: judge-requires-verification and final-report-requires-judge apply to greenfield', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeGreenfieldRun(tmp);
      // Simulate judge artifact present without verification: should violate Gate 5.
      fs.writeFileSync(
        path.join(meta.runFolder, 'artifacts/judge-report.txt'),
        'Artifact: JudgeReport\nWorkflow mode: greenfield\nVerdict: PASS\nStatus: complete',
        'utf8',
      );
      const violations = checkStageGates(meta);
      expect(violations.some((v) => v.gateName.includes('Gate 5'))).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('does not regress check --all for feature mode', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'Add a sample feature', mode: 'feature', projectRoot: tmp });
      const { output } = runCliCaptured(['check', '--all', '--root', tmp]);
      expect(output).toContain('Full check for run:');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── export / handoff ──────────────────────────────────────────────────────────

describe('export - greenfield handoff', () => {
  it('includes greenfield mode, request, and all 13 stage artifact expectations', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeGreenfieldRun(tmp);
      const text = buildExportText(meta);
      expect(text).toContain('Mode:         greenfield');
      expect(text).toContain('Create a sample TypeScript CLI app');
      expect(text).toContain('idea-brief.json');
      expect(text).toContain('reports/scaffold-implementation-report.txt');
      expect(text).toContain('reports/initial-index-report.txt');
      // 13 stages -> 13 checklist lines
      const checklistLines = text.split('\n').filter((l) => l.includes('(') && l.trim().startsWith('['));
      expect(checklistLines.length).toBe(13);
    } finally {
      cleanup(tmp);
    }
  });

  it('does not assume feature-mode-only artifact names', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeGreenfieldRun(tmp);
      const text = buildExportText(meta);
      expect(text).not.toContain('request-brief.txt');
      expect(text).not.toContain('pseudocode-packet.txt');
    } finally {
      cleanup(tmp);
    }
  });

  it('does not include Android/mobile or release/security/publish workflow instructions', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeGreenfieldRun(tmp);
      const text = buildExportText(meta).toLowerCase();
      expect(text).not.toMatch(/android|react-native|flutter|jetpack/);
      expect(text).not.toMatch(/npm publish|github release|security[- ]validate/);
    } finally {
      cleanup(tmp);
    }
  });

  it('CLI export command works for a greenfield run and prints it to stdout', () => {
    const tmp = makeTempDir();
    try {
      makeGreenfieldRun(tmp);
      const { output } = runCliCaptured(['export', '--root', tmp]);
      expect(output).toContain('Mode:         greenfield');
    } finally {
      cleanup(tmp);
    }
  });

  it('CLI export --out refuses to write when the target path is an existing directory (path safety, identical to other modes)', () => {
    const tmp = makeTempDir();
    try {
      makeGreenfieldRun(tmp);
      const dirAsOut = path.join(tmp, 'a-directory');
      fs.mkdirSync(dirAsOut);
      const { output, exitCode } = runCliCaptured(['export', '--root', tmp, '--out', dirAsOut]);
      expect(exitCode).toBe(1);
      expect(output).toMatch(/output path rejected/);
    } finally {
      cleanup(tmp);
    }
  });

  it('does not regress export behavior for feature mode', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'Add a sample feature', mode: 'feature', projectRoot: tmp });
      const text = buildExportText(meta);
      expect(text).toContain('Mode:         feature');
      expect(text).toContain('request-brief.txt');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── shared artifactChecker.ts coverage (validateGreenfieldArtifacts decision evidence) ──

describe('shared artifactChecker.ts already covers greenfield (no dedicated validator needed)', () => {
  it('checkAllArtifacts resolves a known kind (not "Unknown") for every greenfield stage', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeGreenfieldRun(tmp);
      const stateFile = readArtifactStateFile(meta.runFolder);
      const results = checkAllArtifacts(meta, stateFile);
      expect(results.length).toBe(13);
      for (const result of results) {
        expect(result.artifactKind).not.toBe('Unknown');
      }
    } finally {
      cleanup(tmp);
    }
  });
});
