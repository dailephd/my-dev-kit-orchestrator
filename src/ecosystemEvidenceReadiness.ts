import type { RunEcosystemRecordInspection } from './ecosystemEvidenceStore';
import type { EvidenceEnvelopeV1, SubjectIdentityV1 } from './ecosystemEvidenceContracts';

// Priority is contractual and independent of timestamps, paths and array order.
const CODE_PRIORITY = [
  'ECO_REQUIREMENTS_UNAVAILABLE', 'ECO_REQUIREMENTS_DIGEST_MISMATCH', 'ECO_EVIDENCE_UNAVAILABLE',
  'ECO_SCHEMA_UNSUPPORTED', 'ECO_RECORD_INVALID', 'ECO_DUPLICATE_ID', 'ECO_EVIDENCE_CONFLICT',
  'ECO_REQUIREMENT_MISSING_EVIDENCE', 'ECO_EVIDENCE_UNSUPPORTED_PRODUCER', 'ECO_EVIDENCE_UNSUPPORTED_KIND',
  'ECO_EVIDENCE_SUBJECT_MISMATCH', 'ECO_EVIDENCE_ENVIRONMENT_MISMATCH', 'ECO_EVIDENCE_FRESHNESS_UNACCEPTABLE',
  'ECO_EVIDENCE_NATIVE_VALIDATION_FAILED', 'ECO_EVIDENCE_RUNTIME_PROOF_MISSING',
  'ECO_EVIDENCE_RESPONSIBILITY_UNCORROBORATED', 'ECO_COMPATIBILITY_UNVERIFIED',
] as const;
export type EcosystemEvidenceIssueCode = typeof CODE_PRIORITY[number];
export interface EcosystemNativeAdapterResult {
  evidenceId: string;
  issueCodes: EcosystemEvidenceIssueCode[];
  subject?: SubjectIdentityV1;
  responsibilityIds?: string[];
  // Only supported native facts; used to detect contradictions, never latest-wins.
  identityKey?: string;
  factSignature?: string;
}
export interface RunEcosystemEvidenceReadiness {
  schemaVersion: '1.0.0';
  required: boolean;
  ready: boolean;
  classification: 'not-required' | 'ready' | 'warning' | 'blocked';
  requirements: Array<{
    requirementId: string; capabilityId: string; criticality: 'critical' | 'noncritical';
    state: 'satisfied' | 'unmet-critical' | 'unmet-noncritical';
    matchingEvidenceIds: string[]; issueCodes: EcosystemEvidenceIssueCode[];
  }>;
  blockingCodes: EcosystemEvidenceIssueCode[];
  warningCodes: EcosystemEvidenceIssueCode[];
  primaryBlockingCode?: EcosystemEvidenceIssueCode;
  primaryBlockingReason?: string;
  recommendedCorrectionStage: string | null;
}
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const order = (codes: readonly EcosystemEvidenceIssueCode[]): EcosystemEvidenceIssueCode[] =>
  [...new Set(codes)].sort((a, b) => CODE_PRIORITY.indexOf(a) - CODE_PRIORITY.indexOf(b));
function sameSubject(a: SubjectIdentityV1, b: SubjectIdentityV1): boolean {
  return a.authority === b.authority && a.namespace === b.namespace && a.value === b.value &&
    (!a.repository || Boolean(b.repository && a.repository.owner === b.repository.owner &&
      a.repository.name === b.repository.name && (!a.repository.commit || a.repository.commit === b.repository.commit)));
}
function envelopeIssues(e: EvidenceEnvelopeV1, snapshot: RunEcosystemRecordInspection, native?: EcosystemNativeAdapterResult): EcosystemEvidenceIssueCode[] {
  const doc = snapshot.requirements!;
  const codes: EcosystemEvidenceIssueCode[] = [];
  if (!sameSubject(doc.subject, e.subject) || !native?.subject || !sameSubject(doc.subject, native.subject)) codes.push('ECO_EVIDENCE_SUBJECT_MISMATCH');
  if (doc.environment) {
    const keys = Object.keys(doc.environment.dimensions).sort(compare);
    if (!e.environment || doc.environment.environmentId !== e.environment.environmentId ||
      keys.length !== Object.keys(e.environment.dimensions).length || keys.some(k => doc.environment!.dimensions[k] !== e.environment!.dimensions[k])) {
      codes.push('ECO_EVIDENCE_ENVIRONMENT_MISMATCH');
    }
    // Neither supported producer supplies native execution-environment attestation.
    codes.push('ECO_EVIDENCE_ENVIRONMENT_MISMATCH');
  }
  if (e.freshness !== 'current') codes.push('ECO_EVIDENCE_FRESHNESS_UNACCEPTABLE');
  codes.push(...(native?.issueCodes ?? ['ECO_COMPATIBILITY_UNVERIFIED']));
  return codes;
}

