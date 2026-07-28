import * as fs from 'fs';
import * as path from 'path';
import { WorkflowMode } from './types';
import { RunMetadata } from './run';
import { CorrectionRouteResult } from './correctionRouter';
import {
  renderScaffoldPlanPrompt,
  renderScaffoldImplementationPrompt,
} from './greenfield/scaffold/renderScaffoldPrompt';
import { buildInstructionCatalog } from './instructions/catalog';
import { renderWorkflowInstructionPacket } from './instructions/workflowInstructionPacketRenderer';
import { serializeWorkflowInstructionPacket } from './instructions/workflowInstructionPacketSerialization';
import {
  assembleStageContextBundle,
  RepositoryEvidenceReference,
  StageContextBundle,
  UpstreamArtifactReference,
} from './instructions/stageContextBundle';
import { writeSupplementalContextTemplates } from './instructions/supplementalContextTemplates';
import { ContextReadinessBlockerSummary, ContextReadinessResult } from './instructions/contextReadiness';
import { RunContextReadinessSummary } from './instructions/runContextReadiness';

interface PromptContext {
  stage: string;
  mode: WorkflowMode;
  runId: string;
  projectRoot: string;
  runFolder: string;
  stageNumber: number;
  totalStages: number;
  sourceRepoRoot?: string;
  targetRepoRoot?: string;
  // Bounded, packet-backed rendering of this stage's catalog-owned task
  // instructions, commands, rules, validation requirements, stop conditions,
  // and report-contract summary (see renderStageInstructionBlock()). Every
  // native stage prompt function interpolates this instead of hardcoding its
  // own Task:/Stop conditions: text, so that content is never duplicated
  // between the catalog and promptGenerator.ts.
  stageInstructionText: string;
}

function renderCanonicalBlockerLines(
  blocker: ContextReadinessBlockerSummary,
  indent: string,
): string[] {
  return [
    `${indent}Primary blocker: ${blocker.primaryCode}`,
    `${indent}Primary reason: ${blocker.primaryReason}`,
    `${indent}Blocking issues: ${blocker.blockingIssueCodes.join(', ')}`,
    `${indent}Corrective action: ${blocker.correctiveAction}`,
    `${indent}Evidence target: ${blocker.evidenceTarget}`,
  ];
}

// Assembles the exact StageContextBundle for one workflow/stage and renders
// its packet into bounded instruction text. Called once per generated
// prompt (see generateStagePrompt() and generateCorrectionPrompt()) -- it
// does not execute any command, read repository content, or persist
// anything; it only composes already-validated in-memory catalog data.
function assembleStageContextBundleOrThrow(
  meta: RunMetadata,
  selectedStage: string,
  upstreamArtifacts: UpstreamArtifactReference[] = [],
  correctionState?: CorrectionRouteResult,
): StageContextBundle {
  const result = assembleStageContextBundle({
    catalog: buildInstructionCatalog(),
    runMetadata: meta,
    selectedStage,
    upstreamArtifacts,
    correctionState,
  });
  if (!result.ok) {
    throw new Error(
      `Failed to assemble stage context bundle for workflow.${meta.mode} / stage.${meta.mode}.${selectedStage}: ` +
        result.issues.map((i) => `${i.code}: ${i.message}`).join('; '),
    );
  }
  return result.bundle;
}

// Renders the "Repository evidence:" section for one of the 11 exact
// context-sensitive stages. Structural status (Batch 4) plus, when a
// readiness evaluation is available (Batch 5), the deterministic readiness
// decision that governs whether this stage's normal work is allowed to
// proceed -- see renderContextRefreshOnlyPrompt() for the blocked case.
function renderRepositoryEvidenceSection(ref: RepositoryEvidenceReference, readiness?: ContextReadinessResult): string {
  const lines = [
    'Repository evidence:',
    `  Expected role: ${ref.role}`,
    `  Context packet: ${ref.packetPath}`,
    `  Context packet status: ${ref.packetStatus}`,
    `  Retrieval report: ${ref.reportPath}`,
    `  Retrieval report status: ${ref.reportStatus}`,
    `  Aggregate status: ${ref.status}`,
    `  Declared freshness: ${ref.declaredFreshness ?? 'unknown'}`,
    `  Declared adequacy: ${ref.declaredAdequacy ?? 'unknown'}`,
    `  Enforcement: ${ref.enforcement}`,
    `  Automatic retrieval: disabled`,
  ];
  if (ref.issues.length > 0) {
    lines.push('  Issues:');
    for (const issue of ref.issues) lines.push(`    - ${issue.code}: ${issue.message}`);
  }
  if (readiness) {
    lines.push(`  Context readiness decision: ${readiness.decision}`);
    lines.push(`  Evaluated freshness: ${readiness.evaluatedFreshness}`);
    lines.push(`  Evaluated adequacy: ${readiness.evaluatedAdequacy}`);
    if (readiness.readyWithAssumptions) lines.push('  Ready with assumptions: yes -- review declared assumptions before relying on this evidence.');
    if (readiness.criticalResponsibilitySummary) {
      const s = readiness.criticalResponsibilitySummary;
      lines.push(
        `  Critical responsibility mapping: ${s.criticalMapped}/${s.criticalResponsibilities} critical responsibilities fully mapped.`,
      );
    }
  }
  lines.push(
    '  Notes: my-dev-kit is not run automatically by this orchestrator. These files are supplemental',
    '  repository evidence -- template placeholders are not evidence; read populated documents before',
    '  starting work.',
  );
  return lines.join('\n');
}

// Renders the "Context readiness review:" section for a non-greenfield
// verification or judge stage, which reviews every mode-required context
// kind rather than owning a single direct reference (Batch 5 sections
// 16-17).
function renderContextReadinessReviewSection(summary: RunContextReadinessSummary, stageKind: 'verification' | 'judge'): string {
  const lines = ['Context readiness review:', `  Overall decision: ${summary.overallDecision}`];

  for (const [label, result] of [
    ['Implementation context', summary.implementationContext],
    ['Test context', summary.testContext],
  ] as const) {
    if (!result) continue;
    lines.push(`  ${label}:`);
    lines.push(`    decision: ${result.decision}`);
    lines.push(`    classification: ${result.classification}`);
    lines.push(`    evaluated freshness: ${result.evaluatedFreshness}`);
    lines.push(`    evaluated adequacy: ${result.evaluatedAdequacy}`);
    if (result.blockerSummary) lines.push(...renderCanonicalBlockerLines(result.blockerSummary, '    '));
    if (result.criticalResponsibilitySummary) {
      const s = result.criticalResponsibilitySummary;
      lines.push(`    critical responsibility mapping: ${s.criticalMapped}/${s.criticalResponsibilities} fully mapped`);
    }
  }

  if (summary.overallDecision === 'ready') {
    lines.push(
      stageKind === 'verification'
        ? '  All required repository context is ready. Compare the implementation and tests against this evidence before running verification commands.'
        : '  All required repository context is ready. Judge freely on the complete evidence.',
    );
  } else {
    if (summary.primaryBlocker) {
      lines.push('  Canonical run blocker:');
      lines.push(...renderCanonicalBlockerLines(summary.primaryBlocker, '    '));
    }
    lines.push(`  Recommended next stage: ${summary.recommendedNextStage ?? '(none)'}`);
    lines.push(
      stageKind === 'verification'
        ? '  Required context is not ready: do not claim the work is verified. Do not run normal behavioral verification commands.'
        : '  Required context is not ready: this stage must return "Verdict: NEED_CONTEXT" with the recommended next stage above. Do not return PASS.',
    );
  }
  return lines.join('\n');
}

function renderStageInstructionBlockFromBundle(bundle: StageContextBundle): string {
  const packetText = renderWorkflowInstructionPacket(bundle.workflowInstructionPacket);
  if (bundle.repositoryEvidenceReference) {
    return `${renderRepositoryEvidenceSection(bundle.repositoryEvidenceReference, bundle.repositoryContextReadiness)}\n\n${packetText}`;
  }
  if (bundle.runContextReadinessSummary) {
    const stageKind = bundle.taskState.selectedStage === 'judge' ? 'judge' : 'verification';
    return `${renderContextReadinessReviewSection(bundle.runContextReadinessSummary, stageKind)}\n\n${packetText}`;
  }
  return packetText;
}

