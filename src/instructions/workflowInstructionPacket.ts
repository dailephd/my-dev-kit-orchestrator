// WorkflowInstructionPacket: a versioned, deterministic assembly of
// catalog-owned instruction content for exactly one stage.
//
// The packet does not own workflow-stage progression (src/workflows.ts
// remains authoritative for that), does not become an artifact or a native
// stage, and is never written into run.json. It is a prompt-inspection
// output built on top of the Batch 1 catalog, resolver, and budget APIs.

import {
  CatalogValidationIssue,
  CommandCatalogEntry,
  InstructionBudgetAccounting,
  InstructionBudgetLimits,
  InstructionCatalog,
  ReportContractCatalogEntry,
  ResolutionProvenanceEntry,
  RuleCatalogEntry,
  StageCatalogEntry,
  StageResolutionResult,
  WorkflowCatalogEntry,
} from './catalogTypes';
import { validateCatalog } from './catalogValidation';
import { resolveStage } from './catalogResolver';
import { accountForBudget } from './instructionBudget';

export const WORKFLOW_INSTRUCTION_PACKET_SCHEMA_VERSION = '1.0.0';
export const WORKFLOW_INSTRUCTION_PACKET_SUPPORTED_MAJOR = 1;

// Chosen after measuring the representative feature/implementation packet
// (see tests/workflowInstructionPacketBudget.test.ts): the production packet
// currently resolves 0 commands, 3 rules (2 shared workflow rules plus the
// stage's own direct rule) at depth 0, with its largest single entry (the
// stage entry itself, ~1,818 characters) and ~3,626 total characters. These
// defaults give meaningful headroom above that baseline without being
// effectively unlimited.
export const DEFAULT_WORKFLOW_INSTRUCTION_PACKET_LIMITS: InstructionBudgetLimits = {
  maxCommands: 20,
  maxRules: 30,
  maxRuleDepth: 8,
  maxEntryCharacters: 4000,
  maxTotalCharacters: 40000,
};

export type PacketInclusion = 'required' | 'optional';

export interface PacketPrimaryEntry {
  id: string;
  kind: 'stage';
  title: string;
  description: string;
  workflowRef: string;
  stageName: string;
  commandRefs: string[];
  ruleRefs: string[];
  optionalCommandRefs: string[];
  optionalRuleRefs: string[];
  reportContractRef: string;
  taskInstructions: string;
  validationRequirements: string[];
  stopConditions: string[];
}

export interface ResolvedCommandEntry extends CommandCatalogEntry {
  included: PacketInclusion;
}

export interface ResolvedRuleEntry extends RuleCatalogEntry {
  included: PacketInclusion;
  depth: number;
}

export interface TruncationRecord {
  rootOptionalEntryId: string;
  affectedEntryIds: string[];
  limitingField: keyof InstructionBudgetLimits;
  declaredLimit: number | null;
  usedBefore: number;
  attemptedAfter: number;
  reason: string;
}

export interface PacketTruncation {
  truncated: boolean;
  records: TruncationRecord[];
  droppedOptionalCommandIds: string[];
  droppedOptionalRuleIds: string[];
  droppedOptionalDependencyIds: string[];
  warnings: string[];
}

export interface PacketAdequacy {
  status: 'adequate' | 'inadequate';
  reasons: string[];
  requiredContentComplete: boolean;
  requiredBudgetSatisfied: boolean;
  optionalContentDropped: boolean;
  affectedEntryIds: string[];
}

export interface WorkflowInstructionPacket {
  schemaVersion: string;
  catalogSchemaVersion: string;
  catalogVersion: string;
  workflowId: string;
  stageId: string;
  primaryEntry: PacketPrimaryEntry;
  resolvedCommands: ResolvedCommandEntry[];
  resolvedRules: ResolvedRuleEntry[];
  reportContract: ReportContractCatalogEntry;
  validationRequirements: string[];
  stopConditions: string[];
  resolutionProvenance: ResolutionProvenanceEntry[];
  budget: InstructionBudgetAccounting;
  truncation: PacketTruncation;
  adequacy: PacketAdequacy;
  unresolvedReferences: string[];
  warnings: string[];
}

