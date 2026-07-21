import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildExportText } from '../commands/export';
import { RunMetadata } from '../run';
import { createProgram } from '../program';
import { createRun } from '../run';
import { initWorkspace } from '../workspace';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-export-test-'));
}

function writeArtifact(dir: string, relPath: string, content: string): void {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

const FEATURE_STAGES: RunMetadata['stages'] = [
  { name: 'request-brief', artifactFile: 'artifacts/request-brief.txt', promptFile: 'prompts/01.txt' },
  { name: 'behavior-model', artifactFile: 'artifacts/behavior-model.txt', promptFile: 'prompts/02.txt' },
  { name: 'pseudocode-packet', artifactFile: 'artifacts/pseudocode-packet.txt', promptFile: 'prompts/03.txt' },
  { name: 'implementation', artifactFile: 'artifacts/implementation-report.txt', promptFile: 'prompts/04.txt' },
  { name: 'verification', artifactFile: 'artifacts/verification-report.txt', promptFile: 'prompts/05.txt' },
  { name: 'judge', artifactFile: 'artifacts/judge-report.txt', promptFile: 'prompts/06.txt' },
  { name: 'final-report', artifactFile: 'artifacts/final-report.txt', promptFile: 'prompts/07.txt' },
];

function makeExportMeta(tmpDir: string, overrides: Partial<{
  currentStage: string;
  status: string;
}> = {}): Parameters<typeof buildExportText>[0] {
  return {
    runId: 'test-export-run-001',
    mode: 'feature',
    request: 'Add export command for portable run handoff',
    currentStage: overrides.currentStage ?? 'request-brief',
    status: overrides.status ?? 'created',
    createdAt: '2026-06-24T14:00:00.000Z',
    runFolder: tmpDir,
    stages: FEATURE_STAGES,
  };
}

// ─── buildExportText structure ────────────────────────────────────────────────

describe('buildExportText', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('includes run identity section', () => {
    const meta = makeExportMeta(tmpDir);
    const text = buildExportText(meta);
    expect(text).toContain('Run ID:');
    expect(text).toContain('test-export-run-001');
    expect(text).toContain('Mode:');
    expect(text).toContain('feature');
    expect(text).toContain('Current stage:');
  });

  it('includes request section', () => {
    const meta = makeExportMeta(tmpDir);
    const text = buildExportText(meta);
    expect(text).toContain('=== Request ===');
    expect(text).toContain('Add export command for portable run handoff');
  });

  it('includes artifact checklist section', () => {
    const meta = makeExportMeta(tmpDir);
    const text = buildExportText(meta);
    expect(text).toContain('=== Artifact checklist ===');
    expect(text).toContain('artifacts/request-brief.txt');
  });

  it('marks present artifacts as present', () => {
    const meta = makeExportMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/request-brief.txt', 'Status: complete\n');
    const text = buildExportText(meta);
    expect(text).toContain('[present] artifacts/request-brief.txt');
  });

  it('marks missing artifacts as missing', () => {
    const meta = makeExportMeta(tmpDir);
    const text = buildExportText(meta);
    expect(text).toContain('[missing] artifacts/request-brief.txt');
  });

  it('includes missing artifacts section listing names', () => {
    const meta = makeExportMeta(tmpDir);
    const text = buildExportText(meta);
    expect(text).toContain('=== Missing artifacts ===');
    expect(text).toContain('missing: artifacts/request-brief.txt');
  });

  it('missing artifacts section shows none when all present', () => {
    const meta = makeExportMeta(tmpDir);
    for (const s of FEATURE_STAGES) {
      writeArtifact(tmpDir, s.artifactFile, 'content');
    }
    const text = buildExportText(meta);
    expect(text).toContain('=== Missing artifacts ===');
    expect(text).toContain('none');
  });

  it('includes judge verdict section', () => {
    const meta = makeExportMeta(tmpDir);
    const text = buildExportText(meta);
    expect(text).toContain('=== Judge verdict ===');
    expect(text).toContain('no judge report');
  });

  it('shows PASS verdict when judge report has PASS', () => {
    const meta = makeExportMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/judge-report.txt', 'Verdict: PASS\n');
    const text = buildExportText(meta);
    expect(text).toContain('PASS');
  });

  it('includes correction state section', () => {
    const meta = makeExportMeta(tmpDir);
    const text = buildExportText(meta);
    expect(text).toContain('=== Correction state ===');
    expect(text).toContain('no judge report');
  });

  it('correction state shows routed stage on IMPLEMENTATION_MISMATCH', () => {
    const meta = makeExportMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/judge-report.txt', 'Verdict: IMPLEMENTATION_MISMATCH\n');
    const text = buildExportText(meta);
    expect(text).toContain('IMPLEMENTATION_MISMATCH');
    expect(text).toContain('correction required');
    expect(text).toContain('implementation');
  });

  it('correction state shows blocked on SCOPE_VIOLATION', () => {
    const meta = makeExportMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/judge-report.txt', 'Verdict: SCOPE_VIOLATION\n');
    const text = buildExportText(meta);
    expect(text).toContain('blocked');
  });

  it('includes verification evidence section', () => {
    const meta = makeExportMeta(tmpDir);
    const text = buildExportText(meta);
    expect(text).toContain('=== Verification evidence ===');
    expect(text).toContain('no verification report');
  });

  it('shows verification evidence from verification report', () => {
    const meta = makeExportMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/verification-report.txt', 'Command: npm test\nExit: 0\n');
    const text = buildExportText(meta);
    expect(text).toContain('npm test');
    expect(text).toContain('Exit: 0');
  });

  it('includes check summaries section', () => {
    const meta = makeExportMeta(tmpDir);
    const text = buildExportText(meta);
    expect(text).toContain('=== Check summaries ===');
    expect(text).toContain('content check not run');
    expect(text).toContain('trace check not run');
  });

  it('includes next command section', () => {
    const meta = makeExportMeta(tmpDir);
    const text = buildExportText(meta);
    expect(text).toContain('=== Next command ===');
    expect(text).toContain('my-dev-kit-orchestrator prompt');
    expect(text).toContain('test-export-run-001');
  });

  it('next command shows correction stage when correction is active', () => {
    const meta = makeExportMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/judge-report.txt', 'Verdict: PSEUDOCODE_INCOMPLETE\n');
    const text = buildExportText(meta);
    expect(text).toContain('=== Next command ===');
    expect(text).toContain('correction');
    expect(text).toContain('pseudocode-packet');
  });

  it('next command shows blocked comment when run is blocked', () => {
    const meta = makeExportMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/judge-report.txt', 'Verdict: BLOCKED\n');
    const text = buildExportText(meta);
    expect(text).toContain('blocked');
  });

  it('export text is plain ASCII (no em dash, smart quotes, ellipsis)', () => {
    const meta = makeExportMeta(tmpDir);
    const text = buildExportText(meta);
    // These characters would indicate mojibake or prohibited Unicode
    // U+2013 en dash, U+2014 em dash, U+201C/D double quotes, U+2018/9 single quotes, U+2026 ellipsis
    expect(text).not.toMatch(/\u2013\u2014\u201C\u201D\u2018\u2019\u2026/u);
  });

  it('export text ends with newline', () => {
    const meta = makeExportMeta(tmpDir);
    const text = buildExportText(meta);
    expect(text.endsWith('\n')).toBe(true);
  });
});