function renderStageInstructionBlock(
  meta: RunMetadata,
  selectedStage: string,
  upstreamArtifacts: UpstreamArtifactReference[] = [],
  correctionState?: CorrectionRouteResult,
): string {
  const bundle = assembleStageContextBundleOrThrow(meta, selectedStage, upstreamArtifacts, correctionState);
  return renderStageInstructionBlockFromBundle(bundle);
}

// Renders a context-refresh-only prompt for a blocked direct stage
// (implementation or test-implementation) instead of its normal
// packet-backed work prompt (AGENTS.txt Batch 5 section 14.2/14.3). No new
// persisted artifact is introduced -- the coding agent reports the refresh
// outcome directly in its response rather than writing a file.
function renderContextRefreshOnlyPrompt(ctx: PromptContext, readiness: ContextReadinessResult): string {
  const lines: string[] = [header(ctx)];
  lines.push('This stage is BLOCKED on repository context. Normal stage work is prohibited until context is refreshed.');
  lines.push('');
  lines.push(`Context kind: ${readiness.kind}`);
  lines.push(`Expected role: ${readiness.role}`);
  lines.push(`Context packet: ${readiness.packetPath}`);
  lines.push(`Retrieval report: ${readiness.reportPath}`);
  if (readiness.sourceCapsulePath) lines.push(`Source context capsule: ${readiness.sourceCapsulePath}`);
  if (readiness.sourceAuditPath) lines.push(`Source retrieval audit: ${readiness.sourceAuditPath}`);
  lines.push(`Readiness decision: ${readiness.decision}`);
  lines.push(`Classification: ${readiness.classification}`);
  lines.push('');
  if (readiness.blockerSummary) {
    lines.push('Blocking issues:');
    lines.push(...renderCanonicalBlockerLines(readiness.blockerSummary, '  '));
    lines.push('');
  }
  if (readiness.warnings.length > 0) {
    lines.push('Warnings:');
    for (const w of readiness.warnings) lines.push(`  - ${w}`);
    lines.push('');
  }
  if (readiness.affectedResponsibilityIds.length > 0) {
    lines.push(`Affected responsibility IDs: ${readiness.affectedResponsibilityIds.join(', ')}`);
    lines.push('');
  }
  lines.push('Required refresh actions:');
  lines.push('  1. Populate or repair the context packet and retrieval report referenced above.');
  lines.push('  2. Run my-dev-kit manually (this orchestrator does not execute it automatically):');
  lines.push('       <MY_DEV_KIT_CLI> context --request <REQUEST_FILE> --json');
  lines.push('  3. Record the resulting context capsule and retrieval audit paths in the packet/report');
  lines.push('     "Source context capsule:" / "Source retrieval audit:" fields, replacing "unknown".');
  lines.push('  4. Set Status: populated and resolve the blocking issues listed above.');
  lines.push('');
  lines.push('Automatic retrieval: disabled.');
  lines.push('');
  lines.push('Stop conditions:');
  lines.push('  - do not modify production code');
  lines.push('  - do not write test files');
  lines.push('  - do not write the normal stage report artifact for this stage');
  lines.push('  - do not claim this stage is complete');
  lines.push('  - stop after refreshing or repairing the context evidence');
  lines.push('');
  lines.push('Return format:');
  lines.push('Do not write a new artifact file for this report. In your response, report:');
  lines.push('  Context refresh report');
  lines.push('  Stage: ' + ctx.stage);
  lines.push('  Actions taken: ...');
  lines.push('  Remaining blocking issues, if any: ...');
  lines.push('  Status: refreshed | still-blocked');
  lines.push('');
  lines.push('After refreshing, rerun `my-dev-kit-orchestrator prompt` for this stage and `my-dev-kit-orchestrator check` to confirm readiness.');
  return lines.join('\n');
}

function header(ctx: PromptContext): string {
  const lines = [
    `Stage: ${ctx.stage}`,
    `Workflow mode: ${ctx.mode}`,
    `Run ID: ${ctx.runId}`,
    `Project root: ${ctx.projectRoot}`,
    `Run folder: ${ctx.runFolder}`,
  ];
  if (ctx.sourceRepoRoot) lines.push(`Source repository: ${ctx.sourceRepoRoot}`);
  if (ctx.targetRepoRoot) lines.push(`Target repository: ${ctx.targetRepoRoot}`);
  lines.push('');
  return lines.join('\n');
}

// ─── Core shared stages ───────────────────────────────────────────────────────

function requestBriefPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- original request: ${ctx.runFolder}/00-request.txt

${ctx.stageInstructionText}

Required output artifact: RequestBrief
Output file: ${ctx.runFolder}/artifacts/request-brief.txt

Return format:
Produce the artifact as a plain-text file using the template:
  Artifact: RequestBrief
  Workflow mode: ...
  Original request: ...
  Requested change: ...
  Target area: ...
  User-visible or external behavior: ...
  Constraints: ...
  Non-goals: ...
  Success criteria: ...
  Ambiguity or missing information: ...
  Expected next stage: architecture-context
  Status: complete | incomplete | blocked
`;
}

function architectureContextPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- project root: ${ctx.projectRoot}

${ctx.stageInstructionText}

Required output artifact: ArchitectureContextPacket
Output file: ${ctx.runFolder}/artifacts/architecture-context-packet.txt
Supporting report output file: ${ctx.runFolder}/reports/architecture-context-retrieval-report.txt

Return format:

Write the supporting retrieval report using this template:

  Retrieval evidence report

  Index artifacts used:
  - Index directory:
  - Refreshed or reused:
  - manifest.json status:
  - Semantic artifacts available:

  Search queries run:
  - Query:
    Reason:

  Candidate nodes selected:
  - Node ID:
    Reason:

  Lookup commands run:
  - Node ID:
    Useful relationships found:

  Graph slices created:
  - Focus node:
  - Depth:
  - Direction:
  - Output path:
  - Reason:

  Source symbols retrieved:
  - Symbol node ID:
  - File path:
  - Reason:

  Line-range fallback retrieval used:
  - File path or none:
  - Lines:
  - Reason:

  Full files read beyond retrieved source:
  - File path or none:
  - Reason:
  - Missing context provided:

  Semantic artifacts inspected:
  - Artifact or command:
  - Reason:

  Context gaps or uncertainty:
  - Gap:
    Impact:

Then write ArchitectureContextPacket using this template:

  Artifact: ArchitectureContextPacket
  Workflow mode: ...
  Project root: ...

  Retrieval evidence used:
  - Retrieval report: ${ctx.runFolder}/reports/architecture-context-retrieval-report.txt
  - Index directory:
  - Graph slice files:
  - Source excerpts:
  - Semantic artifacts:

  Retrieval method:
  - my-dev-kit used: yes | no
  - graph-guided retrieval used: yes | no
  - manual inspection used: yes | no

  Relevant files: ...
  Relevant symbols: ...
  Relevant components / modules / commands / routes / services / boundaries: ...
  Relevant tests: ...
  Relevant docs: ...
  State owners: ...
  Data owners: ...
  Upstream dependencies: ...
  Downstream consumers: ...
  Existing patterns to preserve: ...
  Likely files or modules involved: ...
  Context gaps or uncertainty: ...
  Selection rationale: ...
  Expected next stage: (next in workflow)
  Status: complete | incomplete | blocked
`;
}

function behaviorModelPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

${ctx.stageInstructionText}

Required output artifact: BehaviorModel
Output file: ${ctx.runFolder}/artifacts/behavior-model.txt

Return format:
Produce the artifact as a plain-text file following the BehaviorModel template.
  Artifact: BehaviorModel
  Workflow mode: ...
  Inputs used: ...
  Behavior summary: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function pseudocodePacketPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt

${ctx.stageInstructionText}

