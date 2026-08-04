import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { generateStagePrompt } from '../src/promptGenerator';
import { RunMetadata } from '../src/run';
import { getWorkflow } from '../src/workflows';
import { VALID_MODES } from '../src/types';
import { STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from '../src/instructions/stageRepositoryEvidenceRequirements';

// Batch 5: the 11 exact direct context-sensitive stages (implementation /
// test-implementation across applicable modes) now render a
// context-refresh-only prompt instead of their normal work prompt whenever
// required context is not ready -- see AGENTS.txt Batch 5 section 14.2. This
// fixture's fake runFolder ('/fake/project/...') never had real context
// files on disk even in Batch 3/4, so these 11 stages are always evaluated
// as "missing" and their structure intentionally diverges from the frozen
// Batch 3 baseline captured in prompt-structure.json (which predates this
// stop behavior and cannot be regenerated -- it is a forbidden file). Their
// structural compatibility for the *ready* rendering path is covered
// instead by tests/v121Batch5PromptCompatibility.test.ts, which populates a
// real, fully-ready run folder.
const DIRECT_CONTEXT_SENSITIVE_KEYS = new Set(
  STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.map((r) => {
    const [, mode, stage] = r.stageId.split('.');
    return `${mode}:${stage}`;
  }),
);

// v1.3.0 Batch 4: these four greenfield prompts' return-format templates
// were deliberately extended with the new structured evidence sections
// (Profile / Files changed / Commands run / Commands verified / per-doc-name
// sections) so evaluateGreenfieldReadiness() has a well-defined,
// machine-parseable encoding to consume -- see
// src/greenfield/readiness/. This is intentional, approved return-format
// drift, not a regression; the frozen prompt-structure.json baseline
// predates it and is not regenerated (same convention as the `final-report`
// exclusion below).
const BATCH_4_RETURN_FORMAT_CHANGED_KEYS = new Set([
  'greenfield:project-docs',
  'greenfield:scaffold-implementation',
  'greenfield:first-vertical-slice',
  'greenfield:verification',
  // v1.3.0 Batch 4 correction: scaffold-plan gained Profile/Target paths/
  // structured command sections so its persisted artifact can be parsed
  // back into a GreenfieldScaffoldPlan and actually validated.
  'greenfield:scaffold-plan',
]);

interface PromptStructureEntry {
  mode: string;
  stage: string;
  promptFile: string;
  artifactFile: string;
  additionalArtifactFiles: string[];
  normalizedHeaderHash: string;
  inputsBlockHash: string;
  requiredOutputArtifactLine: string;
  outputFileLine: string;
  returnFormatHash: string;
  baselinePromptHash: string;
}

interface PromptStructureFixture {
  baselineCommit: string;
  entries: PromptStructureEntry[];
}

function loadFixture(): PromptStructureFixture {
  const fixturePath = path.join(__dirname, 'fixtures', 'v121-packet-prompts', 'prompt-structure.json');
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as PromptStructureFixture;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
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

function extractLine(prompt: string, prefix: string): string {
  const match = new RegExp(`^${prefix}.*$`, 'm').exec(prompt);
  return match ? match[0] : '';
}

function currentStructure(mode: typeof VALID_MODES[number], stageName: string) {
  const meta = makeFakeRun(mode);
  const prompt = generateStagePrompt(meta, stageName);
  const header = prompt.split('\n\n')[0];
  const inputsIdx = prompt.indexOf('Inputs:');
  const inputsBlockRaw = inputsIdx === -1 ? '' : prompt.slice(inputsIdx);
  const inputsBlank = inputsBlockRaw.indexOf('\n\n');
  const inputsBlock = inputsBlank === -1 ? inputsBlockRaw : inputsBlockRaw.slice(0, inputsBlank);
  const returnFormatIdx = prompt.indexOf('Return format:');
  const returnFormatText = returnFormatIdx === -1 ? '' : prompt.slice(returnFormatIdx);

  return {
    normalizedHeaderHash: sha256(header),
    inputsBlockHash: sha256(inputsBlock),
    requiredOutputArtifactLine: extractLine(prompt, 'Required output artifact:'),
    outputFileLine: extractLine(prompt, 'Output file:'),
    returnFormatHash: sha256(returnFormatText),
  };
}

describe('v1.2.1 prompt structure compatibility (Batch 3)', () => {
  const fixture = loadFixture();

  it('fixture covers all 79 mode/stage prompts', () => {
    expect(fixture.entries).toHaveLength(79);
  });

  it('prompt filenames remain unchanged for every mode/stage', () => {
    for (const entry of fixture.entries) {
      const workflow = getWorkflow(entry.mode as typeof VALID_MODES[number]);
      const stage = workflow.stages.find((s) => s.name === entry.stage)!;
      expect(stage.promptFile).toBe(entry.promptFile);
    }
  });

  it('artifact filenames and additional artifacts remain unchanged for every mode/stage', () => {
    for (const entry of fixture.entries) {
      const workflow = getWorkflow(entry.mode as typeof VALID_MODES[number]);
      const stage = workflow.stages.find((s) => s.name === entry.stage)!;
      expect(stage.artifactFile).toBe(entry.artifactFile);
      expect(stage.additionalArtifactFiles ?? []).toEqual(entry.additionalArtifactFiles);
    }
  });

  it('header, input references, output artifact/file, and return format remain compatible for every non-direct-context stage', () => {
    const mismatches: Array<{ key: string; field: string }> = [];
    for (const entry of fixture.entries) {
      const key = `${entry.mode}:${entry.stage}`;
      if (DIRECT_CONTEXT_SENSITIVE_KEYS.has(key)) continue;
      // v1.2.3 Batch 3: final-report now also diverges from the frozen
      // baseline for this same fake-runFolder reason -- it only renders its
      // normal packet-backed prompt once FinalReportEligibility is true,
      // and this fixture's fake runFolder never has a real judge-report.txt.
      // See tests/correctedReadyReplay.test.ts for its normal rendering.
      if (entry.stage === 'final-report') continue;
      const current = currentStructure(entry.mode as typeof VALID_MODES[number], entry.stage);
      if (current.normalizedHeaderHash !== entry.normalizedHeaderHash) mismatches.push({ key, field: 'header' });
      if (current.inputsBlockHash !== entry.inputsBlockHash) mismatches.push({ key, field: 'inputs' });
      if (current.requiredOutputArtifactLine !== entry.requiredOutputArtifactLine)
        mismatches.push({ key, field: 'requiredOutputArtifactLine' });
      if (current.outputFileLine !== entry.outputFileLine) mismatches.push({ key, field: 'outputFileLine' });
      if (!BATCH_4_RETURN_FORMAT_CHANGED_KEYS.has(key) && current.returnFormatHash !== entry.returnFormatHash)
        mismatches.push({ key, field: 'returnFormat' });
    }
    expect(mismatches).toEqual([]);
  });
});
