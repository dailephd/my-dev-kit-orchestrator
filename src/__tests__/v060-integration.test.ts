import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { readCorrectionState, isCorrectionActive } from '../correctionState';
import { generateCorrectionPrompt } from '../promptGenerator';
import { parseAndRoute } from '../correctionRouter';

const CLI = path.resolve(__dirname, '../../dist/cli.js');

function cli(args: string[], cwd: string): string {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function cliMayFail(args: string[], cwd: string): { stdout: string; status: number } {
  try {
    const stdout = cli(args, cwd);
    return { stdout, status: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? '', status: e.status ?? 1 };
  }
}

function withTempDir(fn: (dir: string) => void): void {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-v060-')));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeJudgeReport(runFolder: string, content: string): void {
  fs.writeFileSync(path.join(runFolder, 'artifacts', 'judge-report.txt'), content, 'utf8');
}

function getRunFolder(projectRoot: string): string {
  const runsDir = path.join(projectRoot, '.my-dev-kit-orchestrator', 'runs');
  const entries = fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  if (entries.length !== 1) throw new Error(`Expected 1 run, found ${entries.length}`);
  return path.join(runsDir, entries[0]);
}

// ─── correctionState helpers ──────────────────────────────────────────────────

describe('readCorrectionState', () => {
  it('returns null when no judge report exists', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      expect(readCorrectionState(runFolder)).toBeNull();
    });
  });

  it('returns pass state for PASS verdict', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      writeJudgeReport(runFolder, 'Verdict: PASS');
      const state = readCorrectionState(runFolder);
      expect(state).not.toBeNull();
      expect(state!.routeStatus).toBe('pass');
    });
  });

  it('returns correction_required for IMPLEMENTATION_MISMATCH', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      writeJudgeReport(runFolder, 'Verdict: IMPLEMENTATION_MISMATCH');
      const state = readCorrectionState(runFolder);
      expect(state!.routeStatus).toBe('correction_required');
      expect(state!.routedStage).toBe('implementation');
    });
  });

  it('returns correction_required for PSEUDOCODE_INCOMPLETE', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      writeJudgeReport(runFolder, 'Verdict: PSEUDOCODE_INCOMPLETE');
      const state = readCorrectionState(runFolder);
      expect(state!.routedStage).toBe('pseudocode-packet');
    });
  });

  it('returns correction_required for NEED_VERIFICATION', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      writeJudgeReport(runFolder, 'Verdict: NEED_VERIFICATION');
      const state = readCorrectionState(runFolder);
      expect(state!.routedStage).toBe('verification');
    });
  });

  it('returns blocked for SCOPE_VIOLATION', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      writeJudgeReport(runFolder, 'Verdict: SCOPE_VIOLATION');
      const state = readCorrectionState(runFolder);
      expect(state!.routeStatus).toBe('blocked');
      expect(state!.isBlocked).toBe(true);
    });
  });

  it('returns blocked for BLOCKED', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      writeJudgeReport(runFolder, 'Verdict: BLOCKED');
      const state = readCorrectionState(runFolder);
      expect(state!.routeStatus).toBe('blocked');
    });
  });
});

describe('isCorrectionActive', () => {
  it('returns false when no judge report', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      expect(isCorrectionActive(runFolder)).toBe(false);
    });
  });

  it('returns false for PASS', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      writeJudgeReport(runFolder, 'Verdict: PASS');
      expect(isCorrectionActive(runFolder)).toBe(false);
    });
  });

  it('returns true for correction_required verdicts', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      writeJudgeReport(runFolder, 'Verdict: DESIGN_INCOMPLETE');
      expect(isCorrectionActive(runFolder)).toBe(true);
    });
  });

  it('returns false for BLOCKED (no correctable stage)', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      writeJudgeReport(runFolder, 'Verdict: BLOCKED');
      expect(isCorrectionActive(runFolder)).toBe(false);
    });
  });
});