Required output artifact: PseudocodePacket
Output file: ${ctx.runFolder}/artifacts/pseudocode-packet.txt

Return format:
Produce the artifact as a plain-text file following the PseudocodePacket template.
  Artifact: PseudocodePacket
  Workflow mode: ...
  Inputs used: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function testStrategyPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt
- ${ctx.runFolder}/artifacts/pseudocode-packet.txt

${ctx.stageInstructionText}

Required output artifact: TestStrategyPacket
Output file: ${ctx.runFolder}/artifacts/test-strategy-packet.txt

Return format:
Produce the artifact as a plain-text file following the TestStrategyPacket template.
  Artifact: TestStrategyPacket
  Workflow mode: ...
  Inputs used: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function implementationPrompt(ctx: PromptContext, extraInputs: string[] = []): string {
  const inputs = [
    `- ${ctx.runFolder}/artifacts/request-brief.txt`,
    `- ${ctx.runFolder}/artifacts/architecture-context-packet.txt`,
    `- ${ctx.runFolder}/artifacts/behavior-model.txt`,
    `- ${ctx.runFolder}/artifacts/pseudocode-packet.txt`,
    ...extraInputs.map((i) => `- ${ctx.runFolder}/artifacts/${i}`),
  ].join('\n');

  return `${header(ctx)}
Inputs:
${inputs}

${ctx.stageInstructionText}

Required output artifact: ImplementationReport
Output file: ${ctx.runFolder}/artifacts/implementation-report.txt

Return format:
Produce the artifact as a plain-text file following the ImplementationReport template.
  Artifact: ImplementationReport
  Workflow mode: ...
  Inputs used: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function testImplementationPrompt(ctx: PromptContext, extraInputs: string[] = []): string {
  const inputs = [
    `- ${ctx.runFolder}/artifacts/behavior-model.txt`,
    `- ${ctx.runFolder}/artifacts/pseudocode-packet.txt`,
    `- ${ctx.runFolder}/artifacts/test-strategy-packet.txt`,
    ...extraInputs.map((i) => `- ${ctx.runFolder}/artifacts/${i}`),
    `- ${ctx.runFolder}/artifacts/implementation-report.txt (if available)`,
  ].join('\n');

  return `${header(ctx)}
Inputs:
${inputs}

${ctx.stageInstructionText}

Required output artifact: TestImplementationReport
Output file: ${ctx.runFolder}/artifacts/test-implementation-report.txt

Return format:
Produce the artifact as a plain-text file following the TestImplementationReport template.
  Artifact: TestImplementationReport
  Workflow mode: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function verificationPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/test-strategy-packet.txt
- ${ctx.runFolder}/artifacts/implementation-report.txt
- ${ctx.runFolder}/artifacts/test-implementation-report.txt

${ctx.stageInstructionText}

Required output artifact: VerificationReport
Output file: ${ctx.runFolder}/artifacts/verification-report.txt

Return format:
Produce the artifact as a plain-text file following the VerificationReport template.
  Artifact: VerificationReport
  Workflow mode: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function judgePrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt (or mode-specific entry artifact)
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt (or reconstruction)
- ${ctx.runFolder}/artifacts/pseudocode-packet.txt (or mode-specific equivalent)
- ${ctx.runFolder}/artifacts/test-strategy-packet.txt (or mode-specific strategy)
- ${ctx.runFolder}/artifacts/implementation-report.txt
- ${ctx.runFolder}/artifacts/test-implementation-report.txt
- ${ctx.runFolder}/artifacts/verification-report.txt

${ctx.stageInstructionText}

Required output artifact: JudgeReport
Output file: ${ctx.runFolder}/artifacts/judge-report.txt

Return format:
Produce the artifact as a plain-text file.
  Artifact: JudgeReport
  Workflow mode: ...
  Verdict: ...
  Recommended next stage if not PASS: ...
  Status: complete
`;
}

function finalReportPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/judge-report.txt
- ${ctx.runFolder}/artifacts/verification-report.txt
- ${ctx.runFolder}/artifacts/request-brief.txt (or mode-specific entry artifact)
- major design and implementation artifacts

${ctx.stageInstructionText}

Required output artifact: FinalReport
Output file: ${ctx.runFolder}/artifacts/final-report.txt

Return format:
Produce the artifact as a plain-text file following the FinalReport template.
  Artifact: FinalReport
  Workflow mode: ...
  Run ID: ...
  [all required sections]
  Status: complete
`;
}

// ─── Repair-specific stages ───────────────────────────────────────────────────

function observedBehaviorReportPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- original request / observed behavior description: ${ctx.runFolder}/00-request.txt

${ctx.stageInstructionText}

Required output artifact: ObservedBehaviorReport
Output file: ${ctx.runFolder}/artifacts/observed-behavior-report.txt

Return format:
Produce the artifact as a plain-text file following the ObservedBehaviorReport template.
  Artifact: ObservedBehaviorReport
  Observed behavior: ...
  Expected behavior: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function behaviorTracePrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/observed-behavior-report.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

${ctx.stageInstructionText}

Required output artifact: BehaviorTrace
Output file: ${ctx.runFolder}/artifacts/behavior-trace.txt

Return format:
  Artifact: BehaviorTrace
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function divergenceReportPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/observed-behavior-report.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/behavior-trace.txt

${ctx.stageInstructionText}

Required output artifact: DivergenceReport
Output file: ${ctx.runFolder}/artifacts/divergence-report.txt

Return format:
  Artifact: DivergenceReport
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function correctionDesignPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/observed-behavior-report.txt
- ${ctx.runFolder}/artifacts/behavior-trace.txt
- ${ctx.runFolder}/artifacts/divergence-report.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

${ctx.stageInstructionText}

Required output artifact: CorrectionDesign
Output file: ${ctx.runFolder}/artifacts/correction-design.txt

Return format:
  Artifact: CorrectionDesign
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function regressionTestStrategyPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/divergence-report.txt
- ${ctx.runFolder}/artifacts/correction-design.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

${ctx.stageInstructionText}

Required output artifact: RegressionTestStrategy
Output file: ${ctx.runFolder}/artifacts/regression-test-strategy.txt

Return format:
  Artifact: RegressionTestStrategy
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

// ─── Test-mode-specific stages ────────────────────────────────────────────────

function testTargetBriefPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- original test target description: ${ctx.runFolder}/00-request.txt

${ctx.stageInstructionText}

Required output artifact: TestTargetBrief
Output file: ${ctx.runFolder}/artifacts/test-target-brief.txt

Return format:
  Artifact: TestTargetBrief
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function behaviorReconstructionPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/test-target-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

${ctx.stageInstructionText}

Required output artifact: BehaviorReconstruction
Output file: ${ctx.runFolder}/artifacts/behavior-reconstruction.txt

Return format:
  Artifact: BehaviorReconstruction
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function pseudocodeSummaryPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/test-target-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/behavior-reconstruction.txt

${ctx.stageInstructionText}

Required output artifact: PseudocodeSummary
Output file: ${ctx.runFolder}/artifacts/pseudocode-summary.txt

Return format:
  Artifact: PseudocodeSummary
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

// ─── Refactor-mode-specific stages ───────────────────────────────────────────

function refactorBriefPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- original refactor goal: ${ctx.runFolder}/00-request.txt

${ctx.stageInstructionText}

Required output artifact: RefactorBrief
Output file: ${ctx.runFolder}/artifacts/refactor-brief.txt

Return format:
  Artifact: RefactorBrief
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function existingBehaviorMapPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/refactor-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

${ctx.stageInstructionText}

Required output artifact: ExistingBehaviorMap
Output file: ${ctx.runFolder}/artifacts/existing-behavior-map.txt

Return format:
  Artifact: ExistingBehaviorMap
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function preservedInvariantListPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/refactor-brief.txt
- ${ctx.runFolder}/artifacts/existing-behavior-map.txt

${ctx.stageInstructionText}

Required output artifact: PreservedInvariantList
Output file: ${ctx.runFolder}/artifacts/preserved-invariant-list.txt

