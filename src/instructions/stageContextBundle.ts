// StageContextBundle: an in-memory composition of TaskState, the exact
// WorkflowInstructionPacket for the selected stage, upstream artifact
// references, and an optional (Batch 3: always absent) repository-evidence
// reference. Never persisted -- see promptGenerator.ts for how it is
// consumed to render a single prompt.

import { RunMetadata } from '../run';
import { CorrectionRouteResult } from '../correctionRouter';
import { assembleTaskState, TaskState, TaskStateAssemblyIssue } from './taskState';
import { makeWorkflowId, makeStageId } from './catalogIds';
import { CatalogValidationIssue, InstructionBudgetLimits, InstructionCatalog } from './catalogTypes';
import { assembleWorkflowInstructionPacket, WorkflowInstructionPacket } from './workflowInstructionPacket';
import {
  findStageRepositoryEvidenceRequirement,
  implementationContextPacketPath,
  implementationContextRetrievalReportPath,
  testContextPacketPath,
  testContextRetrievalReportPath,
} from './stageRepositoryEvidenceRequirements';
import { buildRepositoryEvidenceReference } from './repositoryEvidenceReference';
import { ContextReadinessResult, evaluateContextReadiness } from './contextReadiness';
import { RunContextReadinessSummary, evaluateRunContextReadiness } from './runContextReadiness';
import {
  DeclaredAdequacy,
  DeclaredFreshness,
  DeclaredTruncation,
  RepositoryEvidenceAggregateStatus,
  SupplementalContextDocumentStatus,
  SupplementalContextEnforcement,
  SupplementalContextKind,
  SupplementalContextParserIssue,
  SupplementalContextRole,
} from './supplementalContextTypes';

export const STAGE_CONTEXT_BUNDLE_SCHEMA_VERSION = '1.0.0';

export interface UpstreamArtifactReference {
  stageName: string;
  artifactFile: string;
  path: string;
  purpose: string;
  required: boolean;
  source?: 'workflow-definition' | 'stage-prompt-definition' | 'correction-context';
}

// Repository evidence for one context-sensitive stage (Batch 4). Attached
// only for the exact 11 stages in STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.
// Structural only: statuses and declared values are parsed from the
// supplemental packet/report files, never independently verified. No raw
// document text is embedded here -- only references, structural metadata,
// statuses, warnings, and issues.
export interface RepositoryEvidenceReference {
  kind: SupplementalContextKind;
  role: SupplementalContextRole;
  packetPath: string;
  reportPath: string;
  packetRelativePath: string;
  reportRelativePath: string;
  packetStatus: SupplementalContextDocumentStatus;
  reportStatus: SupplementalContextDocumentStatus;
  status: RepositoryEvidenceAggregateStatus;
  requiredForStage: boolean;
  enforcement: SupplementalContextEnforcement;
  declaredFreshness?: DeclaredFreshness;
  declaredAdequacy?: DeclaredAdequacy;
  requiredEvidenceTruncated?: DeclaredTruncation;
  packetSchemaVersion?: string;
  reportSchemaVersion?: string;
  toolName?: string;
  toolVersion?: string;
  indexIdentity?: string;
  responsibilityMappingsTruncated?: DeclaredTruncation;
  criticalResponsibilityMappingStatus?: string;
  warnings: string[];
  issues: SupplementalContextParserIssue[];
}

export interface StageContextBundleProvenance {
  taskStateSource: 'run-metadata';
  workflowInstructionSource: 'instruction-catalog';
  packetResolutionSource: 'exact-catalog-resolver';
  upstreamArtifactSource: 'stage-prompt-definition' | 'correction-context';
  repositoryEvidenceSource: 'not-configured' | 'supplemental-context-files';
  repositoryEvidenceRequirementSource?: 'stage-repository-evidence-requirements';
  repositoryEvidenceEnforcement?: SupplementalContextEnforcement;
}

export interface StageContextBundle {
  schemaVersion: string;
  taskState: TaskState;
  workflowInstructionPacket: WorkflowInstructionPacket;
  upstreamArtifacts: UpstreamArtifactReference[];
  repositoryEvidenceReference?: RepositoryEvidenceReference;
  // Batch 5, additive. Populated only for the 11 direct context-sensitive
  // stages (mirrors repositoryEvidenceReference's presence).
  repositoryContextReadiness?: ContextReadinessResult;
  // Batch 5, additive. Populated only for non-greenfield verification/judge
  // stages -- the mode-required RepositoryEvidenceReference(s) they review.
  relatedRepositoryEvidenceReferences?: RepositoryEvidenceReference[];
  // Batch 5, additive. Populated only for non-greenfield verification/judge
  // stages.
  runContextReadinessSummary?: RunContextReadinessSummary;
  provenance: StageContextBundleProvenance;
}

export interface AssembleStageContextBundleInput {
  catalog: InstructionCatalog;
  runMetadata: RunMetadata;
  selectedStage: string;
  upstreamArtifacts: UpstreamArtifactReference[];
  correctionState?: CorrectionRouteResult;
  // Test-only override. Normal assembly always derives this itself (by exact
  // stage ID lookup + read-only file inspection under runMetadata.runFolder)
  // -- see resolveRepositoryEvidenceReference() below. Passing this bypasses
  // that derivation entirely.
  repositoryEvidenceReference?: RepositoryEvidenceReference;
  limits?: InstructionBudgetLimits;
}