// ─── generateCorrectionPrompt ─────────────────────────────────────────────────

describe('generateCorrectionPrompt', () => {
  it('generates a bounded stage-specific prompt for implementation correction', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      const meta = {
        runId: 'test-run-001',
        mode: 'feature' as const,
        request: 'test',
        projectRoot: dir,
        runFolder,
        createdAt: new Date().toISOString(),
        currentStage: 'judge',
        stages: [],
        status: 'in_progress' as const,
      };
      const state = parseAndRoute('Verdict: IMPLEMENTATION_MISMATCH');
      const prompt = generateCorrectionPrompt(meta, state);
      expect(prompt).toContain('Stage: implementation (correction)');
      expect(prompt).toContain('Judge verdict: IMPLEMENTATION_MISMATCH');
      expect(prompt).toContain('judge-report.txt');
      expect(prompt).toContain('do not broaden scope');
      expect(prompt).toContain('do not run any external agent');
      expect(prompt).toContain('ImplementationReport');
    });
  });

  it('includes design-map when present', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'design-map.txt'), 'Design map content', 'utf8');
      const meta = {
        runId: 'test-run-002',
        mode: 'feature' as const,
        request: 'test',
        projectRoot: dir,
        runFolder,
        createdAt: new Date().toISOString(),
        currentStage: 'judge',
        stages: [],
        status: 'in_progress' as const,
      };
      const state = parseAndRoute('Verdict: PSEUDOCODE_INCOMPLETE');
      const prompt = generateCorrectionPrompt(meta, state);
      expect(prompt).toContain('design-map.txt');
    });
  });

  it('does not include design-map when absent', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      const meta = {
        runId: 'test-run-003',
        mode: 'feature' as const,
        request: 'test',
        projectRoot: dir,
        runFolder,
        createdAt: new Date().toISOString(),
        currentStage: 'judge',
        stages: [],
        status: 'in_progress' as const,
      };
      const state = parseAndRoute('Verdict: NEED_VERIFICATION');
      const prompt = generateCorrectionPrompt(meta, state);
      expect(prompt).not.toContain('design-map.txt');
    });
  });

  it('prompt does not ask for LLM calls or automatic execution', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      const meta = {
        runId: 'test-run-004',
        mode: 'feature' as const,
        request: 'test',
        projectRoot: dir,
        runFolder,
        createdAt: new Date().toISOString(),
        currentStage: 'judge',
        stages: [],
        status: 'in_progress' as const,
      };
      const state = parseAndRoute('Verdict: TEST_COVERAGE_INCOMPLETE');
      const prompt = generateCorrectionPrompt(meta, state);
      expect(prompt).not.toMatch(/openai|anthropic|langchain/i);
      expect(prompt).toContain('do not run any external agent');
    });
  });

  it('includes recommended stage when present', () => {
    withTempDir((dir) => {
      const runFolder = path.join(dir, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      const meta = {
        runId: 'test-run-005',
        mode: 'feature' as const,
        request: 'test',
        projectRoot: dir,
        runFolder,
        createdAt: new Date().toISOString(),
        currentStage: 'judge',
        stages: [],
        status: 'in_progress' as const,
      };
      const state = parseAndRoute(
        'Verdict: ARCHITECTURE_MISMATCH\nRecommended next stage: pseudocode-packet',
      );
      const prompt = generateCorrectionPrompt(meta, state);
      expect(prompt).toContain('pseudocode-packet');
    });
  });
});

// ─── CLI integration: status with judge reports ───────────────────────────────