Return format:
  Artifact: PreservedInvariantList
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function compatibilityTestStrategyPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/existing-behavior-map.txt
- ${ctx.runFolder}/artifacts/preserved-invariant-list.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

${ctx.stageInstructionText}

Required output artifact: CompatibilityTestStrategy
Output file: ${ctx.runFolder}/artifacts/compatibility-test-strategy.txt

Return format:
  Artifact: CompatibilityTestStrategy
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function refactorPseudocodePacketPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/refactor-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/existing-behavior-map.txt
- ${ctx.runFolder}/artifacts/preserved-invariant-list.txt
- ${ctx.runFolder}/artifacts/compatibility-test-strategy.txt

${ctx.stageInstructionText}

Required output artifact: RefactorPseudocodePacket
Output file: ${ctx.runFolder}/artifacts/refactor-pseudocode-packet.txt

Return format:
  Artifact: RefactorPseudocodePacket
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

// ─── Harden-mode-specific stages ─────────────────────────────────────────────

function hardeningBriefPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- original hardening goal: ${ctx.runFolder}/00-request.txt

${ctx.stageInstructionText}

Required output artifact: HardeningBrief
Output file: ${ctx.runFolder}/artifacts/hardening-brief.txt

Return format:
  Artifact: HardeningBrief
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function assumptionReportPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/hardening-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

${ctx.stageInstructionText}

Required output artifact: AssumptionReport
Output file: ${ctx.runFolder}/artifacts/assumption-report.txt

Return format:
  Artifact: AssumptionReport
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function failureModeMatrixPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/hardening-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/assumption-report.txt

${ctx.stageInstructionText}

Required output artifact: FailureModeMatrix
Output file: ${ctx.runFolder}/artifacts/failure-mode-matrix.txt

Return format:
  Artifact: FailureModeMatrix
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function guardPseudocodePacketPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/hardening-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/assumption-report.txt
- ${ctx.runFolder}/artifacts/failure-mode-matrix.txt

${ctx.stageInstructionText}

Required output artifact: GuardPseudocodePacket
Output file: ${ctx.runFolder}/artifacts/guard-pseudocode-packet.txt

Return format:
  Artifact: GuardPseudocodePacket
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function resilienceTestStrategyPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/assumption-report.txt
- ${ctx.runFolder}/artifacts/failure-mode-matrix.txt
- ${ctx.runFolder}/artifacts/guard-pseudocode-packet.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

${ctx.stageInstructionText}

Required output artifact: ResilienceTestStrategy
Output file: ${ctx.runFolder}/artifacts/resilience-test-strategy.txt

Return format:
  Artifact: ResilienceTestStrategy
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

// ─── Extraction-mode-specific stages ─────────────────────────────────────────

function extractionRequestBriefPrompt(ctx: PromptContext): string {
  const sourceDir = ctx.sourceRepoRoot ?? '<source-repo-root>';
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- original extraction request: ${ctx.runFolder}/00-request.txt

${ctx.stageInstructionText}

Required output artifact: ExtractionRequestBrief
Output file: ${ctx.runFolder}/artifacts/request-brief.txt

Return format:
Produce the artifact as a plain-text file using this template:
  Artifact: ExtractionRequestBrief
  Workflow mode: extraction
  Original request: ...
  Source repository: ${sourceDir}
  Target repository: ${targetDir}
  Workflow or feature to extract: ...
  Desired target scope: ...
  Excluded features: ...
  Critical behaviors to preserve: ...
  Expected deliverables: ...
  Constraints: ...
  Success criteria: ...
  Ambiguity or missing information: ...
  Expected next stage: source-architecture-context
  Status: complete | incomplete | blocked
`;
}

function sourceArchitectureContextPrompt(ctx: PromptContext): string {
  const sourceDir = ctx.sourceRepoRoot ?? '<source-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- source repository: ${sourceDir}

${ctx.stageInstructionText}

Required output artifact: SourceArchitectureContextPacket
Output file: ${ctx.runFolder}/artifacts/source-architecture-context-packet.txt
Supporting report output file: ${ctx.runFolder}/reports/source-architecture-context-retrieval-report.txt

Return format:

Write the supporting retrieval report using this template:

  Source retrieval evidence report

  Source repository: ${sourceDir}
  Index directory: ${sourceDir}/.my-dev-kit

  Refreshed or reused:
  manifest.json status:
  Semantic artifacts available:

  Search queries run:
  - Query:
    Reason:

  Candidate nodes selected:
  - Node ID:
    Reason:

  Lookup commands run:
  - Node ID:
    Useful relationships found:

  Graph slices created:
  - Focus node:
  - Depth:
  - Direction:
  - Reason:

  Source symbols retrieved:
  - Symbol node ID:
  - File path:
  - Reason:

  Full files read beyond retrieved source:
  - File path or none:
  - Reason:

  Context gaps or uncertainty:
  - Gap:
    Impact:

Then write SourceArchitectureContextPacket using this template:

  Artifact: SourceArchitectureContextPacket
  Workflow mode: extraction
  Source repository: ${sourceDir}

  Relevant source files: ...
  Relevant source symbols: ...
  Relevant source components / modules / routes / services: ...
  Source data contracts: ...
  Source persistence dependencies: ...
  Source external service dependencies: ...
  Source state owners: ...
  Source tests found: ...
  Source patterns: ...
  Context gaps or uncertainty: ...
  Expected next stage: source-workflow-map
  Status: complete | incomplete | blocked
`;
}

function sourceWorkflowMapPrompt(ctx: PromptContext): string {
  const sourceDir = ctx.sourceRepoRoot ?? '<source-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/source-architecture-context-packet.txt
- source repository (read-only evidence): ${sourceDir}

${ctx.stageInstructionText}

Required output artifact: SourceWorkflowMap
Output file: ${ctx.runFolder}/artifacts/source-workflow-map.txt

Return format:
Produce the artifact as a plain-text file using this template:

  Artifact: SourceWorkflowMap
  Workflow mode: extraction
  Source repo path: ${sourceDir}
  Workflow entry point: <entry point file or component>

  User-facing steps:
  1. <step>
  2. <step>

  Frontend components: <list>
  Frontend state owners: <list>

  API routes: <list>
  Backend services: <list>
  Data contracts: <list>

  Persistence dependencies: <list>
  External service dependencies: <list>

  Tests found: <list>

  Known behavior risks:
  - <risk>

  Ambiguous or missing context:
  - <gap>

  Status: complete | incomplete | blocked
`;
}

function portingMapPrompt(ctx: PromptContext): string {
  const sourceDir = ctx.sourceRepoRoot ?? '<source-repo-root>';
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/source-architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/source-workflow-map.txt

${ctx.stageInstructionText}

Required output artifact: SourceToTargetPortingMap
Output file: ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt
Required output artifact: DoNotPortList
Output file: ${ctx.runFolder}/artifacts/do-not-port-list.txt

Return format:
Produce both artifacts as plain-text files.

SourceToTargetPortingMap template:

  Artifact: SourceToTargetPortingMap
  Workflow mode: extraction
  Source repository: ${sourceDir}
  Target repository: ${targetDir}

  --- Item ---
  Source behavior: <description>
  Source files or symbols: <list>
  Target behavior: <description>
  Target module or component: <planned target location>
  Decision: <port as-is | port with refactor | rewrite cleanly | discard | postpone>
  Reason: <explanation>
  Required tests: <list>
  Risks: <list>

  --- Item ---
  ...

  Status: complete | incomplete | blocked

DoNotPortList template:

  Artifact: DoNotPortList
  Workflow mode: extraction
  Source repository: ${sourceDir}
  Target repository: ${targetDir}

  Systems excluded from the target project:
  - <system name>: <reason>

  UI labels excluded:
  - <label>: <reason for exclusion>

  Backend routes excluded:
  - <route>: <reason>

  Persistence layers excluded:
  - <persistence layer>: <reason>

  Downstream workflows excluded:
  - <workflow>: <reason>

  Consequences if accidentally ported:
  - <consequence>

  Status: complete | incomplete | blocked
`;
}

