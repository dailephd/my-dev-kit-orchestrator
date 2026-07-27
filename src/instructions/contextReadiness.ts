// Deterministic context-readiness evaluation (Batch 5).
//
// Converts Batch 4's informational RepositoryEvidenceReference into a
// blocking readiness decision by additionally consulting the raw my-dev-kit
// evidence a populated supplemental document must reference, and -- for
// test context -- the orchestrator-owned TestStrategyPacket criticality
// overlay. This module owns policy only (which conditions block, in what
// order); it never re-implements my-dev-kit's retrieval, ranking, freshness,
// or adequacy algorithms (AGENTS.txt Batch 5 section 3.1/3.2).
//
// Never persisted. Recomputed in memory for every prompt/status/check/export
// call from whatever is currently on disk.

import * as path from 'path';
import { inspectSupplementalContextFile } from './supplementalContextParser';
import { ROLE_BY_DOCUMENT_KIND } from './supplementalContextContracts';
import {
  DeclaredAdequacy,
  DeclaredFreshness,
  DeclaredTruncation,
  SupplementalContextDocumentKind,
  SupplementalContextInspection,
  SupplementalContextKind,
  SupplementalContextRole,
} from './supplementalContextTypes';
import { StageRepositoryEvidenceRequirement } from './stageRepositoryEvidenceRequirements';
import {
  RawEvidenceProjection,
  findCapsuleAuditInconsistencies,
  readRawContextCapsule,
  readRawRetrievalAudit,
} from './myDevKitEvidenceSummary';
import { identityPathsEqual, nonEmpty } from './contextIdentity';
import { reconcileDeclaredField, nonUnknown } from './supplementalPairReconciliation';
import {
  CriticalResponsibilitySummary,
  allCriticalResponsibilitiesFullyMapped,
  computeCriticalResponsibilitySummary,
  findTestStrategySourceRequirement,
  readTestResponsibilityBlocks,
} from './testResponsibilityCriticality';

export const CONTEXT_READINESS_SCHEMA_VERSION = '1.0.0';

export type ContextReadinessDecision = 'not-required' | 'ready' | 'refresh-required';

export type ContextReadinessClassification =
  | 'not-required'
  | 'ready'
  | 'missing'
  | 'template'
  | 'partial'
  | 'malformed'
  | 'unsupported-schema'
  | 'incompatible'
  | 'source-reference-missing'
  | 'source-reference-unreadable'
  | 'source-evidence-malformed'
  | 'source-evidence-unsupported-schema'
  | 'role-mismatch'
  | 'repository-scope-mismatch'
  | 'repository-identity-incomplete'
  | 'index-identity-incomplete'
  | 'index-identity-mismatch'
  | 'freshness-unknown'
  | 'stale'
  | 'adequacy-unknown'
  | 'inadequate'
  | 'conflict'
  | 'required-evidence-truncated'
  | 'required-evidence-incomplete'
  | 'provenance-missing'
  | 'test-strategy-missing'
  | 'test-responsibility-invalid'
  | 'test-responsibility-criticality-unknown'
  | 'responsibility-mappings-truncated'
  | 'critical-responsibilities-unmapped';

export type ContextReadinessIssueSeverity = 'error' | 'warning';

export interface ContextReadinessIssueDefinition {
  priority: number;
  correctiveAction: string;
  evidenceTarget: string;
}

export interface ContextReadinessIssue {
  code: string;
  severity: ContextReadinessIssueSeverity;
  message: string;
  priority: number;
  correctiveAction: string;
  evidenceTarget: string;
  stageId: string;
  contextKind: SupplementalContextKind;
  path?: string;
  field?: string;
  responsibilityId?: string;
  expected?: string;
  actual?: string;
  sourceCode?: string;
}

export interface ContextReadinessBlockerSummary {
  contextKind: SupplementalContextKind;
  primaryCode: string;
  primaryReason: string;
  correctiveAction: string;
  evidenceTarget: string;
  blockingIssueCodes: string[];
  supportingIssueCodes: string[];
}

export interface ContextReadinessResult {
  schemaVersion: string;
  kind: SupplementalContextKind;
  role: SupplementalContextRole;
  decision: ContextReadinessDecision;
  classification: ContextReadinessClassification;
  stageId: string;
  packetPath: string;
  reportPath: string;
  sourceCapsulePath?: string;
  sourceAuditPath?: string;
  issues: ContextReadinessIssue[];
  warnings: string[];
  blockingIssueCodes: string[];
  primaryIssue?: ContextReadinessIssue;
  blockerSummary?: ContextReadinessBlockerSummary;
  affectedResponsibilityIds: string[];
  declaredFreshness?: DeclaredFreshness;
  evaluatedFreshness: 'fresh' | 'stale' | 'unknown';
  declaredAdequacy?: DeclaredAdequacy;
  evaluatedAdequacy: 'sufficient' | 'sufficient-with-assumptions' | 'insufficient' | 'conflict' | 'unknown';
  requiredEvidenceTruncated: DeclaredTruncation;
  responsibilityMappingsTruncated?: DeclaredTruncation;
  criticalResponsibilitySummary?: CriticalResponsibilitySummary;
  indexIdentity?: string;
  readyWithAssumptions: boolean;
  provenanceSummary: string;
}

const INTERNAL_CONTRACT_CODE = 'CONTEXT_READINESS_CONTRACT_VIOLATION';