describe('CLI status with judge report', () => {
  it('shows PASS correction status when judge report has PASS', () => {
    withTempDir((projectRoot) => {
      cli(['init'], projectRoot);
      cli(['start', '--mode', 'feature', 'v060 correction test'], projectRoot);
      const runFolder = getRunFolder(projectRoot);
      writeJudgeReport(runFolder, 'Verdict: PASS');
      const status = cli(['status'], projectRoot);
      expect(status).toContain('Judge correction: PASS');
    });
  });

  it('shows correction required with routed stage for IMPLEMENTATION_MISMATCH', () => {
    withTempDir((projectRoot) => {
      cli(['init'], projectRoot);
      cli(['start', '--mode', 'feature', 'v060 mismatch test'], projectRoot);
      const runFolder = getRunFolder(projectRoot);
      writeJudgeReport(runFolder, 'Verdict: IMPLEMENTATION_MISMATCH');
      const status = cli(['status'], projectRoot);
      expect(status).toContain('Judge correction:');
      expect(status).toContain('IMPLEMENTATION_MISMATCH');
      expect(status).toContain('Routed stage: implementation');
    });
  });

  it('shows blocked status for SCOPE_VIOLATION', () => {
    withTempDir((projectRoot) => {
      cli(['init'], projectRoot);
      cli(['start', '--mode', 'feature', 'v060 blocked test'], projectRoot);
      const runFolder = getRunFolder(projectRoot);
      writeJudgeReport(runFolder, 'Verdict: SCOPE_VIOLATION');
      const status = cli(['status'], projectRoot);
      expect(status).toContain('blocked');
      expect(status).toContain('SCOPE_VIOLATION');
    });
  });

  it('shows no correction section when no judge report', () => {
    withTempDir((projectRoot) => {
      cli(['init'], projectRoot);
      cli(['start', '--mode', 'feature', 'v060 no judge test'], projectRoot);
      const status = cli(['status'], projectRoot);
      expect(status).not.toContain('Judge correction:');
    });
  });
});

// ─── CLI integration: prompt with correction ──────────────────────────────────

describe('CLI prompt with correction routing', () => {
  it('normal prompt works with no judge report (backward compat)', () => {
    withTempDir((projectRoot) => {
      cli(['init'], projectRoot);
      cli(['start', '--mode', 'feature', 'v060 normal prompt test'], projectRoot);
      const prompt = cli(['prompt'], projectRoot);
      expect(prompt).toContain('Stage: request-brief');
    });
  });

  it('correction prompt prints when IMPLEMENTATION_MISMATCH verdict present', () => {
    withTempDir((projectRoot) => {
      cli(['init'], projectRoot);
      cli(['start', '--mode', 'feature', 'v060 correction prompt test'], projectRoot);
      const runFolder = getRunFolder(projectRoot);
      writeJudgeReport(runFolder, 'Verdict: IMPLEMENTATION_MISMATCH');
      const prompt = cli(['prompt'], projectRoot);
      expect(prompt).toContain('Stage: implementation (correction)');
      expect(prompt).toContain('IMPLEMENTATION_MISMATCH');
      expect(prompt).toContain('judge-report.txt');
    });
  });

  it('blocked verdict produces blocked prompt output', () => {
    withTempDir((projectRoot) => {
      cli(['init'], projectRoot);
      cli(['start', '--mode', 'feature', 'v060 blocked prompt test'], projectRoot);
      const runFolder = getRunFolder(projectRoot);
      writeJudgeReport(runFolder, 'Verdict: BLOCKED');
      const { stdout } = cliMayFail(['prompt'], projectRoot);
      expect(stdout).toContain('blocked');
      expect(stdout).toContain('BLOCKED');
    });
  });

  it('correction prompt does not include unrelated workflow modes', () => {
    withTempDir((projectRoot) => {
      cli(['init'], projectRoot);
      cli(['start', '--mode', 'feature', 'v060 prompt scope test'], projectRoot);
      const runFolder = getRunFolder(projectRoot);
      writeJudgeReport(runFolder, 'Verdict: NEED_VERIFICATION');
      const prompt = cli(['prompt'], projectRoot);
      expect(prompt).toContain('Stage: verification (correction)');
      expect(prompt).not.toContain('extraction');
    });
  });
});
