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

export interface ContextReadinessIssue {
  code: string;
  severity: ContextReadinessIssueSeverity;
  message: string;
  stageId: string;
  contextKind: SupplementalContextKind;
  path?: string;
  field?: string;
  responsibilityId?: string;
  expected?: string;
  actual?: string;
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

function packetKindFor(kind: SupplementalContextKind): SupplementalContextDocumentKind {
  return kind === 'implementation' ? 'implementation-context-packet' : 'test-context-packet';
}
function reportKindFor(kind: SupplementalContextKind): SupplementalContextDocumentKind {
  return kind === 'implementation' ? 'implementation-context-retrieval-report' : 'test-context-retrieval-report';
}

function issue(
  code: string,
  severity: ContextReadinessIssueSeverity,
  message: string,
  stageId: string,
  contextKind: SupplementalContextKind,
  extra?: Partial<ContextReadinessIssue>,
): ContextReadinessIssue {
  return { code, severity, message, stageId, contextKind, ...extra };
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
  ): ContextReadinessResult => ({
    schemaVersion: CONTEXT_READINESS_SCHEMA_VERSION,
    kind,
    role,
    decision,
    classification,
    stageId,
    packetPath,
    reportPath,
    issues,
    warnings,
    blockingIssueCodes: issues.filter((i) => i.severity === 'error').map((i) => i.code),
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

  // Both packet and report are structurally populated. Resolve raw-evidence
  // references (prefer the packet's declaration, fall back to the report's).
  const declaredSourceCapsulePath =
    nonUnknown(packetInspection.declaredSourceCapsulePath) ?? nonUnknown(reportInspection.declaredSourceCapsulePath);
  const declaredSourceAuditPath =
    nonUnknown(packetInspection.declaredSourceAuditPath) ?? nonUnknown(reportInspection.declaredSourceAuditPath);

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

  // Declared index identity enforcement (v1.2.2 Batch 2 / F-006). The
  // supplemental packet's "Index identity"/"After index" metadata lines are
  // already parsed (supplementalContextParser.ts) but were never previously
  // compared against the raw evidence they claim to summarize -- an agent
  // could declare any value and it would be silently accepted. "unknown"
  // (the starter-template default) and an absent declaration both remain
  // optional/compatible; only a real declared value that disagrees with the
  // raw evidence blocks.
  const declaredIndexIdentity = nonUnknown(packetInspection.indexIdentity) ?? nonUnknown(reportInspection.indexIdentity);
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

  const declaredAfterIndex = nonUnknown(packetInspection.declaredAfterIndex) ?? nonUnknown(reportInspection.declaredAfterIndex);
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

  // Supplemental/raw consistency (Batch 5 section 8.6): a populated
  // supplemental document's declared freshness/adequacy/truncation must not
  // silently contradict the raw evidence it points to.
  const declaredFreshness = packetInspection.declaredFreshness ?? reportInspection.declaredFreshness;
  const declaredAdequacy = packetInspection.declaredAdequacy ?? reportInspection.declaredAdequacy;
  const declaredTruncated = packetInspection.declaredRequiredEvidenceTruncated ?? reportInspection.declaredRequiredEvidenceTruncated;

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

  if (evaluatedFreshness === 'stale') setPrimary('stale');
  else if (evaluatedFreshness === 'unknown') setPrimary('freshness-unknown');

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
  if (evaluatedAdequacy === 'unknown') setPrimary('adequacy-unknown');
  else if (evaluatedAdequacy === 'insufficient') setPrimary('inadequate');
  else if (evaluatedAdequacy === 'conflict') setPrimary('conflict');

  const requiredEvidenceTruncated: DeclaredTruncation = capsule.truncated
    ? capsule.truncationRequiredEvidenceLost
      ? 'yes'
      : 'no'
    : 'no';
  if (capsule.truncated && capsule.truncationRequiredEvidenceLost) {
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
      if (parsed.issues.some((i) => i.code === 'CONTEXT_TEST_RESPONSIBILITY_ID_MISSING' || i.code === 'CONTEXT_TEST_RESPONSIBILITY_DUPLICATE')) {
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
        issues.push(
          issue('CONTEXT_CRITICAL_RESPONSIBILITY_MISSING_MAPPING', 'error', `${affectedResponsibilityIds.length} critical responsibilit${affectedResponsibilityIds.length === 1 ? 'y is' : 'ies are'} not fully mapped: ${affectedResponsibilityIds.join(', ')}`, stageId, kind, {
            responsibilityId: affectedResponsibilityIds[0],
          }),
        );
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

function nonUnknown(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const trimmed = v.trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === 'unknown') return undefined;
  return trimmed;
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