export interface AssemblePacketInput {
  catalog: InstructionCatalog;
  workflowId: string;
  stageId: string;
  limits?: InstructionBudgetLimits;
}

export type AssemblePacketResult =
  | { ok: true; packet: WorkflowInstructionPacket }
  | { ok: false; issues: CatalogValidationIssue[] };

function ruleClosure(rootId: string, rulesById: Map<string, RuleCatalogEntry>): { rules: RuleCatalogEntry[]; ok: boolean } {
  const included = new Map<string, RuleCatalogEntry>();
  const visiting = new Set<string>();

  const visit = (ruleId: string): boolean => {
    if (visiting.has(ruleId)) return false;
    const rule = rulesById.get(ruleId);
    if (!rule) return false;
    if (included.has(ruleId)) return true;
    visiting.add(ruleId);
    included.set(ruleId, rule);
    for (const nested of rule.ruleRefs) {
      if (!visit(nested)) {
        visiting.delete(ruleId);
        return false;
      }
    }
    visiting.delete(ruleId);
    return true;
  };

  const ok = visit(rootId);
  return { rules: [...included.values()].sort((a, b) => a.id.localeCompare(b.id)), ok };
}

// Fitting a candidate optional unit means: build a hypothetical
// StageResolutionResult with the candidate's entries added to the required
// set, and re-run Batch 1's accountForBudget against it. If every limit is
// still satisfied, the candidate is committed to the real working set.
function fits(
  workflow: WorkflowCatalogEntry,
  stage: StageCatalogEntry,
  reportContract: ReportContractCatalogEntry,
  commands: CommandCatalogEntry[],
  rules: RuleCatalogEntry[],
  limits: InstructionBudgetLimits,
): boolean {
  const hypothetical: StageResolutionResult = {
    workflow,
    stage,
    commands,
    rules,
    reportContract,
    provenance: [],
  };
  const accounting = accountForBudget(hypothetical, limits);
  return !accounting.overLimit;
}

