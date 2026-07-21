// Catalog validation: ID format, duplicate IDs, reference existence/type,
// stage/workflow ownership and order, report-contract cardinality, and
// rule-dependency cycle detection.

import { getAllWorkflows } from '../workflows';
import { validateCatalogEntryId } from './catalogIds';
import { CatalogEntry, CatalogValidationIssue, CatalogValidationResult, InstructionCatalog } from './catalogTypes';

function allEntries(catalog: InstructionCatalog): CatalogEntry[] {
  return [
    ...catalog.workflows,
    ...catalog.stages,
    ...catalog.commands,
    ...catalog.rules,
    ...catalog.reportContracts,
  ];
}

const PLACEHOLDER_RE = /\b(todo|tbd|n\/a|same as before|placeholder)\b/i;

function normalizeForDuplicateCheck(value: string): string {
  return value.trim().toLowerCase();
}

// Batch 3 completeness gate: every stage must carry real, non-placeholder
// task/validation/stop-condition content (see stageInstructionContent.ts).
// "Duplicate task instruction" is checked as repeated non-empty lines within
// a single stage's taskInstructions string, since taskInstructions is one
// string rather than an array -- the other two duplicate checks operate on
// their respective arrays directly.
function checkStageInstructionCompleteness(catalog: InstructionCatalog, issues: CatalogValidationIssue[]): void {
  for (const stage of catalog.stages) {
    const task = stage.taskInstructions;
    if (!task || task.trim().length === 0) {
      issues.push({
        code: 'CATALOG_MISSING_TASK_INSTRUCTIONS',
        message: `Stage "${stage.id}" has no task instructions.`,
        entryId: stage.id,
      });
    } else if (PLACEHOLDER_RE.test(task)) {
      issues.push({
        code: 'CATALOG_MISSING_TASK_INSTRUCTIONS',
        message: `Stage "${stage.id}" task instructions contain placeholder text.`,
        entryId: stage.id,
      });
    } else {
      const lines = task
        .split('\n')
        .map((l) => normalizeForDuplicateCheck(l))
        .filter((l) => l.length > 0);
      const seen = new Set<string>();
      for (const line of lines) {
        if (seen.has(line)) {
          issues.push({
            code: 'CATALOG_DUPLICATE_TASK_INSTRUCTION',
            message: `Stage "${stage.id}" task instructions repeat the same line more than once.`,
            entryId: stage.id,
          });
          break;
        }
        seen.add(line);
      }
    }

    if (stage.validationRequirements.length === 0 || stage.validationRequirements.some((r) => r.trim().length === 0)) {
      issues.push({
        code: 'CATALOG_MISSING_VALIDATION_REQUIREMENTS',
        message: `Stage "${stage.id}" has no non-empty validation requirements.`,
        entryId: stage.id,
      });
    } else {
      if (stage.validationRequirements.some((r) => PLACEHOLDER_RE.test(r))) {
        issues.push({
          code: 'CATALOG_MISSING_VALIDATION_REQUIREMENTS',
          message: `Stage "${stage.id}" validation requirements contain placeholder text.`,
          entryId: stage.id,
        });
      }
      const normalized = stage.validationRequirements.map(normalizeForDuplicateCheck);
      if (new Set(normalized).size !== normalized.length) {
        issues.push({
          code: 'CATALOG_DUPLICATE_VALIDATION_REQUIREMENT',
          message: `Stage "${stage.id}" has duplicate validation requirements.`,
          entryId: stage.id,
        });
      }
    }

    if (stage.stopConditions.length === 0 || stage.stopConditions.some((c) => c.trim().length === 0)) {
      issues.push({
        code: 'CATALOG_MISSING_STOP_CONDITIONS',
        message: `Stage "${stage.id}" has no non-empty stop conditions.`,
        entryId: stage.id,
      });
    } else {
      if (stage.stopConditions.some((c) => PLACEHOLDER_RE.test(c))) {
        issues.push({
          code: 'CATALOG_MISSING_STOP_CONDITIONS',
          message: `Stage "${stage.id}" stop conditions contain placeholder text.`,
          entryId: stage.id,
        });
      }
      const normalized = stage.stopConditions.map(normalizeForDuplicateCheck);
      if (new Set(normalized).size !== normalized.length) {
        issues.push({
          code: 'CATALOG_DUPLICATE_STOP_CONDITION',
          message: `Stage "${stage.id}" has duplicate stop conditions.`,
          entryId: stage.id,
        });
      }
    }
  }
}

function checkIds(entries: CatalogEntry[], issues: CatalogValidationIssue[]): void {
  for (const entry of entries) {
    const result = validateCatalogEntryId(entry.id, entry.kind);
    if (!result.valid) {
      issues.push({
        code: 'CATALOG_INVALID_ID',
        message: `Entry "${entry.id}" has an invalid ID: ${result.reason}`,
        entryId: entry.id,
      });
    }
  }
}