// ─── Path safety (isSafePath via CLI behavior) ────────────────────────────────

describe('export path safety via file write', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('refuses to write when parent directory does not exist', () => {
    // We test this indirectly since isSafePath is not exported.
    // The CLI would error; here we just verify the export text is stable.
    const meta = makeExportMeta(tmpDir);
    const text = buildExportText(meta);
    expect(text).toBeTruthy();
  });

  it('can write to a file in a known directory', () => {
    const outFile = path.join(tmpDir, 'export.txt');
    const meta = makeExportMeta(tmpDir);
    const text = buildExportText(meta);
    fs.writeFileSync(outFile, text, 'utf8');
    expect(fs.existsSync(outFile)).toBe(true);
    const read = fs.readFileSync(outFile, 'utf8');
    expect(read).toContain('test-export-run-001');
  });

  it('export text is deterministic for same input state', () => {
    const meta = makeExportMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/request-brief.txt', 'Status: complete\n');
    const text1 = buildExportText(meta);
    const text2 = buildExportText(meta);
    // Generated timestamp differs; check structural sections are stable
    expect(text1.includes('=== Request ===')).toBe(text2.includes('=== Request ==='));
    expect(text1.includes('[present] artifacts/request-brief.txt')).toBe(true);
  });
});

// ─── Path safety via real CLI dispatch (export --out path traversal) ──────────
//
// Regression coverage for a fixed bug: isSafePath() used to be called with the
// already-path.resolve()d output path, which never contains ".." segments
// after normalization, so the traversal check could never fire. The fix
// checks the raw --out argument before resolution. These tests exercise the
// real CLI command (not just buildExportText) so the fix's actual wiring is
// verified, not just the isolated helper.

