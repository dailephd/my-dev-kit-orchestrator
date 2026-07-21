// Shared helper for the Batch 4 prompt-hash compatibility fixtures. Not a
// test file itself (no .test.ts suffix, so Jest's testMatch skips it).

import * as crypto from 'crypto';
import { generateStagePrompt } from '../src/promptGenerator';
import { RunMetadata } from '../src/run';
import { getWorkflow } from '../src/workflows';
import { VALID_MODES, WorkflowMode } from '../src/types';
import { makeWorkflowId, makeStageId } from '../src/instructions/catalogIds';

export interface PromptHashEntry {
  mode: string;
  stage: string;
  workflowId: string;
  stageId: string;
  promptFile: string;
  normalizedSha256: string;
}

export interface PromptHashFixture {
  baselineCommit: string;
  description: string;
  entryCount: number;
  entries: PromptHashEntry[];
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function makeFakeRun(mode: WorkflowMode): RunMetadata {
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

// Normalizes only run ID, project root, run folder, and source/target repo
// roots out of a generated prompt before hashing (AGENTS.txt Batch 4 section
// 19.3) -- instruction text, headings, artifact references, and return
// formats are left untouched so real content changes are still detected.
function normalize(prompt: string, meta: RunMetadata): string {
  let text = prompt;
  text = text.split(meta.runFolder).join('<RUN_FOLDER>');
  text = text.split(meta.runId).join('<RUN_ID>');
  text = text.split(meta.projectRoot).join('<PROJECT_ROOT>');
  if (meta.sourceRepoRoot) text = text.split(meta.sourceRepoRoot).join('<SOURCE_REPO_ROOT>');
  if (meta.targetRepoRoot) text = text.split(meta.targetRepoRoot).join('<TARGET_REPO_ROOT>');
  return text;
}

export function computePromptHashEntries(): PromptHashEntry[] {
  const entries: PromptHashEntry[] = [];
  for (const mode of VALID_MODES) {
    const meta = makeFakeRun(mode);
    for (const stage of meta.stages) {
      const prompt = generateStagePrompt(meta, stage.name);
      const normalized = normalize(prompt, meta);
      entries.push({
        mode,
        stage: stage.name,
        workflowId: makeWorkflowId(mode),
        stageId: makeStageId(mode, stage.name),
        promptFile: stage.promptFile,
        normalizedSha256: sha256(normalized),
      });
    }
  }
  entries.sort((a, b) => (a.stageId < b.stageId ? -1 : a.stageId > b.stageId ? 1 : 0));
  return entries;
}
