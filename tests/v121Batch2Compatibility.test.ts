import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { generateStagePrompt } from '../src/promptGenerator';
import { RunMetadata } from '../src/run';
import { getWorkflow } from '../src/workflows';
import { VALID_MODES } from '../src/types';

interface PromptHashEntry {
  mode: string;
  stage: string;
  promptFile: string;
  hash: string;
}

interface PromptHashFixture {
  baselineCommit: string;
  packageVersion: string;
  hashAlgorithm: string;
  entries: PromptHashEntry[];
}

function loadFixture(): PromptHashFixture {
  const fixturePath = path.join(__dirname, 'fixtures', 'v120-baseline', 'prompt-hashes.json');
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as PromptHashFixture;
}

function makeFakeRun(mode: typeof VALID_MODES[number]): RunMetadata {
  const workflow = getWorkflow(mode);
  return {
    runId: '20240101T120000-baseline-run',
    mode,
    request: 'baseline compatibility request',
    projectRoot: '/fake/project',
    runFolder: '/fake/project/.my-dev-kit-orchestrator/runs/20240101T120000-baseline-run',
    createdAt: '2024-01-01T12:00:00.000Z',
    currentStage: workflow.stages[0].name,
    stages: workflow.stages,
    status: 'created',
    ...(mode === 'extraction' ? { sourceRepoRoot: '/fake/source', targetRepoRoot: '/fake/target' } : {}),
  };
}

function currentHash(mode: typeof VALID_MODES[number], stageName: string): string {
  const meta = makeFakeRun(mode);
  const prompt = generateStagePrompt(meta, stageName);
  return crypto.createHash('sha256').update(prompt, 'utf8').digest('hex');
}

describe('v1.2.0 prompt compatibility (Batch 2 baseline fixture)', () => {
  const fixture = loadFixture();

  it('fixture covers all 79 mode/stage prompts', () => {
    expect(fixture.entries).toHaveLength(79);
  });

  it('feature/implementation intentionally changed from its v1.2.0 baseline hash (Batch 2 representative integration)', () => {
    const entry = fixture.entries.find((e) => e.mode === 'feature' && e.stage === 'implementation')!;
    expect(currentHash('feature', 'implementation')).not.toBe(entry.hash);
  });

  // Batch 3 migrates every remaining native stage to packet-backed rendering
  // (see tests/v121Batch3PromptCompatibility.test.ts, which enforces the
  // narrower structural compatibility -- header/inputs/output artifact/output
  // file/artifact template -- that must still hold). This fixture now only
  // proves it still faithfully records the original v1.2.0 output; it is no
  // longer used to assert byte-identical prompts for non-migrated stages,
  // because after Batch 3 there are no non-migrated native stages left.
  // scaffold-plan renders via src/greenfield/scaffold/renderScaffoldPrompt.ts
  // and remains on legacy rendering -- the one documented exception to full
  // migration. scaffold-implementation (same file) was intentionally
  // modified in v1.3.0 Batch 4 to add the new structured evidence template
  // (Profile / Files changed / Commands run) that evaluateGreenfieldReadiness()
  // consumes, so it is no longer byte-identical to its v1.2.0 baseline and
  // is removed from this exception set below.
  const DOCUMENTED_LEGACY_EXCEPTIONS = new Set(['greenfield:scaffold-plan']);

  it('every stage prompt has migrated away from its v1.2.0 baseline hash, except the documented legacy exceptions', () => {
    const stillIdentical: string[] = [];
    for (const entry of fixture.entries) {
      const key = `${entry.mode}:${entry.stage}`;
      if (DOCUMENTED_LEGACY_EXCEPTIONS.has(key)) continue;
      const hash = currentHash(entry.mode as typeof VALID_MODES[number], entry.stage);
      if (hash === entry.hash) stillIdentical.push(key);
    }
    expect(stillIdentical).toEqual([]);
  });

  it('the documented legacy exceptions remain byte-identical to their v1.2.0 baseline (unmigrated, on purpose)', () => {
    for (const key of DOCUMENTED_LEGACY_EXCEPTIONS) {
      const [mode, stage] = key.split(':');
      const entry = fixture.entries.find((e) => e.mode === mode && e.stage === stage)!;
      expect(currentHash(mode as typeof VALID_MODES[number], stage)).toBe(entry.hash);
    }
  });

  it('prompt filenames remain unchanged for every mode', () => {
    for (const mode of VALID_MODES) {
      const workflow = getWorkflow(mode);
      for (const stage of workflow.stages) {
        const entry = fixture.entries.find((e) => e.mode === mode && e.stage === stage.name);
        expect(entry).toBeDefined();
        expect(stage.promptFile).toBe(entry!.promptFile);
      }
    }
  });

  it('stage counts per mode remain unchanged', () => {
    for (const mode of VALID_MODES) {
      const workflow = getWorkflow(mode);
      const expectedCount = fixture.entries.filter((e) => e.mode === mode).length;
      expect(workflow.stages.length).toBe(expectedCount);
    }
  });
});
