import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { checkPrompt, checkAllPrompts } from '../promptChecker';
import { getWorkflow } from '../workflows';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-pc-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeRunFolder(tmp: string): string {
  const rf = path.join(tmp, 'run-test');
  fs.mkdirSync(path.join(rf, 'prompts'), { recursive: true });
  return rf;
}

function writePrompt(runFolder: string, promptFile: string, content: string): void {
  const full = path.join(runFolder, promptFile);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

const WELL_FORMED_PROMPT = `Stage: request-brief
Workflow mode: feature
Run ID: test-run-001
Project root: /tmp/project
Run folder: /tmp/project/.my-dev-kit-orchestrator/runs/test-run-001

Inputs:
- run-folder/00-request.txt

Task:
Produce the RequestBrief artifact.

Required output artifact: RequestBrief
Output file: /tmp/project/.my-dev-kit-orchestrator/runs/test-run-001/artifacts/request-brief.txt

Stop conditions:
- do not write code
`;

// ─── checkPrompt - PROMPT_MISSING_FILE ────────────────────────────────────────

describe('checkPrompt - PROMPT_MISSING_FILE', () => {
  it('returns fail when prompt file does not exist', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      const result = checkPrompt(rf, 'prompts/01-request-brief.prompt.txt', 'request-brief');
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.code === 'PROMPT_MISSING_FILE' && i.severity === 'fail')).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── checkPrompt - PROMPT_EMPTY ───────────────────────────────────────────────

describe('checkPrompt - PROMPT_EMPTY', () => {
  it('returns fail when prompt file is under minimum length', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writePrompt(rf, 'prompts/01-request-brief.prompt.txt', 'short');
      const result = checkPrompt(rf, 'prompts/01-request-brief.prompt.txt', 'request-brief');
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.code === 'PROMPT_EMPTY' && i.severity === 'fail')).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── checkPrompt - PROMPT_MISSING_STAGE_HEADER ───────────────────────────────

describe('checkPrompt - PROMPT_MISSING_STAGE_HEADER', () => {
  it('returns fail when prompt has no Stage: line', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      const content =
        'Workflow mode: feature\n\n' +
        'Task:\nProduce artifact.\n\n' +
        'Required output artifact: RequestBrief\n' +
        'A'.repeat(100);
      writePrompt(rf, 'prompts/01-request-brief.prompt.txt', content);
      const result = checkPrompt(rf, 'prompts/01-request-brief.prompt.txt', 'request-brief');
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.code === 'PROMPT_MISSING_STAGE_HEADER' && i.severity === 'fail')).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── checkPrompt - PROMPT_MISSING_TASK_SECTION ───────────────────────────────

describe('checkPrompt - PROMPT_MISSING_TASK_SECTION', () => {
  it('returns warn when prompt has no Task: section', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      const content =
        'Stage: request-brief\n' +
        'Workflow mode: feature\n\n' +
        'Required output artifact: RequestBrief\n' +
        'A'.repeat(100);
      writePrompt(rf, 'prompts/01-request-brief.prompt.txt', content);
      const result = checkPrompt(rf, 'prompts/01-request-brief.prompt.txt', 'request-brief');
      const issue = result.issues.find((i) => i.code === 'PROMPT_MISSING_TASK_SECTION');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('warn');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── checkPrompt - PROMPT_MISSING_OUTPUT_ARTIFACT ────────────────────────────

describe('checkPrompt - PROMPT_MISSING_OUTPUT_ARTIFACT', () => {
  it('returns warn when prompt has no Required output artifact: line', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      const content =
        'Stage: request-brief\n' +
        'Workflow mode: feature\n\n' +
        'Task:\nProduce artifact.\n' +
        'A'.repeat(100);
      writePrompt(rf, 'prompts/01-request-brief.prompt.txt', content);
      const result = checkPrompt(rf, 'prompts/01-request-brief.prompt.txt', 'request-brief');
      const issue = result.issues.find((i) => i.code === 'PROMPT_MISSING_OUTPUT_ARTIFACT');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('warn');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── checkPrompt - well-formed prompt ────────────────────────────────────────

describe('checkPrompt - well-formed prompt', () => {
  it('returns pass for a well-formed generated prompt', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writePrompt(rf, 'prompts/01-request-brief.prompt.txt', WELL_FORMED_PROMPT);
      const result = checkPrompt(rf, 'prompts/01-request-brief.prompt.txt', 'request-brief');
      expect(result.passed).toBe(true);
      expect(result.issues.filter((i) => i.severity === 'fail').length).toBe(0);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── checkAllPrompts ──────────────────────────────────────────────────────────

describe('checkAllPrompts', () => {
  it('returns one result per stage', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      const featureStages = getWorkflow('feature').stages;
      const meta = {
        runId: 'test-run',
        mode: 'feature' as const,
        request: 'test',
        projectRoot: tmp,
        runFolder: rf,
        createdAt: new Date().toISOString(),
        currentStage: 'request-brief',
        stages: featureStages,
        status: 'created' as const,
      };
      const results = checkAllPrompts(meta);
      expect(results.length).toBe(featureStages.length);
    } finally {
      cleanup(tmp);
    }
  });

  it('returns PROMPT_MISSING_FILE for all stages when no prompt files exist', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      const featureStages = getWorkflow('feature').stages;
      const meta = {
        runId: 'test-run',
        mode: 'feature' as const,
        request: 'test',
        projectRoot: tmp,
        runFolder: rf,
        createdAt: new Date().toISOString(),
        currentStage: 'request-brief',
        stages: featureStages,
        status: 'created' as const,
      };
      const results = checkAllPrompts(meta);
      expect(results.every((r) => r.issues.some((i) => i.code === 'PROMPT_MISSING_FILE'))).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });
});