// Lower values win. This is the single priority authority used by low-level
// finalization, run aggregation, and every public consumer.
const CONTEXT_READINESS_ISSUE_DEFINITIONS: Readonly<Record<string, ContextReadinessIssueDefinition>> = {
  [INTERNAL_CONTRACT_CODE]: {
    priority: 0,
    correctiveAction: 'Repair the readiness issue construction/finalization contract, then reevaluate the context.',
    evidenceTarget: 'internal readiness contract',
  },
  CONTEXT_PACKET_MISSING: {
    priority: 10,
    correctiveAction: 'Create and populate the required context packet.',
    evidenceTarget: 'supplemental context packet',
  },
  CONTEXT_REPORT_MISSING: {
    priority: 11,
    correctiveAction: 'Create and populate the required context retrieval report.',
    evidenceTarget: 'supplemental context retrieval report',
  },
  CONTEXT_PACKET_TEMPLATE: {
    priority: 12,
    correctiveAction: 'Replace the starter packet fields with grounded repository evidence.',
    evidenceTarget: 'supplemental context packet',
  },
  CONTEXT_REPORT_TEMPLATE: {
    priority: 13,
    correctiveAction: 'Replace the starter report fields with grounded retrieval results.',
    evidenceTarget: 'supplemental context retrieval report',
  },
  CONTEXT_PACKET_MALFORMED: {
    priority: 14,
    correctiveAction: 'Repair the packet structure and required metadata.',
    evidenceTarget: 'supplemental context packet',
  },
  CONTEXT_REPORT_MALFORMED: {
    priority: 15,
    correctiveAction: 'Repair the retrieval report structure and required metadata.',
    evidenceTarget: 'supplemental context retrieval report',
  },
  CONTEXT_PACKET_UNSUPPORTED_SCHEMA: {
    priority: 16,
    correctiveAction: 'Regenerate or migrate the packet to a supported schema-major version.',
    evidenceTarget: 'supplemental context packet schema',
  },
  CONTEXT_REPORT_UNSUPPORTED_SCHEMA: {
    priority: 17,
    correctiveAction: 'Regenerate or migrate the report to a supported schema-major version.',
    evidenceTarget: 'supplemental context retrieval report schema',
  },
  CONTEXT_KIND_MISMATCH: {
    priority: 18,
    correctiveAction: 'Use the supplemental document kind required by this stage.',
    evidenceTarget: 'supplemental document kind',
  },
  CONTEXT_ROLE_MISMATCH: {
    priority: 19,
    correctiveAction: 'Regenerate the supplemental document for the role required by this stage.',
    evidenceTarget: 'supplemental document role',
  },
  CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH: {
    priority: 20,
    correctiveAction: 'Reconcile the packet and retrieval report so both declare the same grounded value.',
    evidenceTarget: 'supplemental packet/report agreement',
  },
  CONTEXT_SOURCE_CAPSULE_REFERENCE_MISSING: {
    priority: 30,
    correctiveAction: 'Declare the generated context capsule path in the packet and report.',
    evidenceTarget: 'source context capsule reference',
  },
  CONTEXT_SOURCE_AUDIT_REFERENCE_MISSING: {
    priority: 31,
    correctiveAction: 'Declare the generated retrieval audit path in the packet and report.',
    evidenceTarget: 'source retrieval audit reference',
  },
  CONTEXT_SOURCE_CAPSULE_UNREADABLE: {
    priority: 32,
    correctiveAction: 'Regenerate the context capsule at the declared readable path.',
    evidenceTarget: 'source context capsule',
  },
  CONTEXT_SOURCE_AUDIT_UNREADABLE: {
    priority: 33,
    correctiveAction: 'Regenerate the retrieval audit at the declared readable path.',
    evidenceTarget: 'source retrieval audit',
  },
  CONTEXT_SOURCE_CAPSULE_MALFORMED: {
    priority: 34,
    correctiveAction: 'Regenerate the malformed context capsule with the configured producer.',
    evidenceTarget: 'source context capsule',
  },
  CONTEXT_SOURCE_AUDIT_MALFORMED: {
    priority: 35,
    correctiveAction: 'Regenerate the malformed retrieval audit with the configured producer.',
    evidenceTarget: 'source retrieval audit',
  },
  CONTEXT_SOURCE_CAPSULE_UNSUPPORTED_SCHEMA: {
    priority: 36,
    correctiveAction: 'Regenerate the context capsule with a supported schema-major producer.',
    evidenceTarget: 'source context capsule schema',
  },
  CONTEXT_SOURCE_AUDIT_UNSUPPORTED_SCHEMA: {
    priority: 37,
    correctiveAction: 'Regenerate the retrieval audit with a supported schema-major producer.',
    evidenceTarget: 'source retrieval audit schema',
  },
  CONTEXT_SOURCE_SUMMARY_MISMATCH: {
    priority: 40,
    correctiveAction: 'Regenerate one canonical capsule/audit pair and preserve producer parity.',
    evidenceTarget: 'raw capsule/audit agreement',
  },
  CONTEXT_SOURCE_REPOSITORY_MISMATCH: {
    priority: 41,
    correctiveAction: 'Regenerate evidence from the active run repository.',
    evidenceTarget: 'raw repository identity',
  },
  CONTEXT_SOURCE_REPOSITORY_INCOMPLETE: {
    priority: 42,
    correctiveAction: 'Regenerate a capsule/audit pair with matching repository identity declarations.',
    evidenceTarget: 'raw repository identity pair',
  },
  CONTEXT_SOURCE_INDEX_IDENTITY_MISSING: {
    priority: 43,
    correctiveAction: 'Regenerate evidence from an index with a canonical index identity.',
    evidenceTarget: 'raw active index identity',
  },
  CONTEXT_DECLARED_INDEX_IDENTITY_MISMATCH: {
    priority: 44,
    correctiveAction: 'Update the supplemental declarations from the active raw index identity.',
    evidenceTarget: 'supplemental/raw index identity agreement',
  },
  CONTEXT_DECLARED_AFTER_INDEX_MISMATCH: {
    priority: 45,
    correctiveAction: 'Regenerate evidence so the declared after index matches raw freshness evidence.',
    evidenceTarget: 'after-index identity agreement',
  },
  CONTEXT_SOURCE_ROLE_MISMATCH: {
    priority: 46,
    correctiveAction: 'Regenerate raw evidence for the role required by this stage.',
    evidenceTarget: 'raw evidence role',
  },
  CONTEXT_FRESHNESS_STALE: {
    priority: 50,
    correctiveAction: 'Regenerate required context from the current final-production index.',
    evidenceTarget: 'raw freshness and after-index evidence',
  },
  CONTEXT_FRESHNESS_UNKNOWN: {
    priority: 51,
    correctiveAction: 'Provide matching capsule/audit freshness and after-index evidence.',
    evidenceTarget: 'raw freshness and after-index evidence',
  },
  CONTEXT_ADEQUACY_INSUFFICIENT: {
    priority: 60,
    correctiveAction: 'Retrieve the missing required owner, contract, and dependency evidence.',
    evidenceTarget: 'raw role-adequacy evidence',
  },
  CONTEXT_ADEQUACY_CONFLICT: {
    priority: 61,
    correctiveAction: 'Reconcile conflicting owner or contract evidence before implementation.',
    evidenceTarget: 'raw role-adequacy evidence',
  },
  CONTEXT_ADEQUACY_UNKNOWN: {
    priority: 62,
    correctiveAction: 'Regenerate evidence with a producer-declared role-adequacy decision.',
    evidenceTarget: 'raw role-adequacy evidence',
  },
  CONTEXT_REQUIRED_EVIDENCE_TRUNCATED: {
    priority: 70,
    correctiveAction: 'Rerun retrieval with sufficient limits so no required evidence is lost.',
    evidenceTarget: 'raw required-evidence truncation record',
  },
  CONTEXT_PROVENANCE_MISSING: {
    priority: 80,
    correctiveAction: 'Regenerate evidence with producer provenance records.',
    evidenceTarget: 'raw provenance records',
  },
  CONTEXT_TEST_STRATEGY_MISSING: {
    priority: 90,
    correctiveAction: 'Restore the mode-owned test strategy before evaluating test context.',
    evidenceTarget: 'TestStrategyPacket',
  },
  CONTEXT_RESPONSIBILITY_MAPPINGS_TRUNCATED: {
    priority: 91,
    correctiveAction: 'Rerun test retrieval without losing required responsibility mappings.',
    evidenceTarget: 'raw responsibility mappings',
  },
  CONTEXT_CRITICAL_RESPONSIBILITY_PARTIALLY_MAPPED: {
    priority: 92,
    correctiveAction: 'Retrieve enough test evidence to fully map every partially mapped critical responsibility.',
    evidenceTarget: 'critical responsibility mappings',
  },
  CONTEXT_CRITICAL_RESPONSIBILITY_MISSING_MAPPING: {
    priority: 93,
    correctiveAction: 'Add grounded test evidence for every unmapped critical responsibility.',
    evidenceTarget: 'critical responsibility mappings',
  },
};

