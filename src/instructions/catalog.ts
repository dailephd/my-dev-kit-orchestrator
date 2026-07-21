// Deterministic construction of the workflow-instruction catalog.
//
// src/workflows.ts (getAllWorkflows) remains the sole authority for workflow
// modes, stage order, and artifact/prompt filenames. This module only adds
// instruction-catalog identity and cross-references on top of that data; it
// does not duplicate or override it.

import { getAllWorkflows } from '../workflows';
import { STAGE_INSTRUCTION_CONTENT, EMPTY_STAGE_INSTRUCTION_CONTENT } from './stageInstructionContent';
import {
  makeWorkflowId,
  makeStageId,
  makeCommandId,
  makeRuleId,
  makeReportContractId,
  CommandInstructionId,
  RuleInstructionId,
  ReportContractId,
} from './catalogIds';
import {
  InstructionCatalog,
  WorkflowCatalogEntry,
  StageCatalogEntry,
  CommandCatalogEntry,
  RuleCatalogEntry,
  ReportContractCatalogEntry,
  CATALOG_SCHEMA_VERSION,
  CATALOG_VERSION,
} from './catalogTypes';

// ─── Report contracts ───────────────────────────────────────────────────────
// One entry per distinct artifact kind actually produced by a current stage.
// Stage name -> contract name is 1:1 (no two stage names in the runtime
// workflow set collapse to the same artifact kind), so the report-contract
// id is simply `report.<stage-name>`.

interface ReportContractSeed {
  stageName: string;
  artifactKind: string;
  purpose: string;
  requiredOutputCategory: string;
}

