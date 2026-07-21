// Stable-ID contract for the workflow-instruction catalog.
//
// IDs are exact identifiers, never fuzzy-matched. Runtime validators back the
// template-literal types below because template-literal types cannot enforce
// lowercase/kebab-case segment rules at compile time.

export type WorkflowInstructionId = `workflow.${string}`;
export type StageInstructionId = `stage.${string}.${string}`;
export type CommandInstructionId = `command.${string}.${string}`;
export type RuleInstructionId = `rule.${string}.${string}`;
export type ReportContractId = `report.${string}`;

export type CatalogEntryId =
  | WorkflowInstructionId
  | StageInstructionId
  | CommandInstructionId
  | RuleInstructionId
  | ReportContractId;

export type CatalogEntryKind = 'workflow' | 'stage' | 'command' | 'rule' | 'report-contract';

const SEGMENT_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const PREFIX_BY_KIND: Record<CatalogEntryKind, string> = {
  workflow: 'workflow',
  stage: 'stage',
  command: 'command',
  rule: 'rule',
  'report-contract': 'report',
};

// Minimum total dot-separated segments (including the prefix) for each kind.
// workflow.<mode> = 2, stage.<mode>.<stage-name> = 3,
// command.<owner>.<command-name> = 3, rule.<category>.<rule-name> = 3,
// report.<contract-name> = 2.
const SEGMENT_COUNT_BY_KIND: Record<CatalogEntryKind, number> = {
  workflow: 2,
  stage: 3,
  command: 3,
  rule: 3,
  'report-contract': 2,
};

export interface IdValidationResult {
  valid: boolean;
  reason?: string;
}

function validateId(id: string, kind: CatalogEntryKind): IdValidationResult {
  if (typeof id !== 'string' || id.length === 0) {
    return { valid: false, reason: 'ID must be a non-empty string' };
  }
  if (/\s/.test(id)) {
    return { valid: false, reason: 'ID must not contain whitespace' };
  }
  if (id.includes('/') || id.includes('\\')) {
    return { valid: false, reason: 'ID must not contain path separators' };
  }
  if (id !== id.toLowerCase()) {
    return { valid: false, reason: 'ID must be lowercase' };
  }
  const segments = id.split('.');
  const expectedCount = SEGMENT_COUNT_BY_KIND[kind];
  if (segments.length < expectedCount) {
    return {
      valid: false,
      reason: `ID must have at least ${expectedCount} dot-separated segments for kind "${kind}"`,
    };
  }
  if (segments.some((segment) => segment.length === 0)) {
    return { valid: false, reason: 'ID must not contain empty segments' };
  }
  const expectedPrefix = PREFIX_BY_KIND[kind];
  if (segments[0] !== expectedPrefix) {
    return {
      valid: false,
      reason: `ID must begin with prefix "${expectedPrefix}." for kind "${kind}"`,
    };
  }
  for (const segment of segments) {
    if (!SEGMENT_RE.test(segment)) {
      return {
        valid: false,
        reason: `ID segment "${segment}" must be lowercase kebab-case`,
      };
    }
  }
  return { valid: true };
}

export function isWorkflowId(id: string): id is WorkflowInstructionId {
  return validateId(id, 'workflow').valid;
}

export function isStageId(id: string): id is StageInstructionId {
  return validateId(id, 'stage').valid;
}

export function isCommandId(id: string): id is CommandInstructionId {
  return validateId(id, 'command').valid;
}

export function isRuleId(id: string): id is RuleInstructionId {
  return validateId(id, 'rule').valid;
}

export function isReportContractId(id: string): id is ReportContractId {
  return validateId(id, 'report-contract').valid;
}

export function validateCatalogEntryId(id: string, kind: CatalogEntryKind): IdValidationResult {
  return validateId(id, kind);
}

export function kindOfEntryId(id: string): CatalogEntryKind | undefined {
  const prefix = id.split('.')[0];
  const match = (Object.entries(PREFIX_BY_KIND) as Array<[CatalogEntryKind, string]>).find(
    ([, p]) => p === prefix,
  );
  return match?.[0];
}

export function makeWorkflowId(mode: string): WorkflowInstructionId {
  return `workflow.${mode}`;
}

export function makeStageId(mode: string, stageName: string): StageInstructionId {
  return `stage.${mode}.${stageName}`;
}

export function makeCommandId(owner: string, commandName: string): CommandInstructionId {
  return `command.${owner}.${commandName}`;
}

export function makeRuleId(category: string, ruleName: string): RuleInstructionId {
  return `rule.${category}.${ruleName}`;
}

export function makeReportContractId(contractName: string): ReportContractId {
  return `report.${contractName}`;
}