function checkDuplicateIds(entries: CatalogEntry[], issues: CatalogValidationIssue[]): Map<string, CatalogEntry> {
  const byId = new Map<string, CatalogEntry>();
  const duplicates = new Set<string>();
  for (const entry of entries) {
    if (byId.has(entry.id)) {
      duplicates.add(entry.id);
    } else {
      byId.set(entry.id, entry);
    }
  }
  for (const id of [...duplicates].sort()) {
    issues.push({
      code: 'CATALOG_DUPLICATE_ID',
      message: `ID "${id}" is used by more than one catalog entry. Every ID must identify exactly one entry.`,
      entryId: id,
    });
  }
  return byId;
}

function checkReference(
  byId: Map<string, CatalogEntry>,
  sourceId: string,
  referencedId: string,
  expectedKind: CatalogEntry['kind'],
  field: string,
  issues: CatalogValidationIssue[],
): void {
  const target = byId.get(referencedId);
  if (!target) {
    issues.push({
      code: 'CATALOG_MISSING_REFERENCE',
      message: `Entry "${sourceId}" references unknown ID "${referencedId}" via "${field}".`,
      entryId: sourceId,
      referencedId,
      relationship: field,
    });
    return;
  }
  if (target.kind !== expectedKind) {
    issues.push({
      code: 'CATALOG_INVALID_REFERENCE_TYPE',
      message: `Entry "${sourceId}" field "${field}" must reference a "${expectedKind}" entry, but "${referencedId}" is a "${target.kind}" entry.`,
      entryId: sourceId,
      referencedId,
      relationship: field,
    });
  }
}

function checkReferences(catalog: InstructionCatalog, byId: Map<string, CatalogEntry>, issues: CatalogValidationIssue[]): void {
  for (const wf of catalog.workflows) {
    for (const stageRef of wf.stageRefs) {
      checkReference(byId, wf.id, stageRef, 'stage', 'stageRefs', issues);
    }
    for (const ruleRef of wf.sharedRuleRefs) {
      checkReference(byId, wf.id, ruleRef, 'rule', 'sharedRuleRefs', issues);
    }
  }

  for (const stage of catalog.stages) {
    checkReference(byId, stage.id, stage.workflowRef, 'workflow', 'workflowRef', issues);
    for (const commandRef of stage.commandRefs) {
      checkReference(byId, stage.id, commandRef, 'command', 'commandRefs', issues);
    }
    for (const ruleRef of stage.ruleRefs) {
      checkReference(byId, stage.id, ruleRef, 'rule', 'ruleRefs', issues);
    }
    for (const commandRef of stage.optionalCommandRefs) {
      checkReference(byId, stage.id, commandRef, 'command', 'optionalCommandRefs', issues);
    }
    for (const ruleRef of stage.optionalRuleRefs) {
      checkReference(byId, stage.id, ruleRef, 'rule', 'optionalRuleRefs', issues);
    }
    if (!stage.reportContractRef) {
      issues.push({
        code: 'CATALOG_MISSING_REPORT_CONTRACT',
        message: `Stage "${stage.id}" has no report-contract reference.`,
        entryId: stage.id,
      });
    } else {
      checkReference(byId, stage.id, stage.reportContractRef, 'report-contract', 'reportContractRef', issues);
    }
  }

  for (const rule of catalog.rules) {
    for (const ruleRef of rule.ruleRefs) {
      checkReference(byId, rule.id, ruleRef, 'rule', 'ruleRefs', issues);
    }
  }
}

function checkWorkflowStageOwnership(catalog: InstructionCatalog, byId: Map<string, CatalogEntry>, issues: CatalogValidationIssue[]): void {
  for (const stage of catalog.stages) {
    const workflow = byId.get(stage.workflowRef);
    if (!workflow || workflow.kind !== 'workflow') continue;
    if (!workflow.stageRefs.includes(stage.id)) {
      issues.push({
        code: 'CATALOG_STAGE_MODE_MISMATCH',
        message: `Stage "${stage.id}" declares workflowRef "${stage.workflowRef}", but that workflow does not list it in stageRefs.`,
        entryId: stage.id,
        referencedId: stage.workflowRef,
        relationship: 'workflowRef',
      });
    }
  }
}

