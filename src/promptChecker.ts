import * as fs from 'fs';
import * as path from 'path';
import { CheckSeverity } from './artifactChecker';
import { RunMetadata } from './run';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PromptCheckIssue {
  code: string;
  severity: CheckSeverity;
  message: string;
  section?: string;
}

export interface PromptCheckResult {
  promptFile: string;
  stageName: string;
  issues: PromptCheckIssue[];
  passed: boolean;
  checkedAt: string;
}

// ─── Prompt structure expectations from promptGenerator.ts header() ──────────

const PROMPT_MIN_LENGTH = 50;
const PROMPT_PLACEHOLDER_PATTERNS = [
  '[stage prompt not yet generated]',
  '[prompt not generated]',
  '[TODO]',
  'PLACEHOLDER',
];

// ─── Prompt quality checker ───────────────────────────────────────────────────

export function checkPrompt(
  runFolder: string,
  promptFile: string,
  stageName: string,
): PromptCheckResult {
  const fullPath = path.join(runFolder, promptFile);
  const checkedAt = new Date().toISOString();
  const issues: PromptCheckIssue[] = [];

  if (!fs.existsSync(fullPath)) {
    return {
      promptFile,
      stageName,
      issues: [
        {
          code: 'PROMPT_MISSING_FILE',
          severity: 'fail',
          message: `Prompt file does not exist: ${promptFile}`,
        },
      ],
      passed: false,
      checkedAt,
    };
  }

  const content = fs.readFileSync(fullPath, 'utf8');

  if (content.trim().length < PROMPT_MIN_LENGTH) {
    issues.push({
      code: 'PROMPT_EMPTY',
      severity: 'fail',
      message: `Prompt file is empty or too short (under ${PROMPT_MIN_LENGTH} characters)`,
    });
    return {
      promptFile,
      stageName,
      issues,
      passed: false,
      checkedAt,
    };
  }

  for (const pattern of PROMPT_PLACEHOLDER_PATTERNS) {
    if (content.includes(pattern)) {
      issues.push({
        code: 'PROMPT_PLACEHOLDER',
        severity: 'warn',
        message: `Prompt file appears to contain placeholder content: "${pattern}"`,
      });
      break;
    }
  }

  // Stage header check: generated prompts start with "Stage: <name>"
  const hasStageHeader = /^Stage:\s*.+/m.test(content);
  if (!hasStageHeader) {
    issues.push({
      code: 'PROMPT_MISSING_STAGE_HEADER',
      severity: 'fail',
      message: 'Prompt file does not contain a "Stage:" line',
      section: 'Stage',
    });
  }

  // Task section check
  const hasTaskSection = /^Task:/m.test(content);
  if (!hasTaskSection) {
    issues.push({
      code: 'PROMPT_MISSING_TASK_SECTION',
      severity: 'warn',
      message: 'Prompt file does not contain a "Task:" section',
      section: 'Task',
    });
  }

  // Required output artifact check
  const hasOutputArtifact = /Required output artifact:/m.test(content);
  if (!hasOutputArtifact) {
    issues.push({
      code: 'PROMPT_MISSING_OUTPUT_ARTIFACT',
      severity: 'warn',
      message: 'Prompt file does not contain a "Required output artifact:" line',
      section: 'Required output artifact',
    });
  }

  const passed = !issues.some((i) => i.severity === 'fail');
  return { promptFile, stageName, issues, passed, checkedAt };
}

export function checkAllPrompts(meta: RunMetadata): PromptCheckResult[] {
  return meta.stages.map((stage) =>
    checkPrompt(meta.runFolder, stage.promptFile, stage.name),
  );
}

// ─── Artifact check results persistence ───────────────────────────────────────

export interface CheckResultsFile {
  version: '1';
  checkedAt: string;
  artifactResults: import('./artifactChecker').ArtifactCheckResult[];
  promptResults: PromptCheckResult[];
}

export function getCheckResultsPath(runFolder: string): string {
  return path.join(runFolder, 'artifact-check-results.json');
}

export function readCheckResults(runFolder: string): CheckResultsFile | null {
  const p = getCheckResultsPath(runFolder);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as CheckResultsFile;
  } catch {
    return null;
  }
}

export function writeCheckResults(runFolder: string, data: CheckResultsFile): void {
  const p = getCheckResultsPath(runFolder);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}
