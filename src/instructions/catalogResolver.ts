// Exact-ID resolver for the workflow-instruction catalog.
//
// No fuzzy matching, no case-insensitive matching, no semantic or
// LLM-assisted selection. Unknown IDs fail with a structured issue.

import {
  CatalogValidationIssue,
  InstructionCatalog,
  ResolutionProvenanceEntry,
  RuleCatalogEntry,
  StageCatalogEntry,
  StageResolveResult,
  WorkflowCatalogEntry,
  WorkflowResolveResult,
} from './catalogTypes';

function issue(code: CatalogValidationIssue['code'], message: string, extra?: Partial<CatalogValidationIssue>): CatalogValidationIssue {
  return { code, message, ...extra };
}

export function resolveWorkflow(catalog: InstructionCatalog, workflowId: string): WorkflowResolveResult {
  const workflow = catalog.workflows.find((wf) => wf.id === workflowId);
  if (!workflow) {
    return {
      ok: false,
      issues: [issue('CATALOG_UNKNOWN_WORKFLOW', `Unknown workflow ID: "${workflowId}"`)],
    };
  }
  return { ok: true, result: workflow };
}

function findStage(catalog: InstructionCatalog, stageId: string): StageCatalogEntry | undefined {
  return catalog.stages.find((s) => s.id === stageId);
}

export function resolveStageByWorkflowAndName(
  catalog: InstructionCatalog,
  workflowId: string,
  stageName: string,
): StageResolveResult {
  const workflowResult = resolveWorkflow(catalog, workflowId);
  if (!workflowResult.ok) return workflowResult;
  const workflow = workflowResult.result;

  const stage = workflow.stageRefs
    .map((ref) => findStage(catalog, ref))
    .find((s) => s !== undefined && s.stageName === stageName);

  if (!stage) {
    return {
      ok: false,
      issues: [
        issue(
          'CATALOG_UNKNOWN_STAGE',
          `Workflow "${workflowId}" has no stage named "${stageName}".`,
          { entryId: workflowId },
        ),
      ],
    };
  }

  return resolveStageInternal(catalog, workflow, stage);
}

export function resolveStage(catalog: InstructionCatalog, stageId: string): StageResolveResult {
  const stage = findStage(catalog, stageId);
  if (!stage) {
    return {
      ok: false,
      issues: [issue('CATALOG_UNKNOWN_STAGE', `Unknown stage ID: "${stageId}"`)],
    };
  }
  const workflowResult = resolveWorkflow(catalog, stage.workflowRef);
  if (!workflowResult.ok) return workflowResult;
  return resolveStageInternal(catalog, workflowResult.result, stage);
}

export function resolveStageForWorkflow(
  catalog: InstructionCatalog,
  workflowId: string,
  stageId: string,
): StageResolveResult {
  const stage = findStage(catalog, stageId);
  if (!stage) {
    return {
      ok: false,
      issues: [issue('CATALOG_UNKNOWN_STAGE', `Unknown stage ID: "${stageId}"`)],
    };
  }
  if (stage.workflowRef !== workflowId) {
    return {
      ok: false,
      issues: [
        issue(
          'CATALOG_STAGE_MODE_MISMATCH',
          `Stage "${stageId}" belongs to workflow "${stage.workflowRef}", not "${workflowId}".`,
          { entryId: stageId, referencedId: workflowId },
        ),
      ],
    };
  }
  const workflowResult = resolveWorkflow(catalog, workflowId);
  if (!workflowResult.ok) return workflowResult;
  return resolveStageInternal(catalog, workflowResult.result, stage);
}