function checkCompatibilityWithRuntime(catalog: InstructionCatalog, issues: CatalogValidationIssue[]): void {
  const runtimeWorkflows = getAllWorkflows();
  const catalogWorkflowByMode = new Map(catalog.workflows.map((wf) => [wf.mode, wf]));

  for (const runtimeWf of runtimeWorkflows) {
    const catalogWf = catalogWorkflowByMode.get(runtimeWf.mode);
    if (!catalogWf) {
      issues.push({
        code: 'CATALOG_UNKNOWN_WORKFLOW',
        message: `Runtime workflow mode "${runtimeWf.mode}" has no corresponding catalog workflow entry.`,
      });
      continue;
    }

    const runtimeStageNames = runtimeWf.stages.map((s) => s.name);
    const catalogStageEntries = catalogWf.stageRefs
      .map((ref) => catalog.stages.find((s) => s.id === ref))
      .filter((s): s is NonNullable<typeof s> => s !== undefined);
    const catalogStageNames = catalogStageEntries.map((s) => s.stageName);

    if (catalogStageNames.length !== runtimeStageNames.length) {
      issues.push({
        code: 'CATALOG_MISSING_STAGE_BINDING',
        message: `Workflow "${runtimeWf.mode}" has ${runtimeStageNames.length} runtime stages but ${catalogStageNames.length} catalog stage entries.`,
        entryId: catalogWf.id,
      });
    }

    for (let i = 0; i < runtimeStageNames.length; i++) {
      if (catalogStageNames[i] !== runtimeStageNames[i]) {
        issues.push({
          code: 'CATALOG_STAGE_ORDER_MISMATCH',
          message: `Workflow "${runtimeWf.mode}" stage order mismatch at position ${i + 1}: runtime has "${runtimeStageNames[i]}", catalog has "${catalogStageNames[i] ?? '(missing)'}".`,
          entryId: catalogWf.id,
        });
      }
    }

    const runtimeSet = new Set(runtimeStageNames);
    for (const stageEntry of catalogStageEntries) {
      if (!runtimeSet.has(stageEntry.stageName)) {
        issues.push({
          code: 'CATALOG_ORPHAN_STAGE_BINDING',
          message: `Catalog stage "${stageEntry.id}" (stageName "${stageEntry.stageName}") has no corresponding runtime stage in workflow "${runtimeWf.mode}".`,
          entryId: stageEntry.id,
        });
      }
    }

    const catalogSet = new Set(catalogStageNames);
    for (const name of runtimeStageNames) {
      if (!catalogSet.has(name)) {
        issues.push({
          code: 'CATALOG_UNKNOWN_STAGE',
          message: `Runtime stage "${name}" in workflow "${runtimeWf.mode}" has no catalog stage entry.`,
        });
      }
    }
  }
}

interface CycleCheckResult {
  ruleId: string;
  cyclePath: string[];
}

function detectRuleCycles(catalog: InstructionCatalog): CycleCheckResult[] {
  const ruleById = new Map<string, InstructionCatalog['rules'][number]>(catalog.rules.map((r) => [r.id, r]));
  const cycles: CycleCheckResult[] = [];
  const seenCycleKeys = new Set<string>();

  for (const startRule of catalog.rules) {
    const path: string[] = [];
    const onPath = new Set<string>();
    const visit = (ruleId: string): void => {
      if (onPath.has(ruleId)) {
        const cycleStart = path.indexOf(ruleId);
        const cyclePath = [...path.slice(cycleStart), ruleId];
        const key = [...cyclePath].sort().join('>');
        if (!seenCycleKeys.has(key)) {
          seenCycleKeys.add(key);
          cycles.push({ ruleId: startRule.id, cyclePath });
        }
        return;
      }
      const rule = ruleById.get(ruleId);
      if (!rule) return;
      path.push(ruleId);
      onPath.add(ruleId);
      for (const ref of rule.ruleRefs) {
        visit(ref);
      }
      path.pop();
      onPath.delete(ruleId);
    };
    visit(startRule.id);
  }

  return cycles;
}

function checkCycles(catalog: InstructionCatalog, issues: CatalogValidationIssue[]): void {
  const cycles = detectRuleCycles(catalog);
  for (const cycle of cycles) {
    issues.push({
      code: 'CATALOG_REFERENCE_CYCLE',
      message: `Rule dependency cycle detected: ${cycle.cyclePath.join(' -> ')}`,
      entryId: cycle.ruleId,
      relationship: 'ruleRefs',
    });
  }
}

export function validateCatalog(catalog: InstructionCatalog): CatalogValidationResult {
  const issues: CatalogValidationIssue[] = [];
  const entries = allEntries(catalog);

  checkIds(entries, issues);
  const byId = checkDuplicateIds(entries, issues);
  checkReferences(catalog, byId, issues);
  checkWorkflowStageOwnership(catalog, byId, issues);
  checkCycles(catalog, issues);
  checkCompatibilityWithRuntime(catalog, issues);
  checkStageInstructionCompleteness(catalog, issues);

  return { valid: issues.length === 0, issues };
}