function repositoryEvidencePathsFor(
  kind: SupplementalContextKind,
  runFolder: string,
): { packetPath: string; reportPath: string } {
  return kind === 'implementation'
    ? {
        packetPath: implementationContextPacketPath(runFolder),
        reportPath: implementationContextRetrievalReportPath(runFolder),
      }
    : {
        packetPath: testContextPacketPath(runFolder),
        reportPath: testContextRetrievalReportPath(runFolder),
      };
}

// Resolves the exact repository-evidence requirement for a stage ID (no
// stage-name-only fallback) and, when one exists, inspects its packet/report
// files read-only. Returns undefined for the other 68 native stages, which
// never carry repository evidence in Batch 4.
function resolveRepositoryEvidenceReference(
  stageId: string,
  runFolder: string,
): RepositoryEvidenceReference | undefined {
  const requirement = findStageRepositoryEvidenceRequirement(stageId);
  if (!requirement) return undefined;
  const paths = repositoryEvidencePathsFor(requirement.kind, runFolder);
  return buildRepositoryEvidenceReference(requirement, paths);
}

export type StageContextBundleAssemblyIssue = TaskStateAssemblyIssue | CatalogValidationIssue;

export type AssembleStageContextBundleResult =
  | { ok: true; bundle: StageContextBundle }
  | { ok: false; issues: StageContextBundleAssemblyIssue[] };

export function assembleStageContextBundle(
  input: AssembleStageContextBundleInput,
): AssembleStageContextBundleResult {
  const { catalog, runMetadata, selectedStage, upstreamArtifacts, correctionState, limits } = input;

  const taskStateResult = assembleTaskState({ runMetadata, selectedStage, correctionState });
  if (!taskStateResult.ok) {
    return { ok: false, issues: taskStateResult.issues };
  }

  const workflowId = makeWorkflowId(runMetadata.mode);
  const stageId = makeStageId(runMetadata.mode, selectedStage);

  const packetResult = assembleWorkflowInstructionPacket({ catalog, workflowId, stageId, limits });
  if (!packetResult.ok) {
    return { ok: false, issues: packetResult.issues };
  }

  const repositoryEvidenceReference =
    input.repositoryEvidenceReference ?? resolveRepositoryEvidenceReference(stageId, runMetadata.runFolder);

  const requirement = findStageRepositoryEvidenceRequirement(stageId);
  const repositoryContextReadiness = requirement
    ? evaluateContextReadiness({
        requirement,
        stageId,
        runFolder: runMetadata.runFolder,
        mode: runMetadata.mode,
        projectRoot: runMetadata.projectRoot,
      })
    : undefined;

  const isContextReviewStage =
    !requirement && runMetadata.mode !== 'greenfield' && (selectedStage === 'verification' || selectedStage === 'judge');
  let runContextReadinessSummary: RunContextReadinessSummary | undefined;
  let relatedRepositoryEvidenceReferences: RepositoryEvidenceReference[] | undefined;
  if (isContextReviewStage) {
    runContextReadinessSummary = evaluateRunContextReadiness({
      mode: runMetadata.mode,
      runFolder: runMetadata.runFolder,
      workflowStageNames: runMetadata.stages.map((s) => s.name),
      currentStage: selectedStage,
      projectRoot: runMetadata.projectRoot,
    });
    relatedRepositoryEvidenceReferences = ['implementation', 'test-implementation']
      .map((name) => resolveRepositoryEvidenceReference(makeStageId(runMetadata.mode, name), runMetadata.runFolder))
      .filter((ref): ref is RepositoryEvidenceReference => ref !== undefined);
  }

  const provenance: StageContextBundleProvenance = {
    taskStateSource: 'run-metadata',
    workflowInstructionSource: 'instruction-catalog',
    packetResolutionSource: 'exact-catalog-resolver',
    upstreamArtifactSource: correctionState ? 'correction-context' : 'stage-prompt-definition',
    repositoryEvidenceSource: repositoryEvidenceReference ? 'supplemental-context-files' : 'not-configured',
    ...(repositoryEvidenceReference
      ? {
          repositoryEvidenceRequirementSource: 'stage-repository-evidence-requirements' as const,
          repositoryEvidenceEnforcement: repositoryEvidenceReference.enforcement,
        }
      : {}),
  };

  const bundle: StageContextBundle = {
    schemaVersion: STAGE_CONTEXT_BUNDLE_SCHEMA_VERSION,
    taskState: taskStateResult.taskState,
    workflowInstructionPacket: packetResult.packet,
    upstreamArtifacts: [...upstreamArtifacts],
    ...(repositoryEvidenceReference ? { repositoryEvidenceReference } : {}),
    ...(repositoryContextReadiness ? { repositoryContextReadiness } : {}),
    ...(runContextReadinessSummary ? { runContextReadinessSummary } : {}),
    ...(relatedRepositoryEvidenceReferences ? { relatedRepositoryEvidenceReferences } : {}),
    provenance,
  };

  return { ok: true, bundle };
}