const SUPPLEMENTAL_STRUCTURE_CODES = new Set([
  'SUPPLEMENTAL_CONTEXT_INVALID_SCHEMA_VERSION',
  'SUPPLEMENTAL_CONTEXT_INVALID_STATUS',
  'SUPPLEMENTAL_CONTEXT_INVALID_FRESHNESS',
  'SUPPLEMENTAL_CONTEXT_INVALID_ADEQUACY',
  'SUPPLEMENTAL_CONTEXT_INVALID_TRUNCATION',
  'SUPPLEMENTAL_CONTEXT_INVALID_REPOSITORY_SCOPE',
  'SUPPLEMENTAL_CONTEXT_DUPLICATE_METADATA',
  'SUPPLEMENTAL_CONTEXT_EMPTY_METADATA_VALUE',
  'SUPPLEMENTAL_CONTEXT_MISSING_REQUIRED_METADATA',
  'SUPPLEMENTAL_CONTEXT_MISSING_REQUIRED_SECTION',
  'SUPPLEMENTAL_CONTEXT_DUPLICATE_SECTION',
  'CONTEXT_REQUIRED_SECTION_NOT_POPULATED',
]);

const TEST_STRATEGY_CODES = new Set([
  'CONTEXT_TEST_RESPONSIBILITY_ID_MISSING',
  'CONTEXT_TEST_RESPONSIBILITY_ID_INVALID',
  'CONTEXT_TEST_RESPONSIBILITY_DUPLICATE',
  'CONTEXT_TEST_RESPONSIBILITY_CRITICALITY_MISSING',
  'CONTEXT_TEST_RESPONSIBILITY_CRITICALITY_INVALID',
]);

export function contextReadinessIssueDefinition(code: string): ContextReadinessIssueDefinition | undefined {
  const exact = CONTEXT_READINESS_ISSUE_DEFINITIONS[code];
  if (exact) return exact;
  if (SUPPLEMENTAL_STRUCTURE_CODES.has(code)) {
    return {
      priority: 21,
      correctiveAction: 'Repair the named supplemental metadata or section, then reevaluate the context.',
      evidenceTarget: 'supplemental document structure',
    };
  }
  if (TEST_STRATEGY_CODES.has(code)) {
    return {
      priority: 89,
      correctiveAction: 'Repair the test responsibility ID/criticality contract in the mode-owned test strategy.',
      evidenceTarget: 'TestStrategyPacket responsibility records',
    };
  }
  return undefined;
}

function stableIssueDetailKey(value: ContextReadinessIssue): string {
  return [
    value.stageId,
    value.contextKind,
    value.path ?? '',
    value.field ?? '',
    value.responsibilityId ?? '',
    value.expected ?? '',
    value.actual ?? '',
    value.message,
  ].join('\u0000');
}

export function compareContextReadinessIssues(a: ContextReadinessIssue, b: ContextReadinessIssue): number {
  return (
    a.priority - b.priority ||
    a.code.localeCompare(b.code) ||
    (a.contextKind === b.contextKind ? 0 : a.contextKind === 'implementation' ? -1 : 1) ||
    stableIssueDetailKey(a).localeCompare(stableIssueDetailKey(b))
  );
}

function packetKindFor(kind: SupplementalContextKind): SupplementalContextDocumentKind {
  return kind === 'implementation' ? 'implementation-context-packet' : 'test-context-packet';
}
function reportKindFor(kind: SupplementalContextKind): SupplementalContextDocumentKind {
  return kind === 'implementation' ? 'implementation-context-retrieval-report' : 'test-context-retrieval-report';
}

export function createContextReadinessIssue(
  code: string,
  severity: ContextReadinessIssueSeverity,
  message: string,
  stageId: string,
  contextKind: SupplementalContextKind,
  extra?: Partial<ContextReadinessIssue>,
): ContextReadinessIssue {
  const definition = contextReadinessIssueDefinition(code);
  if (!definition && severity === 'error') {
    const fallback = CONTEXT_READINESS_ISSUE_DEFINITIONS[INTERNAL_CONTRACT_CODE];
    return {
      ...extra,
      code: INTERNAL_CONTRACT_CODE,
      severity,
      message: `Readiness error "${code}" has no canonical issue definition. ${message}`,
      priority: fallback.priority,
      correctiveAction: fallback.correctiveAction,
      evidenceTarget: fallback.evidenceTarget,
      stageId,
      contextKind,
      sourceCode: code,
    };
  }
  const resolved =
    definition ??
    ({
      priority: 1000,
      correctiveAction: 'Review the warning and refresh the affected evidence when it is required.',
      evidenceTarget: 'repository context evidence',
    } satisfies ContextReadinessIssueDefinition);
  return {
    ...extra,
    code,
    severity,
    message,
    priority: resolved.priority,
    correctiveAction: resolved.correctiveAction,
    evidenceTarget: resolved.evidenceTarget,
    stageId,
    contextKind,
  };
}

function issue(
  code: string,
  severity: ContextReadinessIssueSeverity,
  message: string,
  stageId: string,
  contextKind: SupplementalContextKind,
  extra?: Partial<ContextReadinessIssue>,
): ContextReadinessIssue {
  return createContextReadinessIssue(code, severity, message, stageId, contextKind, extra);
}

function orderedUnique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function finalizeContextReadinessResult(proposed: ContextReadinessResult): ContextReadinessResult {
  const normalizedIssues = proposed.issues.map((candidate) =>
    createContextReadinessIssue(
      candidate.code,
      candidate.severity,
      candidate.message,
      candidate.stageId,
      candidate.contextKind,
      candidate,
    ),
  );
  let errorIssues = normalizedIssues.filter((candidate) => candidate.severity === 'error');
  let decision = proposed.decision;
  let classification = proposed.classification;

  if (decision === 'refresh-required' && errorIssues.length === 0) {
    normalizedIssues.push(
      createContextReadinessIssue(
        INTERNAL_CONTRACT_CODE,
        'error',
        `A refresh-required "${classification}" result was constructed without an actionable error issue.`,
        proposed.stageId,
        proposed.kind,
      ),
    );
    errorIssues = normalizedIssues.filter((candidate) => candidate.severity === 'error');
  }

  if (errorIssues.length > 0 && decision !== 'refresh-required') {
    decision = 'refresh-required';
    if (classification === 'ready' || classification === 'not-required') classification = 'incompatible';
  }

  normalizedIssues.sort(compareContextReadinessIssues);
  errorIssues = normalizedIssues.filter((candidate) => candidate.severity === 'error');
  let primaryIssue = decision === 'refresh-required' ? errorIssues[0] : undefined;

  if (
    decision === 'refresh-required' &&
    (!primaryIssue ||
      !primaryIssue.code ||
      !primaryIssue.correctiveAction ||
      !primaryIssue.evidenceTarget ||
      !normalizedIssues.includes(primaryIssue))
  ) {
    normalizedIssues.push(
      createContextReadinessIssue(
        INTERNAL_CONTRACT_CODE,
        'error',
        'The finalized refresh-required result did not expose a valid primary blocker.',
        proposed.stageId,
        proposed.kind,
      ),
    );
    normalizedIssues.sort(compareContextReadinessIssues);
    errorIssues = normalizedIssues.filter((candidate) => candidate.severity === 'error');
    primaryIssue = errorIssues[0];
  }

  const blockingIssueCodes = decision === 'refresh-required'
    ? orderedUnique(errorIssues.map((candidate) => candidate.code))
    : [];
  const blockerSummary =
    decision === 'refresh-required' && primaryIssue
      ? {
          contextKind: proposed.kind,
          primaryCode: primaryIssue.code,
          primaryReason: primaryIssue.message,
          correctiveAction: primaryIssue.correctiveAction,
          evidenceTarget: primaryIssue.evidenceTarget,
          blockingIssueCodes,
          supportingIssueCodes: blockingIssueCodes.filter((code) => code !== primaryIssue?.code),
        }
      : undefined;

  return {
    ...proposed,
    decision,
    classification,
    issues: normalizedIssues,
    blockingIssueCodes,
    ...(primaryIssue ? { primaryIssue } : { primaryIssue: undefined }),
    ...(blockerSummary ? { blockerSummary } : { blockerSummary: undefined }),
  };
}