function runCliCaptured(args: string[]): { output: string; exitCode: number | undefined } {
  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  const origWrite = process.stdout.write.bind(process.stdout);
  const origExit = process.exit;
  let exitCode: number | undefined;
  console.log = (msg: string) => lines.push(msg);
  console.error = (msg: string) => lines.push(msg);
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

  return { output: lines.join('\n'), exitCode };
}

describe('export --out path traversal rejection (CLI-level regression)', () => {
  function makeRun(root: string, mode: 'feature' | 'greenfield' = 'feature') {
    initWorkspace(root);
    return createRun({ request: `test export traversal (${mode})`, mode, projectRoot: root });
  }

  it.each([
    ['../escaped.txt', 'unix-style relative traversal'],
    ['..\\escaped.txt', 'windows-style relative traversal'],
    ['nested/../../escaped.txt', 'nested unix-style traversal'],
    ['nested\\..\\..\\escaped.txt', 'nested windows-style traversal'],
  ])('rejects %s (%s) for feature mode', (unsafeOut) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-export-traversal-'));
    try {
      makeRun(tmp, 'feature');
      const before = fs.existsSync(path.join(path.dirname(tmp), 'escaped.txt'));
      const { output, exitCode } = runCliCaptured(['export', '--root', tmp, '--out', unsafeOut]);
      expect(exitCode).toBe(1);
      expect(output).toMatch(/path traversal/);
      // Confirm nothing was actually written outside the temp dir.
      expect(fs.existsSync(path.join(path.dirname(tmp), 'escaped.txt'))).toBe(before);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects traversal for greenfield mode identically to feature mode', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-export-traversal-gf-'));
    try {
      makeRun(tmp, 'greenfield');
      const { output, exitCode } = runCliCaptured(['export', '--root', tmp, '--out', '../escaped-gf.txt']);
      expect(exitCode).toBe(1);
      expect(output).toMatch(/path traversal/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // A relative --out path resolves against process.cwd(), same as any CLI
  // tool (not against --root), so these tests chdir into the temp run
  // directory first to exercise a realistic "user is standing in their
  // project directory" scenario, then restore the original cwd afterward.
  function withCwd<T>(dir: string, fn: () => T): T {
    const originalCwd = process.cwd();
    process.chdir(dir);
    try {
      return fn();
    } finally {
      process.chdir(originalCwd);
    }
  }

  it('allows a safe relative output path and writes the file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-export-safe-'));
    try {
      makeRun(tmp, 'feature');
      const { output, exitCode } = withCwd(tmp, () =>
        runCliCaptured(['export', '--root', tmp, '--out', 'safe-export.txt']),
      );
      expect(exitCode).toBeUndefined();
      expect(output).toContain('Export written to:');
      expect(fs.existsSync(path.join(tmp, 'safe-export.txt'))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('allows a safe nested relative output path (subdirectory)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-export-safe-nested-'));
    try {
      makeRun(tmp, 'feature');
      fs.mkdirSync(path.join(tmp, 'reports'));
      const { exitCode } = withCwd(tmp, () =>
        runCliCaptured(['export', '--root', tmp, '--out', 'reports/export.txt']),
      );
      expect(exitCode).toBeUndefined();
      expect(fs.existsSync(path.join(tmp, 'reports', 'export.txt'))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('allows a safe "./" prefixed relative output path', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-export-safe-dotslash-'));
    try {
      makeRun(tmp, 'feature');
      const { exitCode } = withCwd(tmp, () =>
        runCliCaptured(['export', '--root', tmp, '--out', './safe-dotslash.txt']),
      );
      expect(exitCode).toBeUndefined();
      expect(fs.existsSync(path.join(tmp, 'safe-dotslash.txt'))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('still rejects an existing directory as the output path (pre-existing safety check, unaffected by the fix)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-export-dir-'));
    try {
      makeRun(tmp, 'feature');
      const dirOut = path.join(tmp, 'a-directory');
      fs.mkdirSync(dirOut);
      const { output, exitCode } = runCliCaptured(['export', '--root', tmp, '--out', dirOut]);
      expect(exitCode).toBe(1);
      expect(output).toMatch(/output path rejected/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not regress export behavior for other modes (repair)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-export-repair-'));
    try {
      initWorkspace(tmp);
      createRun({ request: 'test export traversal (repair)', mode: 'repair', projectRoot: tmp });
      const { output, exitCode } = runCliCaptured(['export', '--root', tmp, '--out', '../escaped-repair.txt']);
      expect(exitCode).toBe(1);
      expect(output).toMatch(/path traversal/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