export function assembleWorkflowInstructionPacket(input: AssemblePacketInput): AssemblePacketResult {
  const { catalog, workflowId, stageId } = input;
  const limits = input.limits ?? DEFAULT_WORKFLOW_INSTRUCTION_PACKET_LIMITS;

  const catalogValidation = validateCatalog(catalog);
  if (!catalogValidation.valid) {
    return { ok: false, issues: catalogValidation.issues };
  }

  const requiredResolution = resolveStage(catalog, stageId);
  if (!requiredResolution.ok) {
    return { ok: false, issues: requiredResolution.issues };
  }
  const { workflow, stage, commands: requiredCommands, rules: requiredRules, reportContract } = requiredResolution.result;

  if (workflow.id !== workflowId) {
    return {
      ok: false,
      issues: [
        {
          code: 'CATALOG_STAGE_MODE_MISMATCH',
          message: `Stage "${stageId}" belongs to workflow "${workflow.id}", not requested workflow "${workflowId}".`,
          entryId: stageId,
          referencedId: workflowId,
        },
      ],
    };
  }

  const commandsById = new Map(catalog.commands.map((c) => [c.id, c]));
  const rulesById = new Map(catalog.rules.map((r) => [r.id, r]));

  // ─── Optional commands ────────────────────────────────────────────────────
  const workingCommands = [...requiredCommands];
  const droppedOptionalCommandIds: string[] = [];
  const truncationRecords: TruncationRecord[] = [];

  for (const optionalId of [...stage.optionalCommandRefs].sort()) {
    const candidate = commandsById.get(optionalId);
    if (!candidate) {
      return {
        ok: false,
        issues: [
          {
            code: 'CATALOG_MISSING_REFERENCE',
            message: `Stage "${stage.id}" references unknown optional command "${optionalId}".`,
            entryId: stage.id,
            referencedId: optionalId,
            relationship: 'optionalCommandRefs',
          },
        ],
      };
    }
    if (workingCommands.some((c) => c.id === candidate.id)) continue;

    const trialCommands = [...workingCommands, candidate];
    if (fits(workflow, stage, reportContract, trialCommands, requiredRules, limits)) {
      workingCommands.push(candidate);
    } else {
      const before = accountForBudget(
        { workflow, stage, commands: workingCommands, rules: requiredRules, reportContract, provenance: [] },
        limits,
      );
      const after = accountForBudget(
        { workflow, stage, commands: trialCommands, rules: requiredRules, reportContract, provenance: [] },
        limits,
      );
      const limitingFinding = after.findings.find((f) => f.overLimit) ?? after.findings[0];
      droppedOptionalCommandIds.push(candidate.id);
      truncationRecords.push({
        rootOptionalEntryId: candidate.id,
        affectedEntryIds: [candidate.id],
        limitingField: limitingFinding.limitName,
        declaredLimit: limitingFinding.declaredLimit,
        usedBefore: before.findings.find((f) => f.limitName === limitingFinding.limitName)?.used ?? 0,
        attemptedAfter: limitingFinding.used,
        reason: `Optional command "${candidate.id}" was omitted because including it would exceed limit "${limitingFinding.limitName}".`,
      });
    }
  }

  // ─── Optional rules (with complete dependency closures) ──────────────────
  const workingRules = new Map(requiredRules.map((r) => [r.id, r]));
  const droppedOptionalRuleIds: string[] = [];
  const droppedOptionalDependencyIds: string[] = [];

  for (const optionalId of [...stage.optionalRuleRefs].sort()) {
    if (workingRules.has(optionalId)) continue;
    const closure = ruleClosure(optionalId, rulesById);
    if (!closure.ok) {
      return {
        ok: false,
        issues: [
          {
            code: 'CATALOG_REFERENCE_CYCLE',
            message: `Optional rule "${optionalId}" on stage "${stage.id}" has a missing reference or a rule dependency cycle.`,
            entryId: stage.id,
            referencedId: optionalId,
            relationship: 'optionalRuleRefs',
          },
        ],
      };
    }

    const newRules = closure.rules.filter((r) => !workingRules.has(r.id));
    const trialRules = [...workingRules.values(), ...newRules];

    if (fits(workflow, stage, reportContract, workingCommands, trialRules, limits)) {
      for (const r of newRules) workingRules.set(r.id, r);
    } else {
      const before = accountForBudget(
        { workflow, stage, commands: workingCommands, rules: [...workingRules.values()], reportContract, provenance: [] },
        limits,
      );
      const after = accountForBudget(
        { workflow, stage, commands: workingCommands, rules: trialRules, reportContract, provenance: [] },
        limits,
      );
      const limitingFinding = after.findings.find((f) => f.overLimit) ?? after.findings[0];
      droppedOptionalRuleIds.push(optionalId);
      const dependencyIds = newRules.map((r) => r.id).filter((id) => id !== optionalId);
      droppedOptionalDependencyIds.push(...dependencyIds);
      truncationRecords.push({
        rootOptionalEntryId: optionalId,
        affectedEntryIds: newRules.map((r) => r.id),
        limitingField: limitingFinding.limitName,
        declaredLimit: limitingFinding.declaredLimit,
        usedBefore: before.findings.find((f) => f.limitName === limitingFinding.limitName)?.used ?? 0,
        attemptedAfter: limitingFinding.used,
        reason: `Optional rule "${optionalId}" and its dependency closure were omitted because including the complete closure would exceed limit "${limitingFinding.limitName}".`,
      });
    }
  }

  const finalRules = [...workingRules.values()].sort((a, b) => a.id.localeCompare(b.id));
  const finalCommands = [...workingCommands].sort((a, b) => a.id.localeCompare(b.id));

  // ─── Required-content budget accounting (drives adequacy; never truncates) ─
  const requiredOnlyAccounting = accountForBudget(
    { workflow, stage, commands: requiredCommands, rules: requiredRules, reportContract, provenance: [] },
    limits,
  );
  const finalAccounting = accountForBudget(
    { workflow, stage, commands: finalCommands, rules: finalRules, reportContract, provenance: [] },
    limits,
  );

  const requiredOverLimit = requiredOnlyAccounting.overLimit;
  const requiredIds = new Set<string>([
    stage.id,
    workflow.id,
    reportContract.id,
    ...requiredCommands.map((c) => c.id),
    ...requiredRules.map((r) => r.id),
  ]);
  const requiredAffectedEntryIds = requiredOnlyAccounting.findings
    .filter((f) => f.overLimit)
    .flatMap((f) => f.affectedEntryIds)
    .filter((id) => requiredIds.has(id));

  const truncated = truncationRecords.length > 0;
  const truncation: PacketTruncation = {
    truncated,
    records: truncationRecords,
    droppedOptionalCommandIds: [...droppedOptionalCommandIds].sort(),
    droppedOptionalRuleIds: [...droppedOptionalRuleIds].sort(),
    droppedOptionalDependencyIds: [...new Set(droppedOptionalDependencyIds)].sort(),
    warnings: truncationRecords.map((r) => r.reason),
  };

  const adequacyReasons: string[] = [];
  if (requiredOverLimit) {
    adequacyReasons.push('Required content exceeds one or more declared instruction-budget limits.');
  }
  const adequacy: PacketAdequacy = {
    status: requiredOverLimit ? 'inadequate' : 'adequate',
    reasons: adequacyReasons,
    requiredContentComplete: true,
    requiredBudgetSatisfied: !requiredOverLimit,
    optionalContentDropped: truncated,
    affectedEntryIds: [...new Set(requiredAffectedEntryIds)].sort(),
  };

  const depthByRuleId = new Map<string, number>();
  for (const entry of requiredResolution.result.provenance) {
    if (entry.referenceField === 'ruleRefs') {
      depthByRuleId.set(entry.referencedEntryId, entry.depth);
    }
  }

  const resolvedCommands: ResolvedCommandEntry[] = finalCommands.map((c) => ({
    ...c,
    included: requiredCommands.some((r) => r.id === c.id) ? 'required' : 'optional',
  }));

  const resolvedRules: ResolvedRuleEntry[] = finalRules.map((r) => ({
    ...r,
    included: requiredRules.some((req) => req.id === r.id) ? 'required' : 'optional',
    depth: depthByRuleId.get(r.id) ?? 0,
  }));

  const primaryEntry: PacketPrimaryEntry = {
    id: stage.id,
    kind: 'stage',
    title: stage.title,
    description: stage.description,
    workflowRef: stage.workflowRef,
    stageName: stage.stageName,
    commandRefs: [...stage.commandRefs],
    ruleRefs: [...stage.ruleRefs],
    optionalCommandRefs: [...stage.optionalCommandRefs],
    optionalRuleRefs: [...stage.optionalRuleRefs],
    reportContractRef: stage.reportContractRef,
    taskInstructions: stage.taskInstructions,
    validationRequirements: [...stage.validationRequirements],
    stopConditions: [...stage.stopConditions],
  };

  const packet: WorkflowInstructionPacket = {
    schemaVersion: WORKFLOW_INSTRUCTION_PACKET_SCHEMA_VERSION,
    catalogSchemaVersion: catalog.schemaVersion,
    catalogVersion: catalog.catalogVersion,
    workflowId: workflow.id,
    stageId: stage.id,
    primaryEntry,
    resolvedCommands,
    resolvedRules,
    reportContract,
    validationRequirements: [...stage.validationRequirements],
    stopConditions: [...stage.stopConditions],
    resolutionProvenance: requiredResolution.result.provenance,
    budget: finalAccounting,
    truncation,
    adequacy,
    unresolvedReferences: [],
    warnings: [...truncation.warnings],
  };

  return { ok: true, packet };
}