function structuralIssuesFor(
  inspection: SupplementalContextInspection,
  docLabel: 'packet' | 'report',
  stageId: string,
  contextKind: SupplementalContextKind,
): { issues: ContextReadinessIssue[]; classification: ContextReadinessClassification | null } {
  const prefix = docLabel === 'packet' ? 'CONTEXT_PACKET' : 'CONTEXT_REPORT';
  switch (inspection.status) {
    case 'missing':
      return {
        issues: [issue(`${prefix}_MISSING`, 'error', `${docLabel} file is missing: ${inspection.path}`, stageId, contextKind, { path: inspection.path })],
        classification: 'missing',
      };
    case 'template':
      return {
        issues: [issue(`${prefix}_TEMPLATE`, 'error', `${docLabel} file is still a starter template: ${inspection.path}`, stageId, contextKind, { path: inspection.path })],
        classification: 'template',
      };
    case 'malformed':
      return {
        issues: [
          issue(`${prefix}_MALFORMED`, 'error', `${docLabel} file is structurally malformed: ${inspection.path}`, stageId, contextKind, { path: inspection.path }),
          ...inspection.issues.map((i) => issue(i.code, 'error' as const, i.message, stageId, contextKind, { path: inspection.path })),
        ],
        classification: 'malformed',
      };
    case 'unsupported-schema':
      return {
        issues: [
          issue(`${prefix}_UNSUPPORTED_SCHEMA`, 'error', `${docLabel} declares unsupported schema version ${inspection.declaredSchemaVersion}: ${inspection.path}`, stageId, contextKind, {
            path: inspection.path,
            expected: String(inspection.supportedSchemaMajor),
            actual: inspection.declaredSchemaVersion,
          }),
        ],
        classification: 'unsupported-schema',
      };
    case 'kind-mismatch':
      return {
        issues: [issue('CONTEXT_KIND_MISMATCH', 'error', `${docLabel} declares kind "${inspection.declaredKind}", expected "${inspection.expectedKind}": ${inspection.path}`, stageId, contextKind, { path: inspection.path })],
        classification: 'incompatible',
      };
    case 'role-mismatch':
      return {
        issues: [issue('CONTEXT_ROLE_MISMATCH', 'error', `${docLabel} declares role "${inspection.declaredRole}", expected "${inspection.expectedRole}": ${inspection.path}`, stageId, contextKind, { path: inspection.path })],
        classification: 'incompatible',
      };
    case 'populated':
      return { issues: [], classification: null };
  }
}

const RAW_SUMMARY_MISMATCH_CLASSIFICATION: Record<string, ContextReadinessClassification> = {
  role: 'role-mismatch',
  indexIdentity: 'index-identity-mismatch',
  beforeIndexIdentity: 'index-identity-mismatch',
  afterIndexIdentity: 'index-identity-mismatch',
  repositoryIdentity: 'repository-scope-mismatch',
};

const ADEQUACY_TEXT_MAP: Record<string, ContextReadinessResult['evaluatedAdequacy']> = {
  'context sufficient for implementation': 'sufficient',
  'context sufficient for test implementation': 'sufficient',
  'context sufficient with listed assumptions': 'sufficient-with-assumptions',
  'context insufficient and more retrieval required': 'insufficient',
  'context conflict found and user or upstream stage decision required': 'conflict',
};

function normalizeAdequacy(raw: string | undefined): ContextReadinessResult['evaluatedAdequacy'] {
  if (!raw) return 'unknown';
  return ADEQUACY_TEXT_MAP[raw] ?? 'unknown';
}

function normalizeFreshness(capsule: RawEvidenceProjection): {
  evaluated: ContextReadinessResult['evaluatedFreshness'];
  inconsistent: boolean;
} {
  if (capsule.freshnessState === 'fresh') {
    const consistent =
      capsule.freshnessAfterIndexDeclared &&
      capsule.freshnessAfterIndexPath !== null &&
      capsule.freshnessAfterIndexPath === capsule.indexPath;
    if (!consistent) return { evaluated: 'unknown', inconsistent: true };
    return { evaluated: 'fresh', inconsistent: false };
  }
  if (capsule.freshnessState === 'stale') return { evaluated: 'stale', inconsistent: false };
  return { evaluated: 'unknown', inconsistent: false };
}

export interface EvaluateContextReadinessInput {
  requirement: StageRepositoryEvidenceRequirement;
  stageId: string;
  runFolder: string;
  mode: string;
  // Active repository identity (v1.2.2 Batch 2 / F-006), e.g. RunMetadata's
  // projectRoot. Optional and additive: when omitted (as in callers that
  // predate Batch 2, and in old/legacy runs), repository-identity
  // enforcement below is simply not evaluated -- it never becomes a new
  // required field on existing callers or a new blocker for old runs.
  projectRoot?: string;
}

