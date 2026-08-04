import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateStagePrompt } from '../src/promptGenerator';
import { RunMetadata } from '../src/run';
import { getWorkflow } from '../src/workflows';
import { makeReadyRunFolder } from './readyContextTestHelpers';

// Batch 5: implementation only renders its normal packet-backed prompt (the
// content these leakage checks exercise) when repository context is ready.
function makeFakeFeatureRun(): RunMetadata {
  const workflow = getWorkflow('feature');
  const runFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-leakage-'));
  makeReadyRunFolder(runFolder, 'feature');
  return {
    runId: '20240101T120000-test-run',
    mode: 'feature',
    request: 'test request',
    projectRoot: path.dirname(runFolder),
    runFolder,
    createdAt: '2024-01-01T12:00:00.000Z',
    currentStage: workflow.stages[0].name,
    stages: workflow.stages,
    status: 'created',
  };
}

describe('feature/implementation prompt leakage exclusions', () => {
  const prompt = generateStagePrompt(makeFakeFeatureRun(), 'implementation');
  const lower = prompt.toLowerCase();

  it.each([
    'npm publish',
    'npm version',
    'github release',
    'release branch',
    'publication authorization',
    'my-dev-kit-lab',
    'security:validate',
    'documentation recovery',
    'forensic documentation',
    'play store',
    'android release',
    'greenfield',
    'extraction',
    'source-to-target',
    'porting map',
  ])('does not contain "%s"', (phrase) => {
    expect(lower).not.toContain(phrase.toLowerCase());
  });

  it('does not instruct test-implementation-stage work', () => {
    expect(lower).not.toContain('write test files');
    expect(prompt).not.toContain('do not write test files in this stage');
    expect(prompt).not.toMatch(/test.?strategy.?packet must/i);
  });

  it('does not claim that verification or tests have already passed', () => {
    expect(prompt).not.toMatch(/verification.*passed/i);
    expect(prompt).not.toMatch(/tests.*passed/i);
  });

  it('may still state that later verification must run appropriate commands', () => {
    // This is part of the current stop-condition contract, not a leaked
    // verification-stage claim: it tells the agent not to *assert* success,
    // it does not claim success occurred.
    expect(prompt).toContain('do not claim verification success without command evidence');
  });
});
