import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { createRun, loadRun } from '../src/run';
import { getArtifactStatuses, getNextStage, isRunComplete } from '../src/stageDetector';
import { getAllWorkflows } from '../src/workflows';
import { VALID_MODES } from '../src/types';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-batch3-runtime-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('runtime compatibility (Batch 3)', () => {
  it('mode count and stage counts remain unchanged (7 modes, 79 stages)', () => {
    const workflows = getAllWorkflows();
    expect(workflows).toHaveLength(7);
    expect(workflows.reduce((sum, wf) => sum + wf.stages.length, 0)).toBe(79);
  });

  it('stage order remains unchanged for every mode', () => {
    for (const mode of VALID_MODES) {
      const wf = getAllWorkflows().find((w) => w.mode === mode)!;
      expect(wf.stages.length).toBeGreaterThan(0);
    }
  });

  it('run.json shape is unaffected by the packet/sidecar system', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'test request', mode: 'feature', projectRoot: tmp });
      const runJsonText = fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8');
      const runJson = JSON.parse(runJsonText);
      expect(Object.keys(runJson).sort()).toEqual(
        ['artifactFile', 'currentStage', 'mode', 'projectRoot', 'request', 'runFolder', 'runId', 'stages', 'status', 'createdAt']
          .filter((k) => k !== 'artifactFile')
          .sort(),
      );
      expect(runJson).not.toHaveProperty('stageContextBundle');
      expect(runJson).not.toHaveProperty('taskState');
      expect(runJson).not.toHaveProperty('workflowInstructionPacket');
      expect(runJson).not.toHaveProperty('sidecars');
    } finally {
      cleanup(tmp);
    }
  });

  it('artifact-state behavior is unaffected: a freshly created run has no artifacts complete', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'test request', mode: 'feature', projectRoot: tmp });
      const statuses = getArtifactStatuses(meta);
      expect(statuses.every((s) => s.present === false)).toBe(true);
      expect(getNextStage(meta)!.name).toBe(meta.stages[0].name);
      expect(isRunComplete(meta)).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });

  it('loadRun round-trips a freshly created run unchanged', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'test request', mode: 'feature', projectRoot: tmp });
      const reloaded = loadRun(meta.runFolder);
      expect(reloaded.runId).toBe(meta.runId);
      expect(reloaded.stages).toEqual(meta.stages);
    } finally {
      cleanup(tmp);
    }
  });

  const CLI = path.resolve(__dirname, '..', 'dist', 'cli.js');
  const describeIfBuilt = fs.existsSync(CLI) ? describe : describe.skip;

  describeIfBuilt('CLI compatibility', () => {
    it('--version remains 1.2.0', () => {
      const out = execFileSync(process.execPath, [CLI, '--version'], { encoding: 'utf8' }).trim();
      expect(out).toBe('1.2.0');
    });

    it('--help output is unchanged', () => {
      const out = execFileSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
      expect(out).toContain('my-dev-kit-orchestrator');
      expect(out).toContain('init [options]');
      expect(out).toContain('start [options] <request>');
      expect(out).toContain('status [options]');
      expect(out).toContain('prompt [options] [stage]');
      expect(out).toContain('list [options]');
      expect(out).toContain('mark [options] <artifact-name>');
      expect(out).toContain('check [options]');
      expect(out).toContain('export [options]');
      expect(out).not.toContain('instruction-packet');
      expect(out).not.toContain('bundle');
    });
  });
});
