import * as fs from 'fs';
import * as path from 'path';
import { ArtifactStateFile } from './artifactLifecycle';
import { RunMetadata } from './run';
import {
  GREENFIELD_STAGE_TO_KIND,
  GREENFIELD_SECTION_REGISTRY,
} from './greenfield/modes/greenfieldArtifactContract';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CheckSeverity = 'pass' | 'warn' | 'fail';

export interface ArtifactCheckIssue {
  code: string;
  severity: CheckSeverity;
  message: string;
  section?: string;
}

export interface ArtifactCheckResult {
  artifactFile: string;
  artifactKind: string;
  issues: ArtifactCheckIssue[];
  passed: boolean;
  checkedAt: string;
}

// ─── Section requirement registry ─────────────────────────────────────────────

export interface SectionRequirements {
  required: string[];
  format?: 'text' | 'json';
  requiredFields?: string[];
  validateJson?: (value: unknown) => StructuredArtifactIssue[];
}

export interface StructuredArtifactIssue {
  code: 'MISSING_FIELD' | 'INVALID_FIELD';
  message: string;
  field: string;
}

export interface StructuredArtifactValidationResult {
  value?: unknown;
  issues: StructuredArtifactIssue[];
  parseError?: string;
}

const SECTION_REGISTRY: Record<string, SectionRequirements> = {
  RequestBrief: {
    required: [
      'Artifact',
      'Workflow mode',
      'Original request',
      'Requested change',
      'Target area',
      'User-visible or external behavior',
      'Constraints',
      'Non-goals',
      'Success criteria',
      'Ambiguity or missing information',
      'Expected next stage',
      'Status',
    ],
  },
  ArchitectureContextPacket: {
    required: [
      'Artifact',
      'Workflow mode',
      'Project root',
      'Relevant files',
      'Relevant symbols',
      'Status',
    ],
  },
  BehaviorModel: {
    required: [
      'Artifact',
      'Workflow mode',
      'Status',
    ],
  },
  PseudocodePacket: {
    required: [
      'Artifact',
      'Workflow mode',
      'Status',
    ],
  },
  TestStrategyPacket: {
    required: [
      'Artifact',
      'Workflow mode',
      'Status',
    ],
  },
  ImplementationReport: {
    required: [
      'Artifact',
      'Workflow mode',
      'Status',
    ],
  },
  TestImplementationReport: {
    required: [
      'Artifact',
      'Workflow mode',
      'Status',
    ],
  },
  VerificationReport: {
    required: [
      'Artifact',
      'Workflow mode',
      'Status',
    ],
  },
  JudgeReport: {
    required: [
      'Artifact',
      'Workflow mode',
      'Verdict',
      'Status',
    ],
  },
  FinalReport: {
    required: [
      'Artifact',
      'Workflow mode',
      'Run ID',
      'Status',
    ],
  },
  DesignMap: {
    required: [
      'Artifact',
      'DesignMap',
      'Workflow mode',
      'Inputs used',
      'Trace ID registry',
      'Requirement links',
      'Context links',
      'Behavior links',
      'Invariant links',
      'Transition links',
      'Pseudocode links',
      'Test responsibility links',
      'Implementation links',
      'Verification links',
      'Risk links',
      'Orphan or missing links',
      'Trace gaps',
      'Status',
    ],
  },
  // greenfield-specific (verification, judge, final-report already registered above)
  ...GREENFIELD_SECTION_REGISTRY,
};

// ─── Artifact kind resolver ───────────────────────────────────────────────────