function goldenBehaviorContractPrompt(ctx: PromptContext): string {
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/source-workflow-map.txt
- ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt
- ${ctx.runFolder}/artifacts/do-not-port-list.txt

${ctx.stageInstructionText}

Required output artifact: GoldenBehaviorContract
Output file: ${ctx.runFolder}/artifacts/golden-behavior-contract.txt

Return format:
Produce the artifact as a plain-text file using this template:

  Artifact: GoldenBehaviorContract
  Workflow mode: extraction
  Target repository: ${targetDir}

  User-visible behavior:
  1. <behavior>
  2. <behavior>

  API behavior:
  - <endpoint>: <contract>

  State behavior:
  - <state item>: <contract>

  Sorting and ranking behavior:
  - <rule>

  Pagination behavior:
  - <rule>

  Selection behavior:
  - <rule>

  Error and empty-state behavior:
  - <case>: <expected result>

  Edge cases:
  - <case>: <expected result>

  Non-negotiable regression tests:
  1. <test description>
  2. <test description>

  Acceptance criteria:
  - <criterion>

  Status: complete | incomplete | blocked
`;
}

function targetArchitecturePrompt(ctx: PromptContext): string {
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt
- ${ctx.runFolder}/artifacts/do-not-port-list.txt
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt

${ctx.stageInstructionText}

Required output artifact: TargetArchitectureProposal
Output file: ${ctx.runFolder}/artifacts/target-architecture-proposal.txt

Return format:
Produce the artifact as a plain-text file using this template:

  Artifact: TargetArchitectureProposal
  Workflow mode: extraction
  Target repo path: ${targetDir}
  Target project purpose: <description>

  Target workflow:
  1. <step>
  2. <step>

  Frontend components: <list>
  Backend services: <list>
  API routes: <list>
  Shared contracts: <list>

  State ownership:
  - <state>: owned by <component>

  Persistence policy: <description>
  External dependencies: <list>

  Testing strategy overview: <description>

  Source components reused: <list>
  Source components rewritten: <list>
  Source components discarded: <list>

  Architecture guardrails:
  - <guardrail>

  Status: complete | incomplete | blocked
`;
}

