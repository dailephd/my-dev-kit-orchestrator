import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun, loadRun } from '../src/run';
import { resolveArtifactState, readArtifactStateFile, getArtifactStatePath, setArtifactManualState } from '../src/artifactLifecycle';
import { getNextStageWithLifecycle } from '../src/stageDetector';
import { generateStagePrompt } from '../src/promptGenerator';
import { parseWorkflowInstructionPacket } from '../src/instructions/workflowInstructionPacketSerialization';
import { makeReadyRunFolder } from './readyContextTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-batch5-compat-'));
}

describe('Batch 5 lifecycle isolation', () => {
  it('context readiness does not change resolveArtifactState() for a native artifact', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const stateFile = readArtifactStateFile(meta.runFolder);
      const before = resolveArtifactState(meta.runFolder, 'artifacts/implementation-report.txt', meta.stages, stateFile);
      makeReadyRunFolder(meta.runFolder, 'feature');
      const after = resolveArtifactState(meta.runFolder, 'artifacts/implementation-report.txt', meta.stages, stateFile);
      expect(after).toBe(before);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('deleting context files does not change artifact-state.json', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const statePath = getArtifactStatePath(meta.runFolder);
      const before = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8') : undefined;
      fs.rmSync(path.join(meta.runFolder, 'artifacts', 'implementation-context-packet.txt'));
      const after = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8') : undefined;
      expect(after).toBe(before);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('mark does not list context files as manageable artifacts', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const artifactFiles = meta.stages.map((s) => s.artifactFile);
      expect(artifactFiles).not.toContain('artifacts/implementation-context-packet.txt');
      expect(artifactFiles).not.toContain('artifacts/test-context-packet.txt');
      // setArtifactManualState operates on stage artifact files only -- prove
      // context files are not among the stages it could target.
      expect(() =>
        setArtifactManualState(meta.runFolder, 'artifacts/implementation-context-packet.txt', 'blocked'),
      ).not.toThrow(); // it may write an arbitrary key, but that key is never read by lifecycle resolution for native stages
      const stateFile = readArtifactStateFile(meta.runFolder);
      const state = resolveArtifactState(meta.runFolder, 'artifacts/implementation-report.txt', meta.stages, stateFile);
      expect(state).not.toBe('blocked');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('next-stage selection is unaffected by context readiness', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const stateFile = readArtifactStateFile(meta.runFolder);
      const before = getNextStageWithLifecycle(meta, stateFile);
      makeReadyRunFolder(meta.runFolder, 'feature');
      const after = getNextStageWithLifecycle(meta, stateFile);
      expect(after?.name).toBe(before?.name);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('Batch 5 packet-sidecar isolation', () => {
  it('sidecars contain no repository-evidence or readiness data', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const implStage = meta.stages.find((s) => s.name === 'implementation')!;
      const sidecarPath = path.join(meta.runFolder, implStage.promptFile.replace(/\.prompt\.txt$/, '.instruction-packet.json'));
      const text = fs.readFileSync(sidecarPath, 'utf8');
      expect(text).not.toContain('repositoryEvidenceReference');
      expect(text).not.toContain('repositoryContextReadiness');
      expect(text).not.toContain('readiness');
      const parsed = parseWorkflowInstructionPacket(text);
      expect(parsed.ok).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('sidecar count remains equal to native stage count', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const sidecars = fs
        .readdirSync(path.join(meta.runFolder, 'prompts'))
        .filter((f) => f.endsWith('.instruction-packet.json'));
      expect(sidecars).toHaveLength(meta.stages.length);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('Batch 5 old-run compatibility', () => {
  it.each(['feature', 'test', 'extraction', 'greenfield'] as const)(
    '%s: an old run with no context files remains loadable and generates prompts without error',
    (mode) => {
      const tmp = makeTempDir();
      try {
        const meta = createRun({ request: 'legacy', mode, projectRoot: tmp });
        for (const rel of [
          'artifacts/implementation-context-packet.txt',
          'reports/implementation-context-retrieval-report.txt',
          'artifacts/test-context-packet.txt',
          'reports/test-context-retrieval-report.txt',
        ]) {
          const p = path.join(meta.runFolder, rel);
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        const reloaded = loadRun(meta.runFolder);
        expect(() => generateStagePrompt(reloaded, meta.stages[0].name)).not.toThrow();
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
  );
});