const REPORT_CONTRACT_SEEDS: ReportContractSeed[] = [
  { stageName: 'request-brief', artifactKind: 'RequestBrief', purpose: 'Capture the originating request and its scope.', requiredOutputCategory: 'design' },
  { stageName: 'architecture-context', artifactKind: 'ArchitectureContextPacket', purpose: 'Record retrieved architecture and context evidence.', requiredOutputCategory: 'design' },
  { stageName: 'behavior-model', artifactKind: 'BehaviorModel', purpose: 'Describe externally visible and supporting behavior before design.', requiredOutputCategory: 'design' },
  { stageName: 'pseudocode-packet', artifactKind: 'PseudocodePacket', purpose: 'Convert the behavior model into implementation-neutral design.', requiredOutputCategory: 'design' },
  { stageName: 'test-strategy', artifactKind: 'TestStrategyPacket', purpose: 'Derive a traceable test strategy from behavior and pseudocode.', requiredOutputCategory: 'design' },
  { stageName: 'implementation', artifactKind: 'ImplementationReport', purpose: 'Report production-code changes made against the pseudocode packet.', requiredOutputCategory: 'implementation' },
  { stageName: 'test-implementation', artifactKind: 'TestImplementationReport', purpose: 'Report test changes made against the test strategy packet.', requiredOutputCategory: 'implementation' },
  { stageName: 'verification', artifactKind: 'VerificationReport', purpose: 'Record verification commands and their actual results.', requiredOutputCategory: 'verification' },
  { stageName: 'judge', artifactKind: 'JudgeReport', purpose: 'Compare completed work against prior artifacts and issue a verdict.', requiredOutputCategory: 'verification' },
  { stageName: 'final-report', artifactKind: 'FinalReport', purpose: 'Summarize the completed run honestly, including risks and gaps.', requiredOutputCategory: 'reporting' },
  { stageName: 'observed-behavior-report', artifactKind: 'ObservedBehaviorReport', purpose: 'Describe behavior observed to diverge from intended behavior.', requiredOutputCategory: 'design' },
  { stageName: 'behavior-trace', artifactKind: 'BehaviorTrace', purpose: 'Trace observed runtime behavior to its design origin.', requiredOutputCategory: 'design' },
  { stageName: 'divergence-report', artifactKind: 'DivergenceReport', purpose: 'Identify the first divergence point between observed and intended behavior.', requiredOutputCategory: 'design' },
  { stageName: 'correction-design', artifactKind: 'CorrectionDesign', purpose: 'Design a correction before any repair code is written.', requiredOutputCategory: 'design' },
  { stageName: 'regression-test-strategy', artifactKind: 'RegressionTestStrategy', purpose: 'Derive a regression test strategy for the divergence being corrected.', requiredOutputCategory: 'design' },
  { stageName: 'test-target-brief', artifactKind: 'TestTargetBrief', purpose: 'Capture the target behavior for a test-design run.', requiredOutputCategory: 'design' },
  { stageName: 'behavior-reconstruction', artifactKind: 'BehaviorReconstruction', purpose: 'Reconstruct existing behavior for test design.', requiredOutputCategory: 'design' },
  { stageName: 'pseudocode-summary', artifactKind: 'PseudocodeSummary', purpose: 'Summarize existing implementation logic for test design.', requiredOutputCategory: 'design' },
  { stageName: 'refactor-brief', artifactKind: 'RefactorBrief', purpose: 'Capture the goal and boundary of a behavior-preserving refactor.', requiredOutputCategory: 'design' },
  { stageName: 'existing-behavior-map', artifactKind: 'ExistingBehaviorMap', purpose: 'Map behavior that must be preserved through the refactor.', requiredOutputCategory: 'design' },
  { stageName: 'preserved-invariant-list', artifactKind: 'PreservedInvariantList', purpose: 'List invariants the refactor must not violate.', requiredOutputCategory: 'design' },
  { stageName: 'compatibility-test-strategy', artifactKind: 'CompatibilityTestStrategy', purpose: 'Derive tests that prove preserved behavior across the refactor.', requiredOutputCategory: 'design' },
  { stageName: 'refactor-pseudocode-packet', artifactKind: 'RefactorPseudocodePacket', purpose: 'Design the refactor in implementation-neutral terms.', requiredOutputCategory: 'design' },
  { stageName: 'hardening-brief', artifactKind: 'HardeningBrief', purpose: 'Capture the hardening goal and assumptions in scope.', requiredOutputCategory: 'design' },
  { stageName: 'assumption-report', artifactKind: 'AssumptionReport', purpose: 'State assumptions and what breaks if each is false.', requiredOutputCategory: 'design' },
  { stageName: 'failure-mode-matrix', artifactKind: 'FailureModeMatrix', purpose: 'Enumerate relevant failure modes and their handling decision.', requiredOutputCategory: 'design' },
  { stageName: 'guard-pseudocode-packet', artifactKind: 'GuardPseudocodePacket', purpose: 'Design guard and error-state behavior in implementation-neutral terms.', requiredOutputCategory: 'design' },
  { stageName: 'resilience-test-strategy', artifactKind: 'ResilienceTestStrategy', purpose: 'Derive tests that prove guard and failure-mode handling.', requiredOutputCategory: 'design' },
  { stageName: 'source-architecture-context', artifactKind: 'SourceArchitectureContextPacket', purpose: 'Record retrieved architecture and context evidence for the extraction source.', requiredOutputCategory: 'design' },
  { stageName: 'source-workflow-map', artifactKind: 'SourceWorkflowMap', purpose: 'Map the source project workflow being extracted.', requiredOutputCategory: 'design' },
  { stageName: 'porting-map', artifactKind: 'PortingMap', purpose: 'Define what is ported from source to target and what is not.', requiredOutputCategory: 'design' },
  { stageName: 'golden-behavior-contract', artifactKind: 'GoldenBehaviorContract', purpose: 'Define the behavior contract the ported target must satisfy.', requiredOutputCategory: 'design' },
  { stageName: 'target-architecture', artifactKind: 'TargetArchitectureProposal', purpose: 'Propose the target architecture for the ported behavior.', requiredOutputCategory: 'design' },
  { stageName: 'idea-brief', artifactKind: 'IdeaBrief', purpose: 'Capture the greenfield idea and its intended scope.', requiredOutputCategory: 'design' },
  { stageName: 'product-boundary', artifactKind: 'ProductBoundary', purpose: 'Define the product boundary for a new project.', requiredOutputCategory: 'design' },
  { stageName: 'stack-decision', artifactKind: 'StackDecision', purpose: 'Record the technology stack decision for a new project.', requiredOutputCategory: 'design' },
  { stageName: 'starter-profile', artifactKind: 'StarterProfile', purpose: 'Resolve the starter profile used to bootstrap the project.', requiredOutputCategory: 'design' },
  { stageName: 'bootstrap-bundle', artifactKind: 'GreenfieldBootstrapBundleArtifact', purpose: 'Describe the bootstrap bundle used to scaffold the project.', requiredOutputCategory: 'design' },
  { stageName: 'project-docs', artifactKind: 'ProjectDocsReport', purpose: 'Report the baseline documentation produced for the project.', requiredOutputCategory: 'reporting' },
  { stageName: 'scaffold-plan', artifactKind: 'ScaffoldPlan', purpose: 'Plan the initial scaffold before implementation.', requiredOutputCategory: 'design' },
  { stageName: 'scaffold-implementation', artifactKind: 'ScaffoldImplementationReport', purpose: 'Report the scaffold implementation actually produced.', requiredOutputCategory: 'implementation' },
  { stageName: 'first-vertical-slice', artifactKind: 'FirstVerticalSlice', purpose: 'Describe the first vertical slice built on the scaffold.', requiredOutputCategory: 'implementation' },
  { stageName: 'initial-index', artifactKind: 'InitialIndexReport', purpose: 'Report the initial project index produced for the new project.', requiredOutputCategory: 'reporting' },
];