function extractionBehaviorModelPrompt(ctx: PromptContext): string {
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/target-architecture-proposal.txt
- ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt

${ctx.stageInstructionText}

Required output artifact: BehaviorModel
Output file: ${ctx.runFolder}/artifacts/behavior-model.txt

Return format:
Produce the artifact as a plain-text file following the BehaviorModel template.
  Artifact: BehaviorModel
  Workflow mode: extraction
  Target repository: ${targetDir}
  Inputs used: ...
  Behavior summary: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function extractionPseudocodePacketPrompt(ctx: PromptContext): string {
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/target-architecture-proposal.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt

${ctx.stageInstructionText}

Required output artifact: PseudocodePacket
Output file: ${ctx.runFolder}/artifacts/pseudocode-packet.txt

Return format:
Produce the artifact as a plain-text file following the PseudocodePacket template.
  Artifact: PseudocodePacket
  Workflow mode: extraction
  Target repository: ${targetDir}
  Inputs used: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function extractionTestStrategyPrompt(ctx: PromptContext): string {
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/target-architecture-proposal.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt
- ${ctx.runFolder}/artifacts/pseudocode-packet.txt

${ctx.stageInstructionText}

Required output artifact: TestStrategyPacket
Output file: ${ctx.runFolder}/artifacts/test-strategy-packet.txt

Return format:
Produce the artifact as a plain-text file following the TestStrategyPacket template.
  Artifact: TestStrategyPacket
  Workflow mode: extraction
  Target repository: ${targetDir}
  Inputs used: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function extractionImplementationPrompt(ctx: PromptContext): string {
  const sourceDir = ctx.sourceRepoRoot ?? '<source-repo-root>';
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/target-architecture-proposal.txt
- ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt
- ${ctx.runFolder}/artifacts/do-not-port-list.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt
- ${ctx.runFolder}/artifacts/pseudocode-packet.txt

${ctx.stageInstructionText}

Required output artifact: ImplementationReport
Output file: ${ctx.runFolder}/artifacts/implementation-report.txt

Return format:
Produce the artifact as a plain-text file following the ImplementationReport template.
  Artifact: ImplementationReport
  Workflow mode: extraction
  Source repository: ${sourceDir}
  Target repository: ${targetDir}
  Inputs used: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function extractionTestImplementationPrompt(ctx: PromptContext): string {
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt
- ${ctx.runFolder}/artifacts/pseudocode-packet.txt
- ${ctx.runFolder}/artifacts/test-strategy-packet.txt
- ${ctx.runFolder}/artifacts/implementation-report.txt (if available)

${ctx.stageInstructionText}

Required output artifact: TestImplementationReport
Output file: ${ctx.runFolder}/artifacts/test-implementation-report.txt

Return format:
Produce the artifact as a plain-text file following the TestImplementationReport template.
  Artifact: TestImplementationReport
  Workflow mode: extraction
  Target repository: ${targetDir}
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function extractionVerificationPrompt(ctx: PromptContext): string {
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/test-strategy-packet.txt
- ${ctx.runFolder}/artifacts/implementation-report.txt
- ${ctx.runFolder}/artifacts/test-implementation-report.txt

${ctx.stageInstructionText}

Required output artifact: VerificationReport
Output file: ${ctx.runFolder}/artifacts/verification-report.txt

Return format:
Produce the artifact as a plain-text file following the VerificationReport template.
  Artifact: VerificationReport
  Workflow mode: extraction
  Target repository: ${targetDir}
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function extractionJudgePrompt(ctx: PromptContext): string {
  const sourceDir = ctx.sourceRepoRoot ?? '<source-repo-root>';
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/source-workflow-map.txt
- ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt
- ${ctx.runFolder}/artifacts/do-not-port-list.txt
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/target-architecture-proposal.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt
- ${ctx.runFolder}/artifacts/pseudocode-packet.txt
- ${ctx.runFolder}/artifacts/test-strategy-packet.txt
- ${ctx.runFolder}/artifacts/implementation-report.txt
- ${ctx.runFolder}/artifacts/test-implementation-report.txt
- ${ctx.runFolder}/artifacts/verification-report.txt

${ctx.stageInstructionText}

Required output artifact: JudgeReport
Output file: ${ctx.runFolder}/artifacts/judge-report.txt

Return format:
Produce the artifact as a plain-text file.
  Artifact: JudgeReport
  Workflow mode: extraction
  Source repository: ${sourceDir}
  Target repository: ${targetDir}
  Verdict: ...
  GoldenBehaviorContract satisfied: yes | no | partial
  DoNotPortList compliant: yes | no
  Source repository modified: yes | no
  Recommended next stage if not PASS: ...
  Status: complete
`;
}

function extractionFinalReportPrompt(ctx: PromptContext): string {
  const sourceDir = ctx.sourceRepoRoot ?? '<source-repo-root>';
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/source-workflow-map.txt
- ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt
- ${ctx.runFolder}/artifacts/do-not-port-list.txt
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/target-architecture-proposal.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt
- ${ctx.runFolder}/artifacts/pseudocode-packet.txt
- ${ctx.runFolder}/artifacts/test-strategy-packet.txt
- ${ctx.runFolder}/artifacts/implementation-report.txt
- ${ctx.runFolder}/artifacts/test-implementation-report.txt
- ${ctx.runFolder}/artifacts/verification-report.txt
- ${ctx.runFolder}/artifacts/judge-report.txt

${ctx.stageInstructionText}

Required output artifact: FinalReport
Output file: ${ctx.runFolder}/artifacts/final-report.txt

Return format:
Produce the artifact as a plain-text file following the FinalReport template.
  Artifact: FinalReport
  Workflow mode: extraction
  Run ID: ${ctx.runId}
  Source repository: ${sourceDir}
  Target repository: ${targetDir}
  [all required sections]
  Status: complete
`;
}

// ─── Greenfield stages (v1.1.0) ────────────────────────────────────────────────

function greenfieldIdeaBriefPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- original project idea: ${ctx.runFolder}/00-request.txt

${ctx.stageInstructionText}

Required output artifact: IdeaBrief
Output file: ${ctx.runFolder}/artifacts/idea-brief.json

Return format:
Produce the artifact as a JSON file matching NormalizedGreenfieldBrief (src/greenfield/brief/briefTypes.ts), plus:
  "status": "complete" | "incomplete" | "blocked"
`;
}

function greenfieldProductBoundaryPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/idea-brief.json

${ctx.stageInstructionText}

Required output artifact: ProductBoundary
Output file: ${ctx.runFolder}/artifacts/product-boundary.txt

Return format:
Produce the artifact as a plain-text file using the template:
  Artifact: ProductBoundary
  Workflow mode: greenfield
  Intended users: ...
  Core workflow: ...
  Constraints: ...
  Non-goals: ...
  Success criteria: ...
  Status: complete | incomplete | blocked
`;
}

function greenfieldStackDecisionPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/idea-brief.json
- ${ctx.runFolder}/artifacts/product-boundary.txt

${ctx.stageInstructionText}

Required output artifact: StackDecision
Output file: ${ctx.runFolder}/artifacts/stack-decision.txt

Return format:
Produce the artifact as a plain-text file using the template:
  Artifact: StackDecision
  Workflow mode: greenfield
  Chosen stack: ...
  User-preferred stack: ...
  Unresolved: ...
  Status: complete | incomplete | blocked
`;
}

function greenfieldStarterProfilePrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/idea-brief.json
- ${ctx.runFolder}/artifacts/product-boundary.txt
- ${ctx.runFolder}/artifacts/stack-decision.txt

${ctx.stageInstructionText}

Required output artifact: StarterProfile
Output file: ${ctx.runFolder}/artifacts/starter-profile.json

Return format:
Produce the artifact as a JSON file matching GreenfieldProfileSelection (src/greenfield/profiles/profileTypes.ts), plus:
  "status": "complete" | "incomplete" | "blocked"
`;
}

function greenfieldBootstrapBundlePrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/idea-brief.json
- ${ctx.runFolder}/artifacts/product-boundary.txt
- ${ctx.runFolder}/artifacts/stack-decision.txt
- ${ctx.runFolder}/artifacts/starter-profile.json

${ctx.stageInstructionText}

Required output artifact: GreenfieldBootstrapBundleArtifact
Output file: ${ctx.runFolder}/artifacts/bootstrap-bundle.json

Return format:
Produce the artifact as a JSON file matching GreenfieldBootstrapBundle (src/greenfield/bootstrap/bootstrapBundleTypes.ts), plus:
  "status": "complete" | "incomplete" | "blocked"
`;
}

function greenfieldProjectDocsPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/bootstrap-bundle.json

${ctx.stageInstructionText}

Required output artifact: ProjectDocsReport
Output file: ${ctx.runFolder}/artifacts/project-docs-report.txt

Return format:
Produce the artifact as a plain-text file using the template:
  Artifact: ProjectDocsReport
  Workflow mode: greenfield
  Doc targets: ...
  Component doc targets: ...
  Unresolved decisions: ...
  Validation result: ...
  Status: complete | incomplete | blocked
`;
}

function greenfieldFirstVerticalSlicePrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/bootstrap-bundle.json
- ${ctx.runFolder}/artifacts/scaffold-plan.txt
- ${ctx.runFolder}/reports/scaffold-implementation-report.txt

${ctx.stageInstructionText}

Required output artifact: FirstVerticalSlice
Output file: ${ctx.runFolder}/artifacts/first-vertical-slice.txt

Return format:
Produce the artifact as a plain-text file using the template:
  Artifact: FirstVerticalSlice
  Workflow mode: greenfield
  Minimal behavior: ...
  Entry point: ...
  Tied to product boundary: ...
  Status: complete | incomplete | blocked
`;
}

function greenfieldVerificationPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/scaffold-plan.txt
- ${ctx.runFolder}/reports/scaffold-implementation-report.txt
- ${ctx.runFolder}/artifacts/first-vertical-slice.txt

${ctx.stageInstructionText}

Required output artifact: VerificationReport
Output file: ${ctx.runFolder}/reports/verification-report.txt

Return format:
Produce the artifact as a plain-text file following the VerificationReport template.
  Artifact: VerificationReport
  Workflow mode: greenfield
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function greenfieldInitialIndexPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/scaffold-plan.txt
- ${ctx.runFolder}/reports/scaffold-implementation-report.txt
- ${ctx.runFolder}/artifacts/first-vertical-slice.txt
- ${ctx.runFolder}/reports/verification-report.txt

${ctx.stageInstructionText}

Required output artifact: InitialIndexReport
Output file: ${ctx.runFolder}/reports/initial-index-report.txt

Return format:
Produce the artifact as a plain-text file using the template:
  Artifact: InitialIndexReport
  Workflow mode: greenfield
  Indexing status: run | planned-only
  Command: ...
  Working directory: ...
  Exit code: ...
  Output summary: ...
  Status: complete | incomplete | blocked
`;
}

function greenfieldJudgePrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/idea-brief.json
- ${ctx.runFolder}/artifacts/product-boundary.txt
- ${ctx.runFolder}/artifacts/stack-decision.txt
- ${ctx.runFolder}/artifacts/starter-profile.json
- ${ctx.runFolder}/artifacts/bootstrap-bundle.json
- ${ctx.runFolder}/artifacts/project-docs-report.txt
- ${ctx.runFolder}/artifacts/scaffold-plan.txt
- ${ctx.runFolder}/reports/scaffold-implementation-report.txt
- ${ctx.runFolder}/artifacts/first-vertical-slice.txt
- ${ctx.runFolder}/reports/verification-report.txt
- ${ctx.runFolder}/reports/initial-index-report.txt

${ctx.stageInstructionText}

Required output artifact: JudgeReport
Output file: ${ctx.runFolder}/reports/judge-report.txt

Return format:
Produce the artifact as a plain-text file.
  Artifact: JudgeReport
  Workflow mode: greenfield
  Verdict: ...
  Recommended next stage if not PASS: ...
  Status: complete
`;
}

function greenfieldFinalReportPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/reports/judge-report.txt
- ${ctx.runFolder}/reports/verification-report.txt
- major greenfield artifacts and reports

${ctx.stageInstructionText}

Required output artifact: FinalReport
Output file: ${ctx.runFolder}/reports/final-report.txt

Return format:
Produce the artifact as a plain-text file following the FinalReport template.
  Artifact: FinalReport
  Workflow mode: greenfield
  Run ID: ...
  [all required sections]
  Status: complete
`;
}

// ─── Stage router ─────────────────────────────────────────────────────────────

export function generateStagePrompt(meta: RunMetadata, stageName: string): string {
  const stageIndex = meta.stages.findIndex((s) => s.name === stageName);
  if (stageIndex === -1) {
    throw new Error(`Stage "${stageName}" not found in ${meta.mode} workflow`);
  }

  const bundle = assembleStageContextBundleOrThrow(meta, stageName);

  const ctx: PromptContext = {
    stage: stageName,
    mode: meta.mode,
    runId: meta.runId,
    projectRoot: meta.projectRoot,
    runFolder: meta.runFolder,
    stageNumber: stageIndex + 1,
    totalStages: meta.stages.length,
    sourceRepoRoot: meta.sourceRepoRoot,
    targetRepoRoot: meta.targetRepoRoot,
    stageInstructionText: renderStageInstructionBlockFromBundle(bundle),
  };

  // Batch 5: a direct context-sensitive stage (implementation or
  // test-implementation, in any mode including extraction) whose context is
  // not ready becomes a context-refresh-only prompt instead of its normal
  // work prompt -- see AGENTS.txt Batch 5 section 14.2.
  if (
    (stageName === 'implementation' || stageName === 'test-implementation') &&
    bundle.repositoryContextReadiness?.decision === 'refresh-required'
  ) {
    return renderContextRefreshOnlyPrompt(ctx, bundle.repositoryContextReadiness);
  }

  const isExtraction = meta.mode === 'extraction';
  const isGreenfield = meta.mode === 'greenfield';

  switch (stageName) {
    // shared - non-extraction
    case 'architecture-context': return architectureContextPrompt(ctx);
    case 'verification':
      return isExtraction ? extractionVerificationPrompt(ctx) : isGreenfield ? greenfieldVerificationPrompt(ctx) : verificationPrompt(ctx);
    case 'judge':
      return isExtraction ? extractionJudgePrompt(ctx) : isGreenfield ? greenfieldJudgePrompt(ctx) : judgePrompt(ctx);
    case 'final-report':
      return isExtraction ? extractionFinalReportPrompt(ctx) : isGreenfield ? greenfieldFinalReportPrompt(ctx) : finalReportPrompt(ctx);
    // shared stages with extraction-specific overrides
    case 'behavior-model': return isExtraction ? extractionBehaviorModelPrompt(ctx) : behaviorModelPrompt(ctx);
    case 'pseudocode-packet': return isExtraction ? extractionPseudocodePacketPrompt(ctx) : pseudocodePacketPrompt(ctx);
    case 'test-strategy': return isExtraction ? extractionTestStrategyPrompt(ctx) : testStrategyPrompt(ctx);
    case 'implementation': return isExtraction ? extractionImplementationPrompt(ctx) : implementationPrompt(ctx);
    case 'test-implementation': return isExtraction ? extractionTestImplementationPrompt(ctx) : testImplementationPrompt(ctx);
    // feature
    case 'request-brief': return isExtraction ? extractionRequestBriefPrompt(ctx) : requestBriefPrompt(ctx);
    // repair
    case 'observed-behavior-report': return observedBehaviorReportPrompt(ctx);
    case 'behavior-trace': return behaviorTracePrompt(ctx);
    case 'divergence-report': return divergenceReportPrompt(ctx);
    case 'correction-design': return correctionDesignPrompt(ctx);
    case 'regression-test-strategy': return regressionTestStrategyPrompt(ctx);
    // test
    case 'test-target-brief': return testTargetBriefPrompt(ctx);
    case 'behavior-reconstruction': return behaviorReconstructionPrompt(ctx);
    case 'pseudocode-summary': return pseudocodeSummaryPrompt(ctx);
    // refactor
    case 'refactor-brief': return refactorBriefPrompt(ctx);
    case 'existing-behavior-map': return existingBehaviorMapPrompt(ctx);
    case 'preserved-invariant-list': return preservedInvariantListPrompt(ctx);
    case 'compatibility-test-strategy': return compatibilityTestStrategyPrompt(ctx);
    case 'refactor-pseudocode-packet': return refactorPseudocodePacketPrompt(ctx);
    // harden
    case 'hardening-brief': return hardeningBriefPrompt(ctx);
    case 'assumption-report': return assumptionReportPrompt(ctx);
    case 'failure-mode-matrix': return failureModeMatrixPrompt(ctx);
    case 'guard-pseudocode-packet': return guardPseudocodePacketPrompt(ctx);
    case 'resilience-test-strategy': return resilienceTestStrategyPrompt(ctx);
    // extraction-specific
    case 'source-architecture-context': return sourceArchitectureContextPrompt(ctx);
    case 'source-workflow-map': return sourceWorkflowMapPrompt(ctx);
    case 'porting-map': return portingMapPrompt(ctx);
    case 'golden-behavior-contract': return goldenBehaviorContractPrompt(ctx);
    case 'target-architecture': return targetArchitecturePrompt(ctx);
    // greenfield-specific (v1.1.0)
    case 'idea-brief': return greenfieldIdeaBriefPrompt(ctx);
    case 'product-boundary': return greenfieldProductBoundaryPrompt(ctx);
    case 'stack-decision': return greenfieldStackDecisionPrompt(ctx);
    case 'starter-profile': return greenfieldStarterProfilePrompt(ctx);
    case 'bootstrap-bundle': return greenfieldBootstrapBundlePrompt(ctx);
    case 'project-docs': return greenfieldProjectDocsPrompt(ctx);
    case 'scaffold-plan': return renderScaffoldPlanPrompt(ctx);
    case 'scaffold-implementation': return renderScaffoldImplementationPrompt(ctx);
    case 'first-vertical-slice': return greenfieldFirstVerticalSlicePrompt(ctx);
    case 'initial-index': return greenfieldInitialIndexPrompt(ctx);
    default:
      throw new Error(`No prompt generator for stage: "${stageName}"`);
  }
}

// Artifact files used as inputs for each correctable stage
const CORRECTION_STAGE_INPUTS: Record<string, string[]> = {
  'architecture-context': ['artifacts/request-brief.txt'],
  'target-architecture': [
    'artifacts/request-brief.txt',
    'artifacts/source-workflow-map.txt',
    'artifacts/porting-map.txt',
    'artifacts/golden-behavior-contract.txt',
  ],
  'behavior-model': [
    'artifacts/request-brief.txt',
    'artifacts/architecture-context-packet.txt',
  ],
  'pseudocode-packet': [
    'artifacts/request-brief.txt',
    'artifacts/architecture-context-packet.txt',
    'artifacts/behavior-model.txt',
  ],
  'test-strategy': [
    'artifacts/behavior-model.txt',
    'artifacts/pseudocode-packet.txt',
  ],
  'test-implementation': [
    'artifacts/behavior-model.txt',
    'artifacts/pseudocode-packet.txt',
    'artifacts/test-strategy-packet.txt',
  ],
  'implementation': [
    'artifacts/request-brief.txt',
    'artifacts/architecture-context-packet.txt',
    'artifacts/pseudocode-packet.txt',
  ],
  'verification': [
    'artifacts/implementation-report.txt',
    'artifacts/test-implementation-report.txt',
    'artifacts/test-strategy-packet.txt',
  ],
};

/**
 * Generates a bounded, stage-specific correction prompt.
 * The prompt instructs the coding agent to revise only the failed stage artifact
 * based on the judge report finding - without broadening scope, modifying code
 * automatically, or invoking any external runtime.
 */
export function generateCorrectionPrompt(
  meta: RunMetadata,
  correctionState: CorrectionRouteResult,
): string {
  const routedStage = correctionState.routedStage!;
  const verdict = correctionState.verdict ?? 'UNKNOWN';
  const runFolder = meta.runFolder;

  // Batch 5 section 18.1: a context-sensitive correction target
  // (implementation/test-implementation) must reevaluate readiness and
  // become a context-refresh-only correction when blocked, rather than
  // allowing a production or test correction against stale/insufficient
  // evidence.
  if (routedStage === 'implementation' || routedStage === 'test-implementation') {
    const bundle = assembleStageContextBundleOrThrow(meta, routedStage);
    if (bundle.repositoryContextReadiness?.decision === 'refresh-required') {
      return renderCorrectionContextRefreshPrompt(meta, correctionState, routedStage, bundle.repositoryContextReadiness);
    }
  }

  const priorInputs = CORRECTION_STAGE_INPUTS[routedStage] ?? [];
  const designMapPath = path.join(runFolder, 'artifacts', 'design-map.txt');
  const designMapExists = fs.existsSync(designMapPath);

  const inputLines: string[] = [
    `- ${runFolder}/artifacts/judge-report.txt`,
    ...priorInputs.map((f) => `- ${runFolder}/${f}`),
  ];
  if (designMapExists) {
    inputLines.push(`- ${runFolder}/artifacts/design-map.txt`);
  }

  const outputFile = path.join(runFolder, 'artifacts', stageToArtifactBasename(routedStage));

  const warningLines =
    correctionState.warnings.length > 0
      ? [`\nWarning from routing:\n${correctionState.warnings.map((w) => `  ${w}`).join('\n')}\n`]
      : [];

  // Batch 3: render the exact target-stage packet (same catalog content the
  // stage's normal prompt uses) in addition to -- not instead of -- the
  // correction-specific dynamic context above. Judge findings, routing, and
  // the "revise only this stage" procedural guardrails below are correction
  // workflow content and stay outside the packet (see section 14.2).
  const upstreamArtifacts: UpstreamArtifactReference[] = [
    { stageName: 'judge', artifactFile: 'artifacts/judge-report.txt', path: `${runFolder}/artifacts/judge-report.txt`, purpose: 'judge finding driving this correction', required: true, source: 'correction-context' },
    ...priorInputs.map((f) => ({
      stageName: routedStage,
      artifactFile: f,
      path: `${runFolder}/${f}`,
      purpose: 'prior artifact for the corrected stage',
      required: true,
      source: 'correction-context' as const,
    })),
  ];
  const stageInstructionText = renderStageInstructionBlock(meta, routedStage, upstreamArtifacts, correctionState);

  return [
    `Stage: ${routedStage} (correction)`,
    `Workflow mode: ${meta.mode}`,
    `Run ID: ${meta.runId}`,
    `Project root: ${meta.projectRoot}`,
    `Run folder: ${runFolder}`,
    ``,
    `Correction context:`,
    `  Judge verdict: ${verdict}`,
    `  Routed correction stage: ${routedStage}`,
    ...(correctionState.recommendedStage
      ? [`  Judge recommended: ${correctionState.recommendedStage}`]
      : []),
    ...warningLines,
    ``,
    `Inputs:`,
    ...inputLines,
    ``,
    `Task:`,
    `Revise the ${routedStage} artifact to resolve the judge finding.`,
    `Read the judge-report.txt to understand what was found insufficient.`,
    `Read the prior artifacts listed above to understand the current design state.`,
    `Produce an updated artifact that addresses the judge finding.`,
    ``,
    stageInstructionText,
    ``,
    `Required output artifact: ${artifactKindForStage(routedStage)}`,
    `Output file: ${outputFile}`,
    ``,
    `Stop conditions:`,
    `- revise only the artifact for this stage`,
    `- do not modify production code unless this stage is implementation`,
    `- do not write test files unless this stage is test-strategy or test-implementation`,
    `- do not broaden scope beyond what the judge finding requires`,
    `- do not route back further unless the prior artifact is also found insufficient`,
    `- do not run any external agent, LLM call, or automated tool`,
    `- do not claim the issue is resolved without updating the artifact`,
    ``,
    `Return format:`,
    `Produce the updated artifact as a plain-text file.`,
    `Update the Status: field to complete when the correction is done.`,
    ``,
  ].join('\n');
}

// Correction-specific counterpart to renderContextRefreshOnlyPrompt():
// retains the judge verdict / routing context (per AGENTS.txt Batch 5
// section 18.1) but replaces the normal "revise the artifact" task with
// refresh-only instructions. Creates no context file and no correction-
// specific sidecar.
function renderCorrectionContextRefreshPrompt(
  meta: RunMetadata,
  correctionState: CorrectionRouteResult,
  routedStage: string,
  readiness: ContextReadinessResult,
): string {
  const verdict = correctionState.verdict ?? 'UNKNOWN';
  const lines: string[] = [
    `Stage: ${routedStage} (correction, context-blocked)`,
    `Workflow mode: ${meta.mode}`,
    `Run ID: ${meta.runId}`,
    `Project root: ${meta.projectRoot}`,
    `Run folder: ${meta.runFolder}`,
    ``,
    `Correction context:`,
    `  Judge verdict: ${verdict}`,
    `  Routed correction stage: ${routedStage}`,
    ...(correctionState.recommendedStage ? [`  Judge recommended: ${correctionState.recommendedStage}`] : []),
    ``,
    `Inputs:`,
    `- ${meta.runFolder}/artifacts/judge-report.txt`,
    ``,
    `This correction is BLOCKED on repository context. Production or test correction is prohibited until context is refreshed.`,
    ``,
    `Context kind: ${readiness.kind}`,
    `Context packet: ${readiness.packetPath}`,
    `Retrieval report: ${readiness.reportPath}`,
    `Readiness decision: ${readiness.decision}`,
    `Classification: ${readiness.classification}`,
    ``,
  ];
  if (readiness.blockerSummary) {
    lines.push('Blocking issues:');
    lines.push(...renderCanonicalBlockerLines(readiness.blockerSummary, '  '));
    lines.push('');
  }
  lines.push(
    'Required refresh actions:',
    '  1. Populate or repair the context packet and retrieval report referenced above.',
    '  2. Run my-dev-kit manually (this orchestrator does not execute it automatically):',
    '       <MY_DEV_KIT_CLI> context --request <REQUEST_FILE> --json',
    '  3. Record the resulting context capsule and retrieval audit paths in the packet/report.',
    '  4. Set Status: populated and resolve the blocking issues listed above.',
    '',
    'Automatic retrieval: disabled.',
    '',
    'Stop conditions:',
    `  - do not correct the ${routedStage} artifact until context is ready`,
    '  - do not modify production code',
    '  - do not write test files',
    '  - do not create a context file for this correction',
    '  - stop after refreshing or repairing the context evidence',
    '',
    'Return format:',
    'Do not write a new artifact file for this report. In your response, report:',
    '  Context refresh report',
    `  Stage: ${routedStage} (correction)`,
    '  Actions taken: ...',
    '  Remaining blocking issues, if any: ...',
    '  Status: refreshed | still-blocked',
    '',
  );
  return lines.join('\n');
}

function stageToArtifactBasename(stageName: string): string {
  const map: Record<string, string> = {
    'architecture-context': 'architecture-context-packet.txt',
    'behavior-model': 'behavior-model.txt',
    'pseudocode-packet': 'pseudocode-packet.txt',
    'test-strategy': 'test-strategy-packet.txt',
    'test-implementation': 'test-implementation-report.txt',
    'implementation': 'implementation-report.txt',
    'verification': 'verification-report.txt',
  };
  return map[stageName] ?? `${stageName}.txt`;
}

function artifactKindForStage(stageName: string): string {
  const map: Record<string, string> = {
    'architecture-context': 'ArchitectureContextPacket',
    'behavior-model': 'BehaviorModel',
    'pseudocode-packet': 'PseudocodePacket',
    'test-strategy': 'TestStrategyPacket',
    'test-implementation': 'TestImplementationReport',
    'implementation': 'ImplementationReport',
    'verification': 'VerificationReport',
  };
  return map[stageName] ?? stageName;
}

// Derives the packet sidecar path from the stage's existing promptFile
// (e.g. "prompts/06-implementation.prompt.txt" ->
// "prompts/06-implementation.instruction-packet.json"), rather than
// hardcoding a stage number, so it stays correct if prompt numbering ever
// shifts. The sidecar is a generated inspection output: it is not an
// artifact, not part of ARTIFACT_MAP/additionalArtifactFiles, not part of
// run.json, and not read by lifecycle, check, status, or export.
function sidecarPathForPromptFile(promptFile: string): string {
  return promptFile.replace(/\.prompt\.txt$/, '.instruction-packet.json');
}

export function writeStagePrompts(meta: RunMetadata): void {
  // Batch 4: write the mode-appropriate starter supplemental context
  // templates exactly once, before any prompt text (which may reference
  // them) is generated. Existing files are never overwritten -- see
  // writeSupplementalContextTemplates(). This is the only write boundary;
  // prompt display (generateStagePrompt/generateCorrectionPrompt) never
  // creates files.
  writeSupplementalContextTemplates(meta.mode, meta.runFolder);

  for (const stage of meta.stages) {
    const promptContent = generateStagePrompt(meta, stage.name);
    const promptPath = path.join(meta.runFolder, stage.promptFile);
    fs.writeFileSync(promptPath, promptContent, 'utf8');

    // Batch 3: write one packet sidecar per native stage. generateStagePrompt()
    // above already throws if the packet cannot be assembled for this stage,
    // so this call is expected to always succeed when reached.
    const bundle = assembleStageContextBundleOrThrow(meta, stage.name);
    const sidecarPath = path.join(meta.runFolder, sidecarPathForPromptFile(stage.promptFile));
    fs.writeFileSync(sidecarPath, serializeWorkflowInstructionPacket(bundle.workflowInstructionPacket), 'utf8');
  }
}