/** Pure join over a storage-validated, digest-verified snapshot and bounded native facts. */
export function evaluateRunEcosystemEvidenceReadiness(
  snapshot: RunEcosystemRecordInspection,
  adapters: readonly EcosystemNativeAdapterResult[] = [],
): RunEcosystemEvidenceReadiness {
  const base: RunEcosystemEvidenceReadiness = {
    schemaVersion: '1.0.0', required: snapshot.activated, ready: true,
    classification: snapshot.activated ? 'ready' : 'not-required', requirements: [],
    blockingCodes: [], warningCodes: [], recommendedCorrectionStage: null,
  };
  if (!snapshot.activated) return base;
  const global: EcosystemEvidenceIssueCode[] = [...snapshot.issues];
  for (const native of adapters) global.push(...native.issueCodes.filter(c => c === 'ECO_DUPLICATE_ID' || c === 'ECO_EVIDENCE_CONFLICT'));
  if (!snapshot.requirements || !snapshot.evidence) {
    if (!global.length) global.push('ECO_RECORD_INVALID');
  } else {
    const requirements = [...snapshot.requirements.requirements].sort((a, b) => compare(a.requirementId, b.requirementId));
    const evidence = [...snapshot.evidence.evidence].sort((a, b) => compare(a.evidenceId, b.evidenceId));
    if (new Set(requirements.map(r => r.requirementId)).size !== requirements.length ||
      new Set(evidence.map(e => e.evidenceId)).size !== evidence.length ||
      new Set(adapters.map(a => a.evidenceId)).size !== adapters.length) global.push('ECO_DUPLICATE_ID');
    const facts = new Map<string, string>();
    for (const a of [...adapters].sort((a, b) => compare(a.evidenceId, b.evidenceId))) {
      if (a.identityKey && a.factSignature) {
        if (facts.has(a.identityKey) && facts.get(a.identityKey) !== a.factSignature) global.push('ECO_EVIDENCE_CONFLICT');
        facts.set(a.identityKey, a.factSignature);
      }
    }
    for (const r of requirements) {
      const candidates = evidence.filter(e => e.capabilityId === r.capabilityId);
      const issues: EcosystemEvidenceIssueCode[] = [];
      if (!['my-dev-kit/static-context', 'my-frontend-observer/frontend-change-review'].includes(r.capabilityId)) issues.push('ECO_COMPATIBILITY_UNVERIFIED');
      const matchingEvidenceIds: string[] = [];
      for (const e of candidates) {
        const native = adapters.find(a => a.evidenceId === e.evidenceId);
        const codes = envelopeIssues(e, snapshot, native);
        if (!r.acceptedArtifactKinds.includes(e.nativeArtifact.artifactKind)) codes.push('ECO_EVIDENCE_UNSUPPORTED_KIND');
        if (r.responsibility && (r.responsibility.authority !== '@dailephd/my-dev-kit-orchestrator' ||
          r.responsibility.namespace !== 'my-dev-kit-orchestrator/semantic-responsibility' ||
          !/^RSP-\d{3}$/.test(r.responsibility.value) || !native?.responsibilityIds?.includes(r.responsibility.value))) {
          codes.push('ECO_EVIDENCE_RESPONSIBILITY_UNCORROBORATED');
        }
        if (codes.length) issues.push(...codes); else matchingEvidenceIds.push(e.evidenceId);
      }
      // A negative applicable fact cannot be outweighed by another positive item.
      const satisfied = matchingEvidenceIds.length > 0 && issues.length === 0;
      if (!satisfied) issues.push('ECO_REQUIREMENT_MISSING_EVIDENCE');
      const issueCodes = order(issues);
      base.requirements.push({ requirementId: r.requirementId, capabilityId: r.capabilityId,
        criticality: r.criticality, state: satisfied ? 'satisfied' : r.criticality === 'critical' ? 'unmet-critical' : 'unmet-noncritical',
        matchingEvidenceIds, issueCodes });
      if (!satisfied) (r.criticality === 'critical' ? base.blockingCodes : base.warningCodes).push(...issueCodes);
    }
    for (const e of evidence.filter(e => !requirements.some(r => r.capabilityId === e.capabilityId))) {
      base.warningCodes.push(...(adapters.find(a => a.evidenceId === e.evidenceId)?.issueCodes ?? ['ECO_COMPATIBILITY_UNVERIFIED']));
    }
  }
  base.blockingCodes = order([...global, ...base.blockingCodes]);
  base.warningCodes = order(base.warningCodes);
  base.ready = base.blockingCodes.length === 0;
  base.classification = !base.ready ? 'blocked' : base.warningCodes.length ? 'warning' : 'ready';
  if (!base.ready) {
    base.primaryBlockingCode = base.blockingCodes[0];
    base.primaryBlockingReason = `Ecosystem evidence blocked: ${base.primaryBlockingCode}. Refresh native evidence and replace the run evidence snapshot.`;
  }
  return base;
}