const STAGE_TO_KIND: Record<string, string> = {
  // core
  'request-brief': 'RequestBrief',
  'architecture-context': 'ArchitectureContextPacket',
  'behavior-model': 'BehaviorModel',
  'pseudocode-packet': 'PseudocodePacket',
  'test-strategy': 'TestStrategyPacket',
  'implementation': 'ImplementationReport',
  'test-implementation': 'TestImplementationReport',
  'verification': 'VerificationReport',
  'judge': 'JudgeReport',
  'final-report': 'FinalReport',
  // repair-specific
  'observed-behavior-report': 'ObservedBehaviorReport',
  'behavior-trace': 'BehaviorTrace',
  'divergence-report': 'DivergenceReport',
  'correction-design': 'CorrectionDesign',
  'regression-test-strategy': 'RegressionTestStrategy',
  // test-specific
  'test-target-brief': 'TestTargetBrief',
  'behavior-reconstruction': 'BehaviorReconstruction',
  'pseudocode-summary': 'PseudocodeSummary',
  // refactor-specific
  'refactor-brief': 'RefactorBrief',
  'existing-behavior-map': 'ExistingBehaviorMap',
  'preserved-invariant-list': 'PreservedInvariantList',
  'compatibility-test-strategy': 'CompatibilityTestStrategy',
  'refactor-pseudocode-packet': 'RefactorPseudocodePacket',
  // harden-specific
  'hardening-brief': 'HardeningBrief',
  'assumption-report': 'AssumptionReport',
  'failure-mode-matrix': 'FailureModeMatrix',
  'guard-pseudocode-packet': 'GuardPseudocodePacket',
  'resilience-test-strategy': 'ResilienceTestStrategy',
  // extraction-specific
  'source-architecture-context': 'SourceArchitectureContextPacket',
  'source-workflow-map': 'SourceWorkflowMap',
  'porting-map': 'PortingMap',
  'golden-behavior-contract': 'GoldenBehaviorContract',
  'target-architecture': 'TargetArchitectureProposal',
  // design trace
  'design-map': 'DesignMap',
  // greenfield-specific (verification, judge, final-report already registered above)
  ...GREENFIELD_STAGE_TO_KIND,
};

export function resolveArtifactKind(stageName: string): string | undefined {
  return STAGE_TO_KIND[stageName];
}

export function getArtifactSectionRequirements(
  artifactKind: string,
): SectionRequirements | undefined {
  return SECTION_REGISTRY[artifactKind];
}

// ─── Text artifact parser ─────────────────────────────────────────────────────

// Matches section headers: line starting with capital letter, alphanumeric/space/special, colon.
// Examples: "Artifact:", "Workflow mode:", "Run ID:", "User-visible or external behavior:"
const SECTION_HEADER_RE = /^([A-Z][A-Za-z0-9 ()/-]{0,79}):\s*(.*)$/;

export interface ParsedArtifact {
  sections: Map<string, string>;
  rawContent: string;
}

export function parseArtifact(content: string): ParsedArtifact {
  const sections = new Map<string, string>();
  const lines = content.split('\n');

  let currentKey: string | null = null;
  const accumulator: string[] = [];

  const flushSection = (): void => {
    if (currentKey !== null) {
      sections.set(currentKey, accumulator.join('\n').trim());
    }
  };

  for (const line of lines) {
    const match = SECTION_HEADER_RE.exec(line);
    if (match) {
      flushSection();
      currentKey = match[1].trim();
      accumulator.length = 0;
      const inline = match[2].trim();
      if (inline) {
        accumulator.push(inline);
      }
    } else if (currentKey !== null) {
      accumulator.push(line);
    }
  }
  flushSection();

  return { sections, rawContent: content };
}