export function evaluateContextReadiness(input: EvaluateContextReadinessInput): ContextReadinessResult {
  const { requirement, stageId, runFolder, mode, projectRoot } = input;
  const { kind, role, packetRelativePath, reportRelativePath } = requirement;
  const packetPath = joinRunPath(runFolder, packetRelativePath);
  const reportPath = joinRunPath(runFolder, reportRelativePath);

  const expectedRole = ROLE_BY_DOCUMENT_KIND[packetKindFor(kind)];
  const packetInspection = inspectSupplementalContextFile(packetPath, packetKindFor(kind), expectedRole);
  const reportInspection = inspectSupplementalContextFile(reportPath, reportKindFor(kind), expectedRole);

  const issues: ContextReadinessIssue[] = [];
  const warnings: string[] = [];

  const base = (
    classification: ContextReadinessClassification,
    decision: ContextReadinessDecision,
    extra: Partial<ContextReadinessResult> = {},
  ): ContextReadinessResult =>
    finalizeContextReadinessResult({
      schemaVersion: CONTEXT_READINESS_SCHEMA_VERSION,
      kind,
      role,
      decision,
      classification,
      stageId,
      packetPath,
      reportPath,
      issues: [...issues],
      warnings: [...warnings],
      blockingIssueCodes: [],
      affectedResponsibilityIds: [],
      evaluatedFreshness: 'unknown',
      evaluatedAdequacy: 'unknown',
      requiredEvidenceTruncated: 'unknown',
      readyWithAssumptions: false,
      provenanceSummary: 'not evaluated',
      ...extra,
    });

  const packetStructural = structuralIssuesFor(packetInspection, 'packet', stageId, kind);
  const reportStructural = structuralIssuesFor(reportInspection, 'report', stageId, kind);
  issues.push(...packetStructural.issues, ...reportStructural.issues);

  const structuralClassification = packetStructural.classification ?? reportStructural.classification;
  if (structuralClassification) {
    return base(structuralClassification, 'refresh-required');
  }

  // Both packet and report are structurally populated. Reconcile the raw
  // capsule/audit references each document declares (v1.2.2 Batch 3 /
  // F-007) before either is trusted. Reconciliation, not precedence: when
  // both documents declare a real (non-"unknown") path and those paths
  // disagree, neither is selected -- the pair does not identify a single
  // piece of raw evidence, so no raw evidence is opened at all. Only when
  // the pair agrees, or only one side declares a real value (the metadata
  // key itself is not in REQUIRED_METADATA_BY_DOCUMENT_KIND for either
  // document kind, so a one-sided declaration is a contractually permitted
  // state, not a masked disagreement) does a value carry forward.
  const capsulePathOutcome = reconcileDeclaredField(
    nonUnknown(packetInspection.declaredSourceCapsulePath),
    nonUnknown(reportInspection.declaredSourceCapsulePath),
    identityPathsEqual,
  );
  const auditPathOutcome = reconcileDeclaredField(
    nonUnknown(packetInspection.declaredSourceAuditPath),
    nonUnknown(reportInspection.declaredSourceAuditPath),
    identityPathsEqual,
  );

  if (capsulePathOutcome.status === 'disagree' || auditPathOutcome.status === 'disagree') {
    if (capsulePathOutcome.status === 'disagree') {
      issues.push(
        issue(
          'CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH',
          'error',
          `Packet declares source context capsule "${capsulePathOutcome.packetValue}"; report declares "${capsulePathOutcome.reportValue}". Raw evidence cannot be trusted until they agree.`,
          stageId,
          kind,
          { field: 'sourceCapsulePath', expected: capsulePathOutcome.packetValue, actual: capsulePathOutcome.reportValue },
        ),
      );
    }
    if (auditPathOutcome.status === 'disagree') {
      issues.push(
        issue(
          'CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH',
          'error',
          `Packet declares source retrieval audit "${auditPathOutcome.packetValue}"; report declares "${auditPathOutcome.reportValue}". Raw evidence cannot be trusted until they agree.`,
          stageId,
          kind,
          { field: 'sourceAuditPath', expected: auditPathOutcome.packetValue, actual: auditPathOutcome.reportValue },
        ),
      );
    }
    return base('incompatible', 'refresh-required');
  }

  const declaredSourceCapsulePath = capsulePathOutcome.status === 'both-absent' ? undefined : capsulePathOutcome.value;
  const declaredSourceAuditPath = auditPathOutcome.status === 'both-absent' ? undefined : auditPathOutcome.value;

  if (!declaredSourceCapsulePath) {
    issues.push(
      issue('CONTEXT_SOURCE_CAPSULE_REFERENCE_MISSING', 'error', 'Populated packet/report does not declare a real "Source context capsule" path.', stageId, kind),
    );
    return base('source-reference-missing', 'refresh-required');
  }
  if (!declaredSourceAuditPath) {
    issues.push(
      issue('CONTEXT_SOURCE_AUDIT_REFERENCE_MISSING', 'error', 'Populated packet/report does not declare a real "Source retrieval audit" path.', stageId, kind),
    );
    return base('source-reference-missing', 'refresh-required');
  }

  const capsuleResult = readRawContextCapsule(declaredSourceCapsulePath, runFolder);
  if (!capsuleResult.ok) {
    const [code, classification] = rawStatusToCodeAndClassification(capsuleResult.status, 'CAPSULE');
    issues.push(issue(code, 'error', `${capsuleResult.message} (${declaredSourceCapsulePath})`, stageId, kind, { path: declaredSourceCapsulePath }));
    return base(classification, 'refresh-required', { sourceCapsulePath: declaredSourceCapsulePath, sourceAuditPath: declaredSourceAuditPath });
  }
  const auditResult = readRawRetrievalAudit(declaredSourceAuditPath, runFolder);
  if (!auditResult.ok) {
    const [code, classification] = rawStatusToCodeAndClassification(auditResult.status, 'AUDIT');
    issues.push(issue(code, 'error', `${auditResult.message} (${declaredSourceAuditPath})`, stageId, kind, { path: declaredSourceAuditPath }));
    return base(classification, 'refresh-required', { sourceCapsulePath: declaredSourceCapsulePath, sourceAuditPath: declaredSourceAuditPath });
  }

  const capsule = capsuleResult.projection;
  const audit = auditResult.projection;

  let primaryClassification: ContextReadinessClassification | null = null;
  const setPrimary = (c: ContextReadinessClassification) => {
    if (!primaryClassification) primaryClassification = c;
  };

  // Fail-closed raw-evidence consistency (v1.2.2 Batch 1 / F-005): every
  // error-severity CONTEXT_SOURCE_SUMMARY_MISMATCH between the raw capsule
  // and raw audit must set a primary blocker so the decision below cannot
  // resolve to "ready". Fields with a more specific classification take that
  // classification; every other duplicated raw summary field falls back to
  // the generic "incompatible" classification -- the same one already used
  // for declared-vs-raw contradictions -- so no contradiction can silently
  // fall through unclassified. setPrimary keeps the first (lowest, most
  // specific) mismatch in findCapsuleAuditInconsistencies's fixed field
  // order as the deterministic primary blocker.
  const mismatches = findCapsuleAuditInconsistencies(capsule, audit);
  for (const field of mismatches) {
    issues.push(
      issue('CONTEXT_SOURCE_SUMMARY_MISMATCH', 'error', `Capsule and audit disagree on "${field}".`, stageId, kind, { field }),
    );
    setPrimary(RAW_SUMMARY_MISMATCH_CLASSIFICATION[field] ?? 'incompatible');
  }

  const capsuleRole = capsule.requestRole ?? capsule.roleContextRole;
  if (capsuleRole && capsuleRole !== expectedRole) {
    issues.push(
      issue('CONTEXT_SOURCE_ROLE_MISMATCH', 'error', `Raw evidence declares role "${capsuleRole}", expected "${expectedRole}".`, stageId, kind, { expected: expectedRole, actual: capsuleRole }),
    );
    setPrimary('role-mismatch');
  }

  if (!capsule.indexPath) {
    issues.push(issue('CONTEXT_SOURCE_INDEX_IDENTITY_MISSING', 'error', 'Raw evidence does not declare an index identity.', stageId, kind));
    setPrimary('index-identity-incomplete');
  }

  // Repository identity enforcement (v1.2.2 Batch 2 / F-006). Raw evidence
  // may declare index.projectRoot (my-dev-kit >=1.10.x); when the caller
  // supplies the active run's real repository root, a declared projectRoot
  // that resolves to a different repository must block -- evidence gathered
  // against the wrong repository must never be accepted as ready. A missing
  // declaration on both sides remains compatible (older my-dev-kit versions
  // and existing schema-major-1 fixtures do not carry this field); a
  // declaration on only one of capsule/audit is an incomplete pair.
  const expectedRepositoryRoot = nonEmpty(projectRoot);
  if (expectedRepositoryRoot) {
    const capsuleHasRoot = nonEmpty(capsule.projectRoot) !== undefined;
    const auditHasRoot = nonEmpty(audit.projectRoot) !== undefined;
    if (capsuleHasRoot && auditHasRoot) {
      if (!identityPathsEqual(capsule.projectRoot, expectedRepositoryRoot)) {
        issues.push(
          issue('CONTEXT_SOURCE_REPOSITORY_MISMATCH', 'error', `Raw context capsule declares repository "${capsule.projectRoot}", expected "${expectedRepositoryRoot}".`, stageId, kind, {
            expected: expectedRepositoryRoot,
            actual: capsule.projectRoot,
          }),
        );
        setPrimary('repository-scope-mismatch');
      }
      if (!identityPathsEqual(audit.projectRoot, expectedRepositoryRoot)) {
        issues.push(
          issue('CONTEXT_SOURCE_REPOSITORY_MISMATCH', 'error', `Raw retrieval audit declares repository "${audit.projectRoot}", expected "${expectedRepositoryRoot}".`, stageId, kind, {
            expected: expectedRepositoryRoot,
            actual: audit.projectRoot,
          }),
        );
        setPrimary('repository-scope-mismatch');
      }
    } else if (capsuleHasRoot !== auditHasRoot) {
      issues.push(
        issue('CONTEXT_SOURCE_REPOSITORY_INCOMPLETE', 'error', 'Raw capsule and raw audit disagree on whether a repository identity is declared.', stageId, kind),
      );
      setPrimary('repository-identity-incomplete');
    }
  }

  // Supplemental pair reconciliation (v1.2.2 Batch 3 / F-007), continued:
  // the declared "Repository scope", "Index identity", "After index",
  // "Freshness", "Adequacy", and "Required evidence truncated" metadata
  // lines are each required in both the packet and the report (see
  // supplementalContextContracts.ts's COMMON_PACKET_METADATA /
  // COMMON_REPORT_METADATA). Reconcile each pair -- rather than letting the
  // packet's value win by `??` precedence -- before comparing the result
  // against raw evidence. "unknown" is a legal declared value for these
  // enum-shaped fields (meaning "not yet determined"), not an absence, so
  // nonUnknown() is used consistently to treat it the same as omission for
  // reconciliation purposes.
  const repositoryScopeOutcome = reconcileDeclaredField(
    nonUnknown(packetInspection.declaredRepositoryScope),
    nonUnknown(reportInspection.declaredRepositoryScope),
  );
  if (repositoryScopeOutcome.status === 'disagree') {
    issues.push(
      issue(
        'CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH',
        'error',
        `Packet declares repository scope "${repositoryScopeOutcome.packetValue}"; report declares "${repositoryScopeOutcome.reportValue}".`,
        stageId,
        kind,
        { field: 'repositoryScope', expected: repositoryScopeOutcome.packetValue, actual: repositoryScopeOutcome.reportValue },
      ),
    );
    setPrimary('repository-scope-mismatch');
  }

  const indexIdentityOutcome = reconcileDeclaredField(
    nonUnknown(packetInspection.indexIdentity),
    nonUnknown(reportInspection.indexIdentity),
    identityPathsEqual,
  );
  if (indexIdentityOutcome.status === 'disagree') {
    issues.push(
      issue(
        'CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH',
        'error',
        `Packet declares index identity "${indexIdentityOutcome.packetValue}"; report declares "${indexIdentityOutcome.reportValue}".`,
        stageId,
        kind,
        { field: 'indexIdentity', expected: indexIdentityOutcome.packetValue, actual: indexIdentityOutcome.reportValue },
      ),
    );
    setPrimary('index-identity-mismatch');
  }
  const declaredIndexIdentity = indexIdentityOutcome.status === 'agree' || indexIdentityOutcome.status === 'packet-only' || indexIdentityOutcome.status === 'report-only' ? indexIdentityOutcome.value : undefined;
  if (declaredIndexIdentity && !identityPathsEqual(declaredIndexIdentity, capsule.indexPath)) {
    issues.push(
      issue('CONTEXT_DECLARED_INDEX_IDENTITY_MISMATCH', 'error', `Declared index identity "${declaredIndexIdentity}" does not match raw evidence index path "${capsule.indexPath ?? 'unknown'}".`, stageId, kind, {
        field: 'indexIdentity',
        expected: capsule.indexPath,
        actual: declaredIndexIdentity,
      }),
    );
    setPrimary('index-identity-mismatch');
  }

  const afterIndexOutcome = reconcileDeclaredField(
    nonUnknown(packetInspection.declaredAfterIndex),
    nonUnknown(reportInspection.declaredAfterIndex),
    identityPathsEqual,
  );
  if (afterIndexOutcome.status === 'disagree') {
    issues.push(
      issue(
        'CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH',
        'error',
        `Packet declares after index "${afterIndexOutcome.packetValue}"; report declares "${afterIndexOutcome.reportValue}".`,
        stageId,
        kind,
        { field: 'afterIndex', expected: afterIndexOutcome.packetValue, actual: afterIndexOutcome.reportValue },
      ),
    );
    setPrimary('index-identity-mismatch');
  }
  const declaredAfterIndex = afterIndexOutcome.status === 'agree' || afterIndexOutcome.status === 'packet-only' || afterIndexOutcome.status === 'report-only' ? afterIndexOutcome.value : undefined;
  if (declaredAfterIndex && !identityPathsEqual(declaredAfterIndex, capsule.freshnessAfterIndexPath ?? undefined)) {
    issues.push(
      issue(
        'CONTEXT_DECLARED_AFTER_INDEX_MISMATCH',
        'error',
        `Declared after index "${declaredAfterIndex}" does not match raw evidence after-index path "${capsule.freshnessAfterIndexPath ?? 'unknown'}".`,
        stageId,
        kind,
        { field: 'afterIndex', expected: capsule.freshnessAfterIndexPath ?? undefined, actual: declaredAfterIndex },
      ),
    );
    setPrimary('index-identity-mismatch');
  }

  const freshnessOutcome = reconcileDeclaredField(nonUnknown(packetInspection.declaredFreshness), nonUnknown(reportInspection.declaredFreshness));
  if (freshnessOutcome.status === 'disagree') {
    issues.push(
      issue('CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH', 'error', `Packet declares freshness "${freshnessOutcome.packetValue}"; report declares "${freshnessOutcome.reportValue}".`, stageId, kind, {
        field: 'freshness',
        expected: freshnessOutcome.packetValue,
        actual: freshnessOutcome.reportValue,
      }),
    );
    setPrimary('incompatible');
  }
  const declaredFreshness =
    freshnessOutcome.status === 'agree' || freshnessOutcome.status === 'packet-only' || freshnessOutcome.status === 'report-only'
      ? (freshnessOutcome.value as DeclaredFreshness)
      : undefined;

  const adequacyOutcome = reconcileDeclaredField(nonUnknown(packetInspection.declaredAdequacy), nonUnknown(reportInspection.declaredAdequacy));
  if (adequacyOutcome.status === 'disagree') {
    issues.push(
      issue('CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH', 'error', `Packet declares adequacy "${adequacyOutcome.packetValue}"; report declares "${adequacyOutcome.reportValue}".`, stageId, kind, {
        field: 'adequacy',
        expected: adequacyOutcome.packetValue,
        actual: adequacyOutcome.reportValue,
      }),
    );
    setPrimary('incompatible');
  }
  const declaredAdequacy =
    adequacyOutcome.status === 'agree' || adequacyOutcome.status === 'packet-only' || adequacyOutcome.status === 'report-only'
      ? (adequacyOutcome.value as DeclaredAdequacy)
      : undefined;

  const truncatedOutcome = reconcileDeclaredField(
    nonUnknown(packetInspection.declaredRequiredEvidenceTruncated),
    nonUnknown(reportInspection.declaredRequiredEvidenceTruncated),
  );
  if (truncatedOutcome.status === 'disagree') {
    issues.push(
      issue(
        'CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH',
        'error',
        `Packet declares "Required evidence truncated: ${truncatedOutcome.packetValue}"; report declares "${truncatedOutcome.reportValue}".`,
        stageId,
        kind,
        { field: 'requiredEvidenceTruncated', expected: truncatedOutcome.packetValue, actual: truncatedOutcome.reportValue },
      ),
    );
    setPrimary('incompatible');
  }
  const declaredTruncated =
    truncatedOutcome.status === 'agree' || truncatedOutcome.status === 'packet-only' || truncatedOutcome.status === 'report-only'
      ? (truncatedOutcome.value as DeclaredTruncation)
      : undefined;

  const { evaluated: evaluatedFreshness, inconsistent: freshnessInconsistent } = normalizeFreshness(capsule);
  if (freshnessInconsistent) {
    issues.push(
      issue('CONTEXT_SOURCE_SUMMARY_MISMATCH', 'error', 'Raw evidence declares freshness "fresh" without a matching after-index identity.', stageId, kind, { field: 'freshness' }),
    );
  }
  if (declaredFreshness && declaredFreshness !== 'unknown' && declaredFreshness !== evaluatedFreshness) {
    issues.push(
      issue('CONTEXT_SOURCE_SUMMARY_MISMATCH', 'error', `Declared freshness "${declaredFreshness}" does not match raw evidence freshness "${evaluatedFreshness}".`, stageId, kind, {
        field: 'freshness',
        expected: evaluatedFreshness,
        actual: declaredFreshness,
      }),
    );
    setPrimary('incompatible');
  }

  if (evaluatedFreshness === 'stale') {
    issues.push(
      issue('CONTEXT_FRESHNESS_STALE', 'error', 'Required repository context is stale relative to the final-production index.', stageId, kind),
    );
    setPrimary('stale');
  } else if (evaluatedFreshness === 'unknown') {
    issues.push(
      issue('CONTEXT_FRESHNESS_UNKNOWN', 'error', 'Required repository-context freshness cannot be established from the raw evidence.', stageId, kind),
    );
    setPrimary('freshness-unknown');
  }

  const evaluatedAdequacy = normalizeAdequacy(capsule.roleAdequacyStatus);
  if (declaredAdequacy && declaredAdequacy !== 'unknown' && declaredAdequacy !== evaluatedAdequacy) {
    issues.push(
      issue('CONTEXT_SOURCE_SUMMARY_MISMATCH', 'error', `Declared adequacy "${declaredAdequacy}" does not match raw evidence adequacy "${evaluatedAdequacy}".`, stageId, kind, {
        field: 'adequacy',
        expected: evaluatedAdequacy,
        actual: declaredAdequacy,
      }),
    );
    setPrimary('incompatible');
  }
  if (evaluatedAdequacy === 'unknown') {
    issues.push(
      issue('CONTEXT_ADEQUACY_UNKNOWN', 'error', 'Required repository-context adequacy cannot be established from the raw evidence.', stageId, kind),
    );
    setPrimary('adequacy-unknown');
  } else if (evaluatedAdequacy === 'insufficient') {
    issues.push(
      issue('CONTEXT_ADEQUACY_INSUFFICIENT', 'error', 'Raw evidence is insufficient for the required stage role.', stageId, kind),
    );
    setPrimary('inadequate');
  } else if (evaluatedAdequacy === 'conflict') {
    issues.push(
      issue('CONTEXT_ADEQUACY_CONFLICT', 'error', 'Raw evidence contains an unresolved adequacy conflict.', stageId, kind),
    );
    setPrimary('conflict');
  }

  const requiredEvidenceTruncated: DeclaredTruncation = capsule.truncated
    ? capsule.truncationRequiredEvidenceLost
      ? 'yes'
      : 'no'
    : 'no';
  if (capsule.truncated && capsule.truncationRequiredEvidenceLost) {
    issues.push(
      issue('CONTEXT_REQUIRED_EVIDENCE_TRUNCATED', 'error', 'Producer truncation lost required repository evidence.', stageId, kind),
    );
    setPrimary('required-evidence-truncated');
  } else if (capsule.truncated) {
    warnings.push('Optional-only evidence truncation occurred; no required evidence was lost.');
  }
  if (capsule.fullFileFallbackUsed) {
    warnings.push('Full-file fallback was used by my-dev-kit for this retrieval.');
  }
  if (declaredTruncated && declaredTruncated !== 'unknown' && declaredTruncated !== requiredEvidenceTruncated) {
    issues.push(
      issue('CONTEXT_SOURCE_SUMMARY_MISMATCH', 'error', `Declared "Required evidence truncated: ${declaredTruncated}" does not match raw evidence.`, stageId, kind, { field: 'requiredEvidenceTruncated' }),
    );
    setPrimary('incompatible');
  }

  if (capsule.provenanceCount === 0) {
    issues.push(issue('CONTEXT_PROVENANCE_MISSING', 'error', 'Raw evidence has no provenance records.', stageId, kind));
    setPrimary('provenance-missing');
  }

  let responsibilityMappingsTruncated: DeclaredTruncation | undefined;
  let criticalResponsibilitySummary: CriticalResponsibilitySummary | undefined;
  let affectedResponsibilityIds: string[] = [];

  if (kind === 'test') {
    // Test-kind-only supplemental reconciliation (v1.2.2 Batch 3 / F-007):
    // "Responsibility mappings truncated" and "Critical responsibility
    // mapping status" are required metadata in both test-context-packet and
    // test-context-retrieval-report (TEST_ONLY_METADATA) but were never
    // read by readiness at all before this batch -- a contradiction between
    // the two documents' mapping-completeness claims was invisible.
    const responsibilityTruncatedOutcome = reconcileDeclaredField(
      nonUnknown(packetInspection.declaredResponsibilityMappingsTruncated),
      nonUnknown(reportInspection.declaredResponsibilityMappingsTruncated),
    );
    if (responsibilityTruncatedOutcome.status === 'disagree') {
      issues.push(
        issue(
          'CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH',
          'error',
          `Packet declares "Responsibility mappings truncated: ${responsibilityTruncatedOutcome.packetValue}"; report declares "${responsibilityTruncatedOutcome.reportValue}".`,
          stageId,
          kind,
          { field: 'responsibilityMappingsTruncated', expected: responsibilityTruncatedOutcome.packetValue, actual: responsibilityTruncatedOutcome.reportValue },
        ),
      );
      setPrimary('responsibility-mappings-truncated');
    }

    const criticalMappingStatusOutcome = reconcileDeclaredField(
      nonUnknown(packetInspection.declaredCriticalResponsibilityMappingStatus),
      nonUnknown(reportInspection.declaredCriticalResponsibilityMappingStatus),
    );
    if (criticalMappingStatusOutcome.status === 'disagree') {
      issues.push(
        issue(
          'CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH',
          'error',
          `Packet declares "Critical responsibility mapping status: ${criticalMappingStatusOutcome.packetValue}"; report declares "${criticalMappingStatusOutcome.reportValue}".`,
          stageId,
          kind,
          { field: 'criticalResponsibilityMappingStatus', expected: criticalMappingStatusOutcome.packetValue, actual: criticalMappingStatusOutcome.reportValue },
        ),
      );
      setPrimary('critical-responsibilities-unmapped');
    }

    const strategyRequirement = findTestStrategySourceRequirement(mode);
    const strategyPath = strategyRequirement ? joinRunPath(runFolder, strategyRequirement.strategyArtifactRelativePath) : undefined;
    const parsed = strategyPath ? readTestResponsibilityBlocks(strategyPath) : undefined;

    if (!parsed) {
      issues.push(issue('CONTEXT_TEST_STRATEGY_MISSING', 'error', `TestStrategyPacket is missing or unreadable: ${strategyPath}`, stageId, kind, { path: strategyPath }));
      setPrimary('test-strategy-missing');
    } else {
      for (const parseIssue of parsed.issues) {
        const severity: ContextReadinessIssueSeverity = 'error';
        issues.push(issue(parseIssue.code, severity, parseIssue.message, stageId, kind, { responsibilityId: parseIssue.responsibilityId }));
      }
      if (
        parsed.issues.some(
          (i) =>
            i.code === 'CONTEXT_TEST_RESPONSIBILITY_ID_MISSING' ||
            i.code === 'CONTEXT_TEST_RESPONSIBILITY_ID_INVALID' ||
            i.code === 'CONTEXT_TEST_RESPONSIBILITY_DUPLICATE',
        )
      ) {
        setPrimary('test-responsibility-invalid');
      }
      if (parsed.issues.some((i) => i.code === 'CONTEXT_TEST_RESPONSIBILITY_CRITICALITY_MISSING' || i.code === 'CONTEXT_TEST_RESPONSIBILITY_CRITICALITY_INVALID')) {
        setPrimary('test-responsibility-criticality-unknown');
      }

      criticalResponsibilitySummary = computeCriticalResponsibilitySummary(parsed, capsule.responsibilityMappings);
      affectedResponsibilityIds = criticalResponsibilitySummary.unmappedCriticalIds;
      for (const w of criticalResponsibilitySummary.noncriticalMappingWarnings) warnings.push(w);

      responsibilityMappingsTruncated = capsule.responsibilityMappingsTruncated ? 'yes' : 'no';
      const criticalFullyMapped = allCriticalResponsibilitiesFullyMapped(criticalResponsibilitySummary);
      if (capsule.responsibilityMappingsTruncated) {
        if (criticalFullyMapped) {
          warnings.push('Responsibility mappings were truncated, but raw evidence shows every critical responsibility remains fully mapped.');
        } else {
          issues.push(issue('CONTEXT_RESPONSIBILITY_MAPPINGS_TRUNCATED', 'error', 'Responsibility mappings were truncated and critical coverage cannot be confirmed.', stageId, kind));
          setPrimary('responsibility-mappings-truncated');
        }
      }
      if (!criticalFullyMapped) {
        const mappingStatusByResponsibility = new Map<string, string>();
        for (const mapping of capsule.responsibilityMappings) {
          if (!mappingStatusByResponsibility.has(mapping.responsibilityId)) {
            mappingStatusByResponsibility.set(mapping.responsibilityId, mapping.mappingStatus);
          }
        }
        const partiallyMappedCriticalIds = parsed.responsibilities
          .filter(
            (responsibility) =>
              responsibility.criticality === 'critical' &&
              mappingStatusByResponsibility.get(responsibility.responsibilityId) === 'partially-mapped',
          )
          .map((responsibility) => responsibility.responsibilityId);
        const missingCriticalIds = affectedResponsibilityIds.filter(
          (responsibilityId) => !partiallyMappedCriticalIds.includes(responsibilityId),
        );
        if (partiallyMappedCriticalIds.length > 0) {
          issues.push(
            issue(
              'CONTEXT_CRITICAL_RESPONSIBILITY_PARTIALLY_MAPPED',
              'error',
              `${partiallyMappedCriticalIds.length} critical responsibilit${partiallyMappedCriticalIds.length === 1 ? 'y is' : 'ies are'} only partially mapped: ${partiallyMappedCriticalIds.join(', ')}`,
              stageId,
              kind,
              { responsibilityId: partiallyMappedCriticalIds[0] },
            ),
          );
        }
        if (missingCriticalIds.length > 0) {
          issues.push(
            issue(
              'CONTEXT_CRITICAL_RESPONSIBILITY_MISSING_MAPPING',
              'error',
              `${missingCriticalIds.length} critical responsibilit${missingCriticalIds.length === 1 ? 'y is' : 'ies are'} unmapped or missing: ${missingCriticalIds.join(', ')}`,
              stageId,
              kind,
              { responsibilityId: missingCriticalIds[0] },
            ),
          );
        }
        setPrimary('critical-responsibilities-unmapped');
      }
    }
  }

  const decision: ContextReadinessDecision = primaryClassification ? 'refresh-required' : 'ready';
  const classification: ContextReadinessClassification = primaryClassification ?? 'ready';

  return base(classification, decision, {
    sourceCapsulePath: declaredSourceCapsulePath,
    sourceAuditPath: declaredSourceAuditPath,
    declaredFreshness,
    evaluatedFreshness,
    declaredAdequacy,
    evaluatedAdequacy,
    requiredEvidenceTruncated,
    responsibilityMappingsTruncated,
    criticalResponsibilitySummary,
    affectedResponsibilityIds,
    indexIdentity: capsule.indexPath,
    readyWithAssumptions: evaluatedAdequacy === 'sufficient-with-assumptions',
    provenanceSummary: `${capsule.provenanceCount} provenance record(s)`,
  });
}

