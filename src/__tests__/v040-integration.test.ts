import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createProgram } from '../program';
import { createRun } from '../run';
import { initWorkspace } from '../workspace';
import { setArtifactManualState } from '../artifactLifecycle';
import { readCheckResults } from '../promptChecker';
import { getWorkflow } from '../workflows';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-v040-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeArtifact(runFolder: string, artifactFile: string, content: string): void {
  const full = path.join(runFolder, artifactFile);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function runCheck(
  args: string[],
): { output: string; exitCode: number | undefined } {
  let output = '';
  let exitCode: number | undefined;
  const origLog = console.log;
  console.log = (msg: string) => { output += msg + '\n'; };
  const origExit = process.exit;
  process.exit = ((code?: number) => {
    exitCode = code;
    throw new Error('exit');
  }) as never;
  try {
    createProgram().parse(['node', 'cli', ...args]);
  } catch (e) {
    if ((e as Error).message !== 'exit') throw e;
  } finally {
    console.log = origLog;
    process.exit = origExit;
  }
  return { output, exitCode };
}

const FULL_REQUEST_BRIEF =
  'Artifact: RequestBrief\n' +
  'Workflow mode: feature\n' +
  'Original request: full integration test\n' +
  'Requested change: add check command\n' +
  'Target area: CLI\n' +
  'User-visible or external behavior: visible output\n' +
  'Constraints: none\n' +
  'Non-goals: nothing\n' +
  'Success criteria: all checks pass\n' +
  'Ambiguity or missing information: none\n' +
  'Expected next stage: architecture-context\n' +
  'Status: complete\n';

// ─── Feature run: check with no artifacts shows all as fail ──────────────────

describe('v0.4.0 integration - check with no artifacts', () => {
  it('shows MISSING_FILE for all artifacts when none exist', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'integration test run', mode: 'feature', projectRoot: tmp });
      const { output } = runCheck(['check', '--root', tmp]);
      const featureStages = getWorkflow('feature').stages;
      expect(output).toContain('Check results for run:');
      expect(output.match(/MISSING_FILE/g)?.length).toBe(featureStages.length);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Feature run: check shows pass for well-formed request-brief ─────────────

describe('v0.4.0 integration - check shows pass for complete artifact', () => {
  it('shows [pass] for request-brief with all required sections', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'integration test pass', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt', FULL_REQUEST_BRIEF);
      const { output } = runCheck(['check', '--artifact', 'request-brief', '--root', tmp]);
      expect(output).toContain('[pass]');
      expect(output).not.toContain('MISSING_SECTION');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Feature run: check shows fail for missing required section ──────────────

describe('v0.4.0 integration - check shows fail for missing section', () => {
  it('shows MISSING_SECTION fail when a required section is absent', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'integration test section', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt',
        'Artifact: RequestBrief\nWorkflow mode: feature\nStatus: complete\n');
      const { output, exitCode } = runCheck(['check', '--artifact', 'request-brief', '--root', tmp]);
      expect(output).toContain('MISSING_SECTION');
      expect(output).toContain('[fail]');
      expect(exitCode).toBe(1);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Feature run: placeholder artifact triggers warn ─────────────────────────

describe('v0.4.0 integration - placeholder content warn', () => {
  it('shows PLACEHOLDER_CONTENT warn for placeholder-only artifact', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'integration placeholder', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/behavior-model.txt', 'TODO fill this in');
      const { output } = runCheck(['check', '--artifact', 'behavior-model', '--root', tmp]);
      expect(output).toContain('PLACEHOLDER_CONTENT');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── check --prompts passes for all generated prompt files from start ─────────

describe('v0.4.0 integration - check --prompts passes for generated prompts', () => {
  it('shows all prompts as pass after createRun generates them', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'integration prompt check', mode: 'feature', projectRoot: tmp });
      const { output } = runCheck(['check', '--prompts', '--root', tmp]);
      expect(output).toContain('Prompts:');
      expect(output).not.toContain('[fail]');
      expect(output.match(/\[pass\]/g)?.length).toBeGreaterThan(0);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── check --strict exits 1 when any warn is present ─────────────────────────

describe('v0.4.0 integration - check --strict', () => {
  it('exits 1 when any warn is present with --strict', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'integration strict', mode: 'feature', projectRoot: tmp });
      // Write a short artifact that will trigger PLACEHOLDER_CONTENT warn
      writeArtifact(meta.runFolder, 'artifacts/behavior-model.txt',
        'Artifact: BehaviorModel\nWorkflow mode: feature\nStatus: complete\n' + 'A'.repeat(100));
      runCheck(['check', '--artifact', 'behavior-model', '--strict', '--root', tmp]);
      // artifact above has no PLACEHOLDER_CONTENT (>80 chars, no markers)
      // use an artifact that definitely has a warn from EMPTY_SECTION
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt',
        FULL_REQUEST_BRIEF.replace('full integration test', ''));
      const { exitCode: exitCode2 } = runCheck(['check', '--artifact', 'request-brief', '--strict', '--root', tmp]);
      // EMPTY_SECTION warn should trigger exit 1 with --strict
      expect(exitCode2).toBe(1);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── STATUS_MISMATCH warn when artifact says complete but state says blocked ──

describe('v0.4.0 integration - STATUS_MISMATCH', () => {
  it('shows STATUS_MISMATCH warn when artifact Status says complete but lifecycle says blocked', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'integration mismatch', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt',
        FULL_REQUEST_BRIEF);
      setArtifactManualState(meta.runFolder, 'artifacts/request-brief.txt', 'blocked', {
        reason: 'test mismatch',
      });
      const { output } = runCheck(['check', '--artifact', 'request-brief', '--root', tmp]);
      expect(output).toContain('STATUS_MISMATCH');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Extraction run: lifecycle and check work without errors ─────────────────

describe('v0.4.0 integration - extraction mode', () => {
  it('extraction run lifecycle and check work without errors', () => {
    const tmp = makeTempDir();
    try {
      const sourceRoot = path.join(tmp, 'source');
      const targetRoot = path.join(tmp, 'target');
      fs.mkdirSync(sourceRoot, { recursive: true });
      fs.mkdirSync(targetRoot, { recursive: true });
      initWorkspace(targetRoot);
      createRun({
        request: 'extraction integration',
        mode: 'extraction',
        projectRoot: targetRoot,
        sourceRepoRoot: sourceRoot,
        targetRepoRoot: targetRoot,
      });
      const { output } = runCheck(['check', '--root', targetRoot]);
      expect(output).toContain('Check results for run:');
      expect(output).toContain('MISSING_FILE');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── v0.3.0 lifecycle still works alongside check results ────────────────────

describe('v0.4.0 integration - v0.3.0 lifecycle preserved', () => {
  it('lifecycle states from v0.3.0 still correct alongside check results', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'lifecycle preserved', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt', FULL_REQUEST_BRIEF);
      setArtifactManualState(meta.runFolder, 'artifacts/request-brief.txt', 'blocked', {
        reason: 'waiting for approval',
      });

      let statusOutput = '';
      const origLog = console.log;
      console.log = (msg: string) => { statusOutput += msg + '\n'; };
      try {
        createProgram().parse(['node', 'cli', 'status', '--root', tmp]);
      } finally {
        console.log = origLog;
      }

      expect(statusOutput).toContain('[blocked');
      expect(statusOutput).toContain('waiting for approval');
      expect(statusOutput).toContain('Content check:');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── artifact-check-results.json persisted and read by status ────────────────

describe('v0.4.0 integration - check results persistence', () => {
  it('artifact-check-results.json is created and read by status', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'persistence integration', mode: 'feature', projectRoot: tmp });

      runCheck(['check', '--root', tmp]);

      const results = readCheckResults(meta.runFolder);
      expect(results).not.toBeNull();
      expect(results?.version).toBe('1');
      expect(results?.artifactResults.length).toBeGreaterThan(0);
      expect(results?.promptResults.length).toBeGreaterThan(0);
    } finally {
      cleanup(tmp);
    }
  });
});

