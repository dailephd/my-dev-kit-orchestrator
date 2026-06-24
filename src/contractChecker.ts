import * as fs from 'fs';
import * as path from 'path';
import { RunMetadata } from './run';
import {
  resolveArtifactKind,
  getArtifactSectionRequirements,
  parseArtifact,
} from './artifactChecker';
import { getWorkflowOrThrow } from './workflows';
import { isValidMode, VALID_MODES } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArtifactContractSeverity = 'pass' | 'warn' | 'fail';

export interface ArtifactContractIssue {
  code: string;
  severity: ArtifactContractSeverity;
  message: string;
  suggestedFix?: string;
  section?: string;
}

export interface ArtifactContractCheckResult {
  artifactFile: string;
  artifactKind: string;
  stageName: string;
  mode: string;
  issues: ArtifactContractIssue[];
  passed: boolean;
  checkedAt: string;
}

export interface RunContractCheckResult {
  runId: string;
  mode: string;
  modeValid: boolean;
  results: ArtifactContractCheckResult[];
  modeIssues: ArtifactContractIssue[];
  checkedAt: string;
}

export interface ModeContractSummary {
  mode: string;
  stages: Array<{
    stageName: string;
    artifactFile: string;
    artifactKind: string;
    predecessors: string[];
    requiredSections: string[];
  }>;
}

export interface ContractCheckOptions {
  strict?: boolean;
}

// ─── Placeholder section detection ───────────────────────────────────────────

const SECTION_PLACEHOLDER_RE =
  /^\s*(todo|tbd|n\/a|none|to be filled|to be completed|placeholder)\s*$/i;

export function isSectionPlaceholderContent(content: string): boolean {
  return SECTION_PLACEHOLDER_RE.test(content.trim());
}

// ─── Mode and stage validation helpers ───────────────────────────────────────

function getStagesForMode(mode: string): Set<string> {
  if (!isValidMode(mode)) return new Set();
  try {
    const workflow = getWorkflowOrThrow(mode);
    return new Set(workflow.stages.map((s) => s.name));
  } catch {
    return new Set();
  }
}

// Build map: artifact file path -> predecessor artifact file paths (immediate prior stage)
function buildPredecessorMap(mode: string): Map<string, string[]> {
  const predecessors = new Map<string, string[]>();
  if (!isValidMode(mode)) return predecessors;
  try {
    const workflow = getWorkflowOrThrow(mode);
    for (let i = 0; i < workflow.stages.length; i++) {
      const stage = workflow.stages[i];
      if (i === 0) {
        predecessors.set(stage.artifactFile, []);
      } else {
        const prev = workflow.stages[i - 1];
        predecessors.set(stage.artifactFile, [prev.artifactFile]);
      }
    }
  } catch {
    // Invalid mode: return empty map
  }
  return predecessors;
}

// ─── Single-artifact contract check ──────────────────────────────────────────