export function notRequiredContextReadiness(stageId: string, kind: SupplementalContextKind, role: SupplementalContextRole): ContextReadinessResult {
  return {
    schemaVersion: CONTEXT_READINESS_SCHEMA_VERSION,
    kind,
    role,
    decision: 'not-required',
    classification: 'not-required',
    stageId,
    packetPath: '',
    reportPath: '',
    issues: [],
    warnings: [],
    blockingIssueCodes: [],
    affectedResponsibilityIds: [],
    evaluatedFreshness: 'unknown',
    evaluatedAdequacy: 'unknown',
    requiredEvidenceTruncated: 'unknown',
    readyWithAssumptions: false,
    provenanceSummary: 'not applicable',
  };
}

function rawStatusToCodeAndClassification(
  status: 'reference-missing' | 'unreadable' | 'malformed' | 'unsupported-schema',
  doc: 'CAPSULE' | 'AUDIT',
): [string, ContextReadinessClassification] {
  switch (status) {
    case 'reference-missing':
    case 'unreadable':
      return [`CONTEXT_SOURCE_${doc}_UNREADABLE`, 'source-reference-unreadable'];
    case 'malformed':
      return [`CONTEXT_SOURCE_${doc}_MALFORMED`, 'source-evidence-malformed'];
    case 'unsupported-schema':
      return [`CONTEXT_SOURCE_${doc}_UNSUPPORTED_SCHEMA`, 'source-evidence-unsupported-schema'];
  }
}

function joinRunPath(runFolder: string, relativePath: string): string {
  return path.join(runFolder, relativePath);
}