/** Validate a JSON artifact with the structured contract registered for its artifact kind. */
export function validateStructuredArtifact(
  content: string,
  requirements: SectionRequirements,
): StructuredArtifactValidationResult {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch (error) {
    return {
      issues: [],
      parseError: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    value,
    issues: requirements.validateJson?.(value) ?? [],
  };
}

function structuredStatus(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const status = (value as Record<string, unknown>).status;
  return typeof status === 'string' ? status : undefined;
}

// ─── Placeholder detection ────────────────────────────────────────────────────

const PLACEHOLDER_MARKERS = ['TODO', 'PLACEHOLDER', '[TBD]', '[TODO]'];
const CONTENT_MIN_LENGTH = 80;

export function isPlaceholderContent(content: string): boolean {
  const stripped = content.replace(/\s/g, '');
  if (stripped.length < CONTENT_MIN_LENGTH) return true;
  for (const marker of PLACEHOLDER_MARKERS) {
    if (content.includes(marker)) return true;
  }
  if (/^\s*\.{3,}\s*$/.test(content)) return true;
  return false;
}

// ─── Status mismatch detection ────────────────────────────────────────────────

export function hasStatusMismatch(
  artifactStatus: string | undefined,
  lifecycleState: string | undefined,
): boolean {
  if (!artifactStatus || !lifecycleState) return false;
  // Take only the first line of Status field; agents may write extra content below it
  const artStatus = (artifactStatus.split(/[\n\r]/)[0] ?? '').toLowerCase().trim();
  const lcState = lifecycleState.toLowerCase().trim();
  if ((artStatus === 'blocked' || artStatus === 'incomplete') && lcState === 'complete') return true;
  if (artStatus === 'complete' && (lcState === 'blocked' || lcState === 'incomplete')) return true;
  return false;
}

// ─── Check runner ─────────────────────────────────────────────────────────────

export function checkArtifact(
  runFolder: string,
  artifactFile: string,
  stageName: string,
  stateFile: ArtifactStateFile,
): ArtifactCheckResult {
  const fullPath = path.join(runFolder, artifactFile);
  const artifactKind = resolveArtifactKind(stageName) ?? 'Unknown';
  const checkedAt = new Date().toISOString();
  const issues: ArtifactCheckIssue[] = [];

  if (!fs.existsSync(fullPath)) {
    return {
      artifactFile,
      artifactKind,
      issues: [
        {
          code: 'MISSING_FILE',
          severity: 'fail',
          message: `Artifact file does not exist: ${artifactFile}`,
        },
      ],
      passed: false,
      checkedAt,
    };
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const requirements = getArtifactSectionRequirements(artifactKind);

  if (requirements) {
    if (requirements.format === 'json') {
      const validation = validateStructuredArtifact(content, requirements);
      if (validation.parseError) {
        issues.push({
          code: 'MALFORMED_JSON',
          severity: 'fail',
          message: `Artifact is not valid JSON: ${validation.parseError}`,
        });
      } else {
        for (const issue of validation.issues) {
          issues.push({
            code: issue.code === 'MISSING_FIELD' ? 'MISSING_FIELD' : 'INVALID_FIELD',
            severity: 'fail',
            message: issue.message,
            section: issue.field,
          });
        }

        const artifactStatus = structuredStatus(validation.value);
        const lifecycleState = stateFile.artifacts[artifactFile]?.state;
        if (hasStatusMismatch(artifactStatus, lifecycleState)) {
          issues.push({
            code: 'STATUS_MISMATCH',
            severity: 'warn',
            message: `Artifact status field "${artifactStatus}" does not match lifecycle state "${lifecycleState}"`,
            section: 'status',
          });
        }
      }
    } else {
      const parsed = parseArtifact(content);

      if (isPlaceholderContent(content)) {
        issues.push({
          code: 'PLACEHOLDER_CONTENT',
          severity: 'warn',
          message: 'Artifact appears to be a placeholder or is suspiciously short',
        });
      }

      for (const section of requirements.required) {
        if (!parsed.sections.has(section)) {
          issues.push({
            code: 'MISSING_SECTION',
            severity: 'fail',
            message: `Required section "${section}" is not present`,
            section,
          });
        } else {
          const sectionContent = parsed.sections.get(section) ?? '';
          if (!sectionContent.trim()) {
            issues.push({
              code: 'EMPTY_SECTION',
              severity: 'warn',
              message: `Required section "${section}" is present but empty`,
              section,
            });
          }
        }
      }

      const artifactStatus = parsed.sections.get('Status');
      const stateRecord = stateFile.artifacts[artifactFile];
      const lifecycleState = stateRecord?.state;

      if (hasStatusMismatch(artifactStatus, lifecycleState)) {
        issues.push({
          code: 'STATUS_MISMATCH',
          severity: 'warn',
          message: `Artifact Status field "${artifactStatus}" does not match lifecycle state "${lifecycleState}"`,
          section: 'Status',
        });
      }
    }
  }

  const passed = !issues.some((i) => i.severity === 'fail');
  return { artifactFile, artifactKind, issues, passed, checkedAt };
}

export function checkAllArtifacts(
  meta: RunMetadata,
  stateFile: ArtifactStateFile,
): ArtifactCheckResult[] {
  const results: ArtifactCheckResult[] = [];
  for (const stage of meta.stages) {
    results.push(checkArtifact(meta.runFolder, stage.artifactFile, stage.name, stateFile));
    for (const additional of stage.additionalArtifactFiles ?? []) {
      results.push(checkArtifact(meta.runFolder, additional, stage.name, stateFile));
    }
  }
  return results;
}