export function checkArtifactContract(
  runFolder: string,
  artifactFile: string,
  stageName: string,
  mode: string,
  predecessorFiles: string[],
  options: ContractCheckOptions = {},
): ArtifactContractCheckResult {
  const artifactKind = resolveArtifactKind(stageName) ?? 'Unknown';
  const checkedAt = new Date().toISOString();
  const issues: ArtifactContractIssue[] = [];
  const { strict = false } = options;

  // Unknown mode
  if (!isValidMode(mode)) {
    issues.push({
      code: 'CONTRACT_UNKNOWN_MODE',
      severity: 'fail',
      message: `Unknown workflow mode: "${mode}". Supported: ${VALID_MODES.join(', ')}`,
      suggestedFix: 'Check the mode field in run.json.',
    });
    return { artifactFile, artifactKind, stageName, mode, issues, passed: false, checkedAt };
  }

  // Unknown stage for this mode
  const validStages = getStagesForMode(mode);
  if (!validStages.has(stageName)) {
    issues.push({
      code: 'CONTRACT_UNKNOWN_STAGE',
      severity: 'fail',
      message: `Stage "${stageName}" is not valid for mode "${mode}".`,
      suggestedFix: `Valid stages for ${mode}: ${[...validStages].join(', ')}`,
    });
    return { artifactFile, artifactKind, stageName, mode, issues, passed: false, checkedAt };
  }

  const fullPath = path.join(runFolder, artifactFile);

  // Predecessor missing checks
  for (const predFile of predecessorFiles) {
    const predPath = path.join(runFolder, predFile);
    if (!fs.existsSync(predPath)) {
      issues.push({
        code: 'CONTRACT_PREDECESSOR_MISSING',
        severity: strict ? 'fail' : 'warn',
        message: `Required predecessor artifact is missing: ${predFile}`,
        suggestedFix: `Complete the stage that produces ${predFile} before this stage.`,
      });
    }
  }

  // Missing artifact file
  if (!fs.existsSync(fullPath)) {
    issues.push({
      code: 'CONTRACT_MISSING_FILE',
      severity: 'fail',
      message: `Artifact file does not exist: ${artifactFile}`,
      suggestedFix: `Run the ${stageName} stage to produce this artifact.`,
    });
    const passed = !issues.some((i) => i.severity === 'fail');
    return { artifactFile, artifactKind, stageName, mode, issues, passed, checkedAt };
  }

  const content = fs.readFileSync(fullPath, 'utf8');

  // Empty file
  if (!content.trim()) {
    issues.push({
      code: 'CONTRACT_EMPTY_FILE',
      severity: 'fail',
      message: `Artifact file is empty: ${artifactFile}`,
      suggestedFix: `The coding agent must write content to this artifact.`,
    });
    const passed = !issues.some((i) => i.severity === 'fail');
    return { artifactFile, artifactKind, stageName, mode, issues, passed, checkedAt };
  }

  // Section requirement checks
  const requirements = getArtifactSectionRequirements(artifactKind);
  if (!requirements) {
    // No section contract defined for this artifact kind
    issues.push({
      code: 'CONTRACT_STAGE_NO_CONTRACT',
      severity: strict ? 'fail' : 'warn',
      message: `No section contract is defined for artifact kind "${artifactKind}" (stage: ${stageName})`,
      suggestedFix: `Add section requirements to the SECTION_REGISTRY for ${artifactKind}.`,
    });
  } else {
    const parsed = parseArtifact(content);
    for (const section of requirements.required) {
      if (!parsed.sections.has(section)) {
        issues.push({
          code: 'CONTRACT_MISSING_SECTION',
          severity: 'fail',
          message: `Required section "${section}" is missing from ${artifactFile}`,
          suggestedFix: `Add a "${section}:" header with content to the artifact.`,
          section,
        });
      } else {
        const sectionContent = parsed.sections.get(section) ?? '';
        if (!sectionContent.trim()) {
          issues.push({
            code: 'CONTRACT_BLANK_SECTION',
            severity: strict ? 'fail' : 'warn',
            message: `Required section "${section}" is present but blank`,
            suggestedFix: `Add content to the "${section}" section.`,
            section,
          });
        } else if (isSectionPlaceholderContent(sectionContent)) {
          issues.push({
            code: 'CONTRACT_PLACEHOLDER_SECTION',
            severity: strict ? 'fail' : 'warn',
            message: `Required section "${section}" contains only placeholder content`,
            suggestedFix: `Replace placeholder content in "${section}" with actual content.`,
            section,
          });
        }
      }
    }
  }

  const passed = !issues.some((i) => i.severity === 'fail');
  return { artifactFile, artifactKind, stageName, mode, issues, passed, checkedAt };
}

// ─── Run-level contract check ─────────────────────────────────────────────────

export function checkRunArtifactContracts(
  meta: RunMetadata,
  options: ContractCheckOptions = {},
): RunContractCheckResult {
  const checkedAt = new Date().toISOString();
  const modeIssues: ArtifactContractIssue[] = [];
  const results: ArtifactContractCheckResult[] = [];

  if (!isValidMode(meta.mode)) {
    modeIssues.push({
      code: 'CONTRACT_UNKNOWN_MODE',
      severity: 'fail',
      message: `Run mode "${meta.mode}" is not a supported workflow mode.`,
      suggestedFix: `Supported modes: ${VALID_MODES.join(', ')}`,
    });
    return {
      runId: meta.runId,
      mode: meta.mode,
      modeValid: false,
      results,
      modeIssues,
      checkedAt,
    };
  }

  const predecessorMap = buildPredecessorMap(meta.mode);
  const validStages = getStagesForMode(meta.mode);

  for (const stage of meta.stages) {
    if (!validStages.has(stage.name)) {
      modeIssues.push({
        code: 'CONTRACT_UNKNOWN_STAGE',
        severity: 'warn',
        message: `Stage "${stage.name}" is not expected for mode "${meta.mode}"`,
        suggestedFix: `Review run.json stages for mode ${meta.mode}.`,
      });
      continue;
    }

    const predecessorFiles = predecessorMap.get(stage.artifactFile) ?? [];
    results.push(
      checkArtifactContract(
        meta.runFolder,
        stage.artifactFile,
        stage.name,
        meta.mode,
        predecessorFiles,
        options,
      ),
    );

    for (const additional of stage.additionalArtifactFiles ?? []) {
      results.push(
        checkArtifactContract(
          meta.runFolder,
          additional,
          stage.name,
          meta.mode,
          [stage.artifactFile],
          options,
        ),
      );
    }
  }

  return {
    runId: meta.runId,
    mode: meta.mode,
    modeValid: true,
    results,
    modeIssues,
    checkedAt,
  };
}

// ─── Mode contract summary ─────────────────────────────────────────────────────

export function resolveArtifactContractsForMode(mode: string): ModeContractSummary | null {
  if (!isValidMode(mode)) return null;
  try {
    const workflow = getWorkflowOrThrow(mode);
    const predecessorMap = buildPredecessorMap(mode);
    const stages = workflow.stages.map((stage) => {
      const artifactKind = resolveArtifactKind(stage.name) ?? 'Unknown';
      const requirements = getArtifactSectionRequirements(artifactKind);
      return {
        stageName: stage.name,
        artifactFile: stage.artifactFile,
        artifactKind,
        predecessors: predecessorMap.get(stage.artifactFile) ?? [],
        requiredSections: requirements?.required ?? [],
      };
    });
    return { mode, stages };
  } catch {
    return null;
  }
}
