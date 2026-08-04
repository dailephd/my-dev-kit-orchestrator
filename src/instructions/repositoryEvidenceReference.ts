// Builds an aggregate RepositoryEvidenceReference for one context-sensitive
// stage by reading (read-only) its packet and report files and classifying
// each with the supplemental-context parser. Never writes a file, never
// executes my-dev-kit, never evaluates whether a declared value is true.

import { inspectSupplementalContextFile } from './supplementalContextParser';
import { ROLE_BY_DOCUMENT_KIND } from './supplementalContextContracts';
import {
  DeclaredAdequacy,
  DeclaredFreshness,
  DeclaredTruncation,
  RepositoryEvidenceAggregateStatus,
  SupplementalContextDocumentKind,
  SupplementalContextDocumentStatus,
  SupplementalContextInspection,
  SupplementalContextParserIssue,
} from './supplementalContextTypes';
import { StageRepositoryEvidenceRequirement } from './stageRepositoryEvidenceRequirements';
import { RepositoryEvidenceReference } from './stageContextBundle';

function packetKindFor(kind: 'implementation' | 'test'): SupplementalContextDocumentKind {
  return kind === 'implementation' ? 'implementation-context-packet' : 'test-context-packet';
}

function reportKindFor(kind: 'implementation' | 'test'): SupplementalContextDocumentKind {
  return kind === 'implementation' ? 'implementation-context-retrieval-report' : 'test-context-retrieval-report';
}

// Deterministic precedence, most-severe first. See AGENTS.txt Batch 4
// section 16.4 for the required distinctions (both missing, template
// present, both populated, partial, malformed, unsupported schema,
// incompatible).
function aggregateStatus(
  packetStatus: SupplementalContextDocumentStatus,
  reportStatus: SupplementalContextDocumentStatus,
): RepositoryEvidenceAggregateStatus {
  if (packetStatus === 'malformed' || reportStatus === 'malformed') return 'malformed';
  if (packetStatus === 'unsupported-schema' || reportStatus === 'unsupported-schema') return 'unsupported-schema';
  if (
    packetStatus === 'kind-mismatch' ||
    reportStatus === 'kind-mismatch' ||
    packetStatus === 'role-mismatch' ||
    reportStatus === 'role-mismatch'
  ) {
    return 'incompatible';
  }
  if (packetStatus === 'missing' && reportStatus === 'missing') return 'missing';
  if (packetStatus === 'missing' || reportStatus === 'missing') return 'partial';
  if (packetStatus === 'template' && reportStatus === 'template') return 'template';
  if (packetStatus === 'populated' && reportStatus === 'populated') return 'populated';
  // One template, one populated: evidence is not uniformly ready.
  return 'partial';
}

function pickDeclared<T>(packetValue: T | undefined, reportValue: T | undefined): T | undefined {
  return packetValue ?? reportValue;
}

export function buildRepositoryEvidenceReference(
  requirement: StageRepositoryEvidenceRequirement,
  paths: { packetPath: string; reportPath: string },
): RepositoryEvidenceReference {
  const expectedRole = ROLE_BY_DOCUMENT_KIND[packetKindFor(requirement.kind)];

  const packetInspection: SupplementalContextInspection = inspectSupplementalContextFile(
    paths.packetPath,
    packetKindFor(requirement.kind),
    expectedRole,
  );
  const reportInspection: SupplementalContextInspection = inspectSupplementalContextFile(
    paths.reportPath,
    reportKindFor(requirement.kind),
    expectedRole,
  );

  const status = aggregateStatus(packetInspection.status, reportInspection.status);

  const warnings = [...packetInspection.warnings, ...reportInspection.warnings];
  const issues: SupplementalContextParserIssue[] = [...packetInspection.issues, ...reportInspection.issues];

  const declaredFreshness: DeclaredFreshness | undefined = pickDeclared(
    packetInspection.declaredFreshness,
    reportInspection.declaredFreshness,
  );
  const declaredAdequacy: DeclaredAdequacy | undefined = pickDeclared(
    packetInspection.declaredAdequacy,
    reportInspection.declaredAdequacy,
  );
  const requiredEvidenceTruncated: DeclaredTruncation | undefined = pickDeclared(
    packetInspection.declaredRequiredEvidenceTruncated,
    reportInspection.declaredRequiredEvidenceTruncated,
  );

  const reference: RepositoryEvidenceReference = {
    kind: requirement.kind,
    role: requirement.role,
    packetPath: paths.packetPath,
    reportPath: paths.reportPath,
    packetRelativePath: requirement.packetRelativePath,
    reportRelativePath: requirement.reportRelativePath,
    packetStatus: packetInspection.status,
    reportStatus: reportInspection.status,
    status,
    requiredForStage: requirement.requiredForStage,
    enforcement: requirement.enforcement,
    declaredFreshness,
    declaredAdequacy,
    requiredEvidenceTruncated,
    packetSchemaVersion: packetInspection.declaredSchemaVersion,
    reportSchemaVersion: reportInspection.declaredSchemaVersion,
    toolName: pickDeclared(packetInspection.toolName, reportInspection.toolName),
    toolVersion: pickDeclared(packetInspection.toolVersion, reportInspection.toolVersion),
    indexIdentity: pickDeclared(packetInspection.indexIdentity, reportInspection.indexIdentity),
    warnings,
    issues,
  };

  if (requirement.kind === 'test') {
    reference.responsibilityMappingsTruncated = pickDeclared(
      packetInspection.declaredResponsibilityMappingsTruncated,
      reportInspection.declaredResponsibilityMappingsTruncated,
    );
    reference.criticalResponsibilityMappingStatus = pickDeclared(
      packetInspection.declaredCriticalResponsibilityMappingStatus,
      reportInspection.declaredCriticalResponsibilityMappingStatus,
    );
  }

  return reference;
}