function buildReportContracts(): ReportContractCatalogEntry[] {
  return REPORT_CONTRACT_SEEDS.map((seed) => ({
    id: makeReportContractId(seed.stageName),
    kind: 'report-contract',
    title: seed.artifactKind,
    description: `Report contract for the ${seed.stageName} stage output.`,
    artifactKind: seed.artifactKind,
    purpose: seed.purpose,
    requiredOutputCategory: seed.requiredOutputCategory,
  }));
}

function reportContractIdForStage(stageName: string): ReportContractId {
  return makeReportContractId(stageName);
}

// ─── Commands ───────────────────────────────────────────────────────────────

function buildCommands(): CommandCatalogEntry[] {
  const entries: Array<[string, string, CommandCatalogEntry['sideEffect'], string, string]> = [
    ['my-dev-kit', 'index', 'writes-workspace', 'npx @dailephd/my-dev-kit index', 'Build the retrieval index used for architecture-context stages.'],
    ['my-dev-kit', 'context', 'read-only', 'npx @dailephd/my-dev-kit context', 'Retrieve a focused context capsule for the current request.'],
    ['npm', 'test', 'writes-workspace', 'npm test', 'Run the project test suite as verification evidence.'],
    ['npm', 'typecheck', 'read-only', 'npm run typecheck', 'Run the TypeScript compiler in no-emit mode.'],
    ['npm', 'build', 'writes-workspace', 'npm run build', 'Compile the project to dist/.'],
    ['orchestrator', 'check', 'writes-workspace', 'my-dev-kit-orchestrator check', 'Validate artifact and stage-gate contracts for the current run.'],
    ['git', 'status', 'read-only', 'git status --short --untracked-files=all', 'Inspect working-tree state before making changes.'],
  ];
  return entries.map(([owner, name, sideEffect, command, purpose]) => ({
    id: makeCommandId(owner, name),
    kind: 'command',
    title: `${owner} ${name}`,
    description: `Descriptive command reference for ${owner} ${name}. Never executed by the catalog or resolver.`,
    owner,
    command,
    purpose,
    sideEffect,
  }));
}

// ─── Rules ──────────────────────────────────────────────────────────────────

function buildRules(): RuleCatalogEntry[] {
  const seeds: Array<{
    category: string;
    name: string;
    instruction: string;
    ruleRefs?: RuleInstructionId[];
  }> = [
    {
      category: 'context',
      name: 'report-missing-context',
      instruction: 'If required context is missing, report the gap instead of guessing.',
    },
    {
      category: 'scope',
      name: 'report-blocker-before-broadening',
      instruction: 'Do not broaden scope without reporting a blocker or updating the relevant upstream artifact.',
    },
    {
      category: 'stage',
      name: 'no-pseudocode-before-behavior-model',
      instruction: 'Do not produce a pseudocode packet until the behavior model exists.',
    },
    {
      category: 'stage',
      name: 'no-implementation-before-pseudocode',
      instruction: 'Do not implement production code until the pseudocode packet exists.',
    },
    {
      category: 'stage',
      name: 'no-tests-before-test-strategy',
      instruction: 'Do not write test files until the test strategy packet exists, unless a small direct test patch is explicitly allowed.',
    },
    {
      category: 'verification',
      name: 'require-command-evidence',
      instruction: 'Record the actual commands run, their working directories, and their exit codes as verification evidence.',
    },
    {
      category: 'verification',
      name: 'no-claim-without-evidence',
      instruction: 'Do not claim a check passed unless it was actually run.',
      ruleRefs: [makeRuleId('verification', 'require-command-evidence')],
    },
    {
      category: 'judge',
      name: 'require-pass-verdict',
      instruction: 'Do not mark a run as passed unless the judge report supports PASS.',
    },
  ];
  return seeds.map((seed) => ({
    id: makeRuleId(seed.category, seed.name),
    kind: 'rule',
    title: seed.name,
    description: `Stage-gate rule: ${seed.category}/${seed.name}.`,
    category: seed.category,
    instruction: seed.instruction,
    ruleRefs: seed.ruleRefs ?? [],
  }));
}

