// Typed catalog entry contracts for the workflow-instruction catalog.
//
// The catalog is a read-only index over identity and cross-references. It
// does not own workflow-stage progression (src/workflows.ts remains
// authoritative for that) and it does not assemble prompts.

import {
  WorkflowInstructionId,
  StageInstructionId,
  CommandInstructionId,
  RuleInstructionId,
  ReportContractId,
  CatalogEntryKind,
} from './catalogIds';

export interface CatalogEntryBase {
  id: string;
  kind: CatalogEntryKind;
  title: string;
  description: string;
}

export type CommandSideEffect =
  | 'read-only'
  | 'writes-workspace'
  | 'modifies-project'
  | 'external-state';

export interface WorkflowCatalogEntry extends CatalogEntryBase {
  kind: 'workflow';
  id: WorkflowInstructionId;
  mode: string;
  stageRefs: StageInstructionId[];
  sharedRuleRefs: RuleInstructionId[];
}

export interface StageCatalogEntry extends CatalogEntryBase {
  kind: 'stage';
  id: StageInstructionId;
  workflowRef: WorkflowInstructionId;
  stageName: string;
  commandRefs: CommandInstructionId[];
  ruleRefs: RuleInstructionId[];
  optionalCommandRefs: CommandInstructionId[];
  optionalRuleRefs: RuleInstructionId[];
  reportContractRef: ReportContractId;
  // Explicit typed instruction content (Batch 2). Empty/unset for stages not
  // yet migrated off legacy hardcoded prompt text; populated for
  // stage.feature.implementation as the Batch 2 representative integration.
  taskInstructions: string;
  validationRequirements: string[];
  stopConditions: string[];
}

export interface CommandCatalogEntry extends CatalogEntryBase {
  kind: 'command';
  id: CommandInstructionId;
  owner: string;
  command: string;
  purpose: string;
  sideEffect: CommandSideEffect;
}

export interface RuleCatalogEntry extends CatalogEntryBase {
  kind: 'rule';
  id: RuleInstructionId;
  category: string;
  instruction: string;
  ruleRefs: RuleInstructionId[];
}

export interface ReportContractCatalogEntry extends CatalogEntryBase {
  kind: 'report-contract';
  id: ReportContractId;
  artifactKind: string;
  purpose: string;
  requiredOutputCategory: string;
}

export type CatalogEntry =
  | WorkflowCatalogEntry
  | StageCatalogEntry
  | CommandCatalogEntry
  | RuleCatalogEntry
  | ReportContractCatalogEntry;

export interface InstructionCatalog {
  schemaVersion: string;
  catalogVersion: string;
  workflows: WorkflowCatalogEntry[];
  stages: StageCatalogEntry[];
  commands: CommandCatalogEntry[];
  rules: RuleCatalogEntry[];
  reportContracts: ReportContractCatalogEntry[];
}

export const CATALOG_SCHEMA_VERSION = '1.0.0';
export const CATALOG_VERSION = '1.0.0';

// ─── Validation issue contracts ────────────────────────────────────────────

export type CatalogIssueCode =
  | 'CATALOG_INVALID_ID'
  | 'CATALOG_DUPLICATE_ID'
  | 'CATALOG_DUPLICATE_ENTRY'
  | 'CATALOG_MISSING_REFERENCE'
  | 'CATALOG_INVALID_REFERENCE_TYPE'
  | 'CATALOG_UNKNOWN_WORKFLOW'
  | 'CATALOG_UNKNOWN_STAGE'
  | 'CATALOG_STAGE_MODE_MISMATCH'
  | 'CATALOG_STAGE_ORDER_MISMATCH'
  | 'CATALOG_MISSING_STAGE_BINDING'
  | 'CATALOG_ORPHAN_STAGE_BINDING'
  | 'CATALOG_MISSING_REPORT_CONTRACT'
  | 'CATALOG_REFERENCE_CYCLE'
  | 'CATALOG_INVALID_BUDGET'
  | 'CATALOG_MISSING_TASK_INSTRUCTIONS'
  | 'CATALOG_MISSING_VALIDATION_REQUIREMENTS'
  | 'CATALOG_MISSING_STOP_CONDITIONS'
  | 'CATALOG_DUPLICATE_TASK_INSTRUCTION'
  | 'CATALOG_DUPLICATE_VALIDATION_REQUIREMENT'
  | 'CATALOG_DUPLICATE_STOP_CONDITION';

export interface CatalogValidationIssue {
  code: CatalogIssueCode;
  message: string;
  entryId?: string;
  referencedId?: string;
  relationship?: string;
}

export interface CatalogValidationResult {
  valid: boolean;
  issues: CatalogValidationIssue[];
}

// ─── Resolution contracts ──────────────────────────────────────────────────

export interface ResolutionProvenanceEntry {
  rootWorkflowId: WorkflowInstructionId;
  rootStageId: StageInstructionId;
  sourceEntryId: string;
  referenceField: string;
  referencedEntryId: string;
  inclusionReason: string;
  depth: number;
}

export interface StageResolutionResult {
  workflow: WorkflowCatalogEntry;
  stage: StageCatalogEntry;
  commands: CommandCatalogEntry[];
  rules: RuleCatalogEntry[];
  reportContract: ReportContractCatalogEntry;
  provenance: ResolutionProvenanceEntry[];
}

export type StageResolveResult =
  | { ok: true; result: StageResolutionResult }
  | { ok: false; issues: CatalogValidationIssue[] };

export type WorkflowResolveResult =
  | { ok: true; result: WorkflowCatalogEntry }
  | { ok: false; issues: CatalogValidationIssue[] };

// ─── Budget contracts ───────────────────────────────────────────────────────

export interface InstructionBudgetLimits {
  maxCommands: number | null;
  maxRules: number | null;
  maxRuleDepth: number | null;
  maxEntryCharacters: number | null;
  maxTotalCharacters: number | null;
}

export interface BudgetLimitValidationIssue {
  limitName: keyof InstructionBudgetLimits;
  message: string;
}

export interface BudgetLimitValidationResult {
  valid: boolean;
  issues: BudgetLimitValidationIssue[];
}

export interface BudgetFinding {
  limitName: keyof InstructionBudgetLimits;
  declaredLimit: number | null;
  used: number;
  available: number | null;
  overLimit: boolean;
  amountExceeded: number;
  affectedEntryIds: string[];
}

export interface InstructionBudgetAccounting {
  findings: BudgetFinding[];
  overLimit: boolean;
  adequate: boolean;
  totalCharacters: number;
  perEntryCharacters: Record<string, number>;
}