function resolveStageInternal(
  catalog: InstructionCatalog,
  workflow: WorkflowCatalogEntry,
  stage: StageCatalogEntry,
): StageResolveResult {
  const issues: CatalogValidationIssue[] = [];
  const provenance: ResolutionProvenanceEntry[] = [];

  const commandsById = new Map(catalog.commands.map((c) => [c.id, c]));
  const rulesById = new Map(catalog.rules.map((r) => [r.id, r]));
  const reportContractsById = new Map(catalog.reportContracts.map((r) => [r.id, r]));

  const commands = [];
  for (const commandRef of [...stage.commandRefs].sort()) {
    const command = commandsById.get(commandRef);
    if (!command) {
      issues.push(
        issue('CATALOG_MISSING_REFERENCE', `Stage "${stage.id}" references unknown command "${commandRef}".`, {
          entryId: stage.id,
          referencedId: commandRef,
          relationship: 'commandRefs',
        }),
      );
      continue;
    }
    commands.push(command);
    provenance.push({
      rootWorkflowId: workflow.id,
      rootStageId: stage.id,
      sourceEntryId: stage.id,
      referenceField: 'commandRefs',
      referencedEntryId: command.id,
      inclusionReason: 'direct-stage-command',
      depth: 0,
    });
  }

  const ruleResolution = resolveTransitiveRules(
    workflow,
    stage,
    [...workflow.sharedRuleRefs, ...stage.ruleRefs],
    rulesById,
  );
  issues.push(...ruleResolution.issues);
  provenance.push(...ruleResolution.provenance);

  const reportContract = reportContractsById.get(stage.reportContractRef);
  if (!reportContract) {
    issues.push(
      issue(
        'CATALOG_MISSING_REPORT_CONTRACT',
        `Stage "${stage.id}" references unknown report contract "${stage.reportContractRef}".`,
        { entryId: stage.id, referencedId: stage.reportContractRef },
      ),
    );
  } else {
    provenance.push({
      rootWorkflowId: workflow.id,
      rootStageId: stage.id,
      sourceEntryId: stage.id,
      referenceField: 'reportContractRef',
      referencedEntryId: reportContract.id,
      inclusionReason: 'direct-stage-report-contract',
      depth: 0,
    });
  }

  if (issues.length > 0 || !reportContract) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    result: {
      workflow,
      stage,
      commands,
      rules: ruleResolution.rules,
      reportContract,
      provenance: sortProvenance(provenance),
    },
  };
}

interface TransitiveRuleResolution {
  rules: RuleCatalogEntry[];
  issues: CatalogValidationIssue[];
  provenance: ResolutionProvenanceEntry[];
}

function resolveTransitiveRules(
  workflow: WorkflowCatalogEntry,
  stage: StageCatalogEntry,
  rootRuleRefs: string[],
  rulesById: Map<string, RuleCatalogEntry>,
): TransitiveRuleResolution {
  const issues: CatalogValidationIssue[] = [];
  const provenance: ResolutionProvenanceEntry[] = [];
  const included = new Map<string, RuleCatalogEntry>();
  const depthById = new Map<string, number>();

  const visit = (ruleId: string, depth: number, sourceEntryId: string, field: string, reason: string, visiting: Set<string>): void => {
    if (visiting.has(ruleId)) {
      issues.push(
        issue('CATALOG_REFERENCE_CYCLE', `Rule dependency cycle detected while resolving "${ruleId}".`, {
          entryId: ruleId,
          relationship: 'ruleRefs',
        }),
      );
      return;
    }
    const rule = rulesById.get(ruleId);
    if (!rule) {
      issues.push(
        issue('CATALOG_MISSING_REFERENCE', `Entry "${sourceEntryId}" references unknown rule "${ruleId}" via "${field}".`, {
          entryId: sourceEntryId,
          referencedId: ruleId,
          relationship: field,
        }),
      );
      return;
    }
    if (!included.has(ruleId) || (depthById.get(ruleId) ?? Infinity) > depth) {
      included.set(ruleId, rule);
      depthById.set(ruleId, depth);
      provenance.push({
        rootWorkflowId: workflow.id,
        rootStageId: stage.id,
        sourceEntryId,
        referenceField: field,
        referencedEntryId: ruleId,
        inclusionReason: reason,
        depth,
      });
    }
    const nextVisiting = new Set(visiting).add(ruleId);
    for (const nested of [...rule.ruleRefs].sort()) {
      visit(nested, depth + 1, ruleId, 'ruleRefs', 'transitive-rule-dependency', nextVisiting);
    }
  };

  for (const ruleId of [...rootRuleRefs].sort()) {
    visit(ruleId, 0, stage.id, 'ruleRefs', 'direct-stage-or-shared-rule', new Set());
  }

  const rules = [...included.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { rules, issues, provenance };
}

function sortProvenance(entries: ResolutionProvenanceEntry[]): ResolutionProvenanceEntry[] {
  return [...entries].sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.referenceField !== b.referenceField) return a.referenceField.localeCompare(b.referenceField);
    if (a.sourceEntryId !== b.sourceEntryId) return a.sourceEntryId.localeCompare(b.sourceEntryId);
    return a.referencedEntryId.localeCompare(b.referencedEntryId);
  });
}