const RULE = {
  reportMissingContext: makeRuleId('context', 'report-missing-context'),
  reportBlocker: makeRuleId('scope', 'report-blocker-before-broadening'),
  noPseudocodeBeforeBehaviorModel: makeRuleId('stage', 'no-pseudocode-before-behavior-model'),
  noImplementationBeforePseudocode: makeRuleId('stage', 'no-implementation-before-pseudocode'),
  noTestsBeforeTestStrategy: makeRuleId('stage', 'no-tests-before-test-strategy'),
  requireCommandEvidence: makeRuleId('verification', 'require-command-evidence'),
  noClaimWithoutEvidence: makeRuleId('verification', 'no-claim-without-evidence'),
  requirePassVerdict: makeRuleId('judge', 'require-pass-verdict'),
} as const;

const COMMAND = {
  myDevKitIndex: makeCommandId('my-dev-kit', 'index'),
  myDevKitContext: makeCommandId('my-dev-kit', 'context'),
  npmTest: makeCommandId('npm', 'test'),
  npmTypecheck: makeCommandId('npm', 'typecheck'),
  npmBuild: makeCommandId('npm', 'build'),
} as const;

// Stage-name-keyed binding data (commandRefs, ruleRefs). Every mode-specific
// stage must resolve to a binding entry (falling back to the default of no
// commands/no rules when the stage name has no representative binding yet).
const STAGE_COMMAND_BINDINGS: Record<string, CommandInstructionId[]> = {
  'architecture-context': [COMMAND.myDevKitIndex, COMMAND.myDevKitContext],
  'source-architecture-context': [COMMAND.myDevKitIndex, COMMAND.myDevKitContext],
  'verification': [COMMAND.npmTypecheck, COMMAND.npmTest, COMMAND.npmBuild],
};

const STAGE_RULE_BINDINGS: Record<string, RuleInstructionId[]> = {
  'pseudocode-packet': [RULE.noPseudocodeBeforeBehaviorModel],
  'implementation': [RULE.noImplementationBeforePseudocode],
  'test-implementation': [RULE.noTestsBeforeTestStrategy],
  'verification': [RULE.requireCommandEvidence, RULE.noClaimWithoutEvidence],
  'judge': [RULE.requirePassVerdict],
};

const SHARED_WORKFLOW_RULE_REFS: RuleInstructionId[] = [RULE.reportMissingContext, RULE.reportBlocker];

function stageTitle(stageName: string): string {
  return stageName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function buildInstructionCatalog(): InstructionCatalog {
  const runtimeWorkflows = getAllWorkflows();
  const workflows: WorkflowCatalogEntry[] = [];
  const stages: StageCatalogEntry[] = [];

  for (const wf of runtimeWorkflows) {
    const workflowId = makeWorkflowId(wf.mode);
    const stageRefs = wf.stages.map((s) => makeStageId(wf.mode, s.name));

    workflows.push({
      id: workflowId,
      kind: 'workflow',
      title: `${wf.mode} workflow`,
      description: `Instruction catalog entry for the ${wf.mode} workflow mode.`,
      mode: wf.mode,
      stageRefs,
      sharedRuleRefs: SHARED_WORKFLOW_RULE_REFS,
    });

    for (const stage of wf.stages) {
      const stageId = makeStageId(wf.mode, stage.name);
      const content = STAGE_INSTRUCTION_CONTENT[stageId] ?? EMPTY_STAGE_INSTRUCTION_CONTENT;
      stages.push({
        id: stageId,
        kind: 'stage',
        title: stageTitle(stage.name),
        description: `Instruction catalog entry for the ${stage.name} stage of the ${wf.mode} workflow.`,
        workflowRef: workflowId,
        stageName: stage.name,
        commandRefs: STAGE_COMMAND_BINDINGS[stage.name] ?? [],
        ruleRefs: STAGE_RULE_BINDINGS[stage.name] ?? [],
        optionalCommandRefs: [],
        optionalRuleRefs: [],
        reportContractRef: reportContractIdForStage(stage.name),
        taskInstructions: content.taskInstructions,
        validationRequirements: content.validationRequirements,
        stopConditions: content.stopConditions,
      });
    }
  }

  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    catalogVersion: CATALOG_VERSION,
    workflows,
    stages,
    commands: buildCommands(),
    rules: buildRules(),
    reportContracts: buildReportContracts(),
  };
}
