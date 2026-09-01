/**
 * Local structural mirror of my-frontend-observer's bounded-agent-context
 * schema 1.0.0. This is deliberately dependency-free: the Orchestrator
 * consumes the published wire contract, it does not run the Observer.
 */

export const OBSERVER_BOUNDED_AGENT_CONTEXT_ARTIFACT_KIND = 'my-frontend-observer/bounded-agent-context' as const;
export const OBSERVER_BOUNDED_AGENT_CONTEXT_SCHEMA_VERSION = '1.0.0' as const;

export const OBSERVER_EVIDENCE_BOUNDS = {
  maxRuntimeTargets: 25,
  maxRelationshipEvidencePerTarget: 10,
  maxOmissions: 50,
  maxTruncations: 50,
  maxCorrelationRecords: 25,
  maxStaticCandidatesPerTarget: 5,
  maxTextSummaryChars: 2000,
  maxEvidenceRefsPerCorrelationField: 10,
} as const;

export type ObserverEvidenceReadiness = 'READY' | 'READY_WITH_PARTIAL_EVIDENCE' | 'BLOCKED_INADEQUATE_EVIDENCE';
export type ObserverEvidenceInvalidDisposition = 'MALFORMED_OBSERVER_ARTIFACT' | 'UNSUPPORTED_OBSERVER_SCHEMA';

export interface ConsumeBoundedObserverEvidenceInput {
  artifact: unknown;
}

export interface ObserverEvidenceReference { path: string; }
export interface ObserverArtifactReference { path: string; kind: string; }
export interface ObserverAdequacyReason { code: string; detail?: string; }
export interface ObserverOmissionRecord { subject: string; reason: string; required: boolean; detail?: string; }
export interface ObserverTruncationRecord { subject: string; limit: number; actualCount: number; required: boolean; }

export interface BoundedObserverEvidenceArtifact {
  artifactKind: typeof OBSERVER_BOUNDED_AGENT_CONTEXT_ARTIFACT_KIND;
  schemaVersion: typeof OBSERVER_BOUNDED_AGENT_CONTEXT_SCHEMA_VERSION;
  contextId: string;
  contextRequestId: string;
  producer: { name: 'my-frontend-observer'; version: string };
  provenance: { generatedAt: string };
  projectionProfile: 'frontend-change-review';
  sources: { observationIds: string[]; comparisonId?: string; comparisonRequestId?: string; baselineContractId?: string; changeContractId?: string; evaluationId?: string; evaluationRequestId?: string; };
  targets: Array<{ targetId: string; geometry?: { x: number; y: number; width: number; height: number; right: number; bottom: number; }; visibility?: { visible: boolean; }; overflow?: { horizontalOverflow: boolean; verticalOverflow: boolean; overflowX: string; overflowY: string; }; scrollOwner?: { kind: 'document' | 'target' | 'none' | 'indeterminate'; target?: string; }; relationshipEvidence?: ObserverEvidenceReference[]; screenshotRef?: ObserverArtifactReference; }>;
  adequacy: { state: 'adequate' | 'partial' | 'inadequate'; reasons: ObserverAdequacyReason[]; };
  omissions: ObserverOmissionRecord[];
  truncations: ObserverTruncationRecord[];
  correlations?: Array<{ runtimeTargetId: string; runtimeEvidenceRefs: ObserverEvidenceReference[]; staticProducer: { name: string; version: string; indexId: string; }; status: 'correlated' | 'ambiguous' | 'unavailable'; candidates: Array<{ candidateId: string; kind: 'file' | 'symbol'; evidenceRefs: ObserverEvidenceReference[]; }>; evidenceBasis?: string; omissions?: ObserverOmissionRecord[]; truncations?: ObserverTruncationRecord[]; provenance: { correlatedAt: string; }; }>;
}

export type ConsumeBoundedObserverEvidenceResult =
  | { ok: true; readiness: ObserverEvidenceReadiness; evidence: BoundedObserverEvidenceArtifact }
  | { ok: false; disposition: ObserverEvidenceInvalidDisposition; reason: string };

const adequacyStates = new Set(['adequate', 'partial', 'inadequate']);
const adequacyReasonCodes = new Set(['required-runtime-target-unavailable', 'required-runtime-property-unavailable', 'required-contract-evidence-unavailable', 'required-evidence-omitted-by-bound', 'static-correlation-ambiguous', 'static-evidence-unavailable', 'required-source-evidence-truncated', 'unsupported-evidence-version', 'consumer-incompatibility']);
const omissionReasons = new Set(['not-observed', 'unsupported-or-unavailable', 'intentionally-irrelevant', 'omitted-by-bound', 'required-evidence-lost-by-bound']);
const correlationStatuses = new Set(['correlated', 'ambiguous', 'unavailable']);

function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function integerAtLeastZero(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0; }
function refs(value: unknown, limit?: number): value is ObserverEvidenceReference[] {
  return Array.isArray(value) && (limit === undefined || value.length <= limit) && value.every((entry) => object(entry) && text(entry.path));
}
function omissions(value: unknown, limit?: number): value is ObserverOmissionRecord[] {
  return Array.isArray(value) && (limit === undefined || value.length <= limit) && value.every((entry) => object(entry) && text(entry.subject) && typeof entry.reason === 'string' && omissionReasons.has(entry.reason) && typeof entry.required === 'boolean' && (entry.detail === undefined || typeof entry.detail === 'string'));
}
function truncations(value: unknown, limit?: number): value is ObserverTruncationRecord[] {
  return Array.isArray(value) && (limit === undefined || value.length <= limit) && value.every((entry) => object(entry) && text(entry.subject) && integerAtLeastZero(entry.limit) && integerAtLeastZero(entry.actualCount) && typeof entry.required === 'boolean');
}
function invalid(disposition: ObserverEvidenceInvalidDisposition, reason: string): ConsumeBoundedObserverEvidenceResult { return { ok: false, disposition, reason }; }

/** Pure, fail-closed consumption of the released Observer v0.6 wire contract. */
export function consumeBoundedObserverEvidence(input: ConsumeBoundedObserverEvidenceInput): ConsumeBoundedObserverEvidenceResult {
  const value = input?.artifact;
  if (!object(value)) return invalid('MALFORMED_OBSERVER_ARTIFACT', 'artifact must be an object');
  if (value.artifactKind !== OBSERVER_BOUNDED_AGENT_CONTEXT_ARTIFACT_KIND) return invalid('MALFORMED_OBSERVER_ARTIFACT', 'artifactKind mismatch');
  if (value.schemaVersion !== OBSERVER_BOUNDED_AGENT_CONTEXT_SCHEMA_VERSION) return invalid('UNSUPPORTED_OBSERVER_SCHEMA', 'schemaVersion is not supported');
  if (!text(value.contextId) || !text(value.contextRequestId)) return invalid('MALFORMED_OBSERVER_ARTIFACT', 'context identity is invalid');
  if (!object(value.producer) || value.producer.name !== 'my-frontend-observer' || !text(value.producer.version)) return invalid('MALFORMED_OBSERVER_ARTIFACT', 'producer identity is invalid');
  if (!object(value.provenance) || !text(value.provenance.generatedAt)) return invalid('MALFORMED_OBSERVER_ARTIFACT', 'provenance is invalid');
  if (value.projectionProfile !== 'frontend-change-review') return invalid('MALFORMED_OBSERVER_ARTIFACT', 'projectionProfile is unsupported');
  if (!object(value.sources) || !Array.isArray(value.sources.observationIds) || value.sources.observationIds.length === 0 || !value.sources.observationIds.every(text)) return invalid('MALFORMED_OBSERVER_ARTIFACT', 'sources are invalid');
  for (const field of ['comparisonId', 'comparisonRequestId', 'baselineContractId', 'changeContractId', 'evaluationId', 'evaluationRequestId'] as const) if (value.sources[field] !== undefined && !text(value.sources[field])) return invalid('MALFORMED_OBSERVER_ARTIFACT', 'sources are invalid');
  if (!Array.isArray(value.targets) || value.targets.length > OBSERVER_EVIDENCE_BOUNDS.maxRuntimeTargets) return invalid('MALFORMED_OBSERVER_ARTIFACT', 'targets are invalid or exceed their bound');
  if (!value.targets.every(validTarget)) return invalid('MALFORMED_OBSERVER_ARTIFACT', 'target projection is invalid');
  if (!object(value.adequacy) || typeof value.adequacy.state !== 'string' || !adequacyStates.has(value.adequacy.state) || !Array.isArray(value.adequacy.reasons) || !value.adequacy.reasons.every(validAdequacyReason) || (value.adequacy.state !== 'adequate' && value.adequacy.reasons.length === 0)) return invalid('MALFORMED_OBSERVER_ARTIFACT', 'adequacy is invalid');
  if (!omissions(value.omissions, OBSERVER_EVIDENCE_BOUNDS.maxOmissions)) return invalid('MALFORMED_OBSERVER_ARTIFACT', 'omissions are invalid or exceed their bound');
  if (!truncations(value.truncations, OBSERVER_EVIDENCE_BOUNDS.maxTruncations)) return invalid('MALFORMED_OBSERVER_ARTIFACT', 'truncations are invalid or exceed their bound');
  if (value.correlations !== undefined && (!Array.isArray(value.correlations) || value.correlations.length > OBSERVER_EVIDENCE_BOUNDS.maxCorrelationRecords || !value.correlations.every(validCorrelation))) return invalid('MALFORMED_OBSERVER_ARTIFACT', 'correlations are invalid or exceed their bound');
  const evidence = projectArtifact(value);
  return { ok: true, readiness: evidence.adequacy.state === 'adequate' ? 'READY' : evidence.adequacy.state === 'partial' ? 'READY_WITH_PARTIAL_EVIDENCE' : 'BLOCKED_INADEQUATE_EVIDENCE', evidence };
}

function validAdequacyReason(value: unknown): boolean { return object(value) && typeof value.code === 'string' && adequacyReasonCodes.has(value.code) && (value.detail === undefined || typeof value.detail === 'string'); }
function validTarget(value: unknown): boolean {
  if (!object(value) || !text(value.targetId)) return false;
  const geometry = value.geometry;
  if (geometry !== undefined && (!object(geometry) || !['x', 'y', 'width', 'height', 'right', 'bottom'].every((key) => typeof geometry[key] === 'number'))) return false;
  if (value.visibility !== undefined && (!object(value.visibility) || typeof value.visibility.visible !== 'boolean')) return false;
  if (value.overflow !== undefined && (!object(value.overflow) || typeof value.overflow.horizontalOverflow !== 'boolean' || typeof value.overflow.verticalOverflow !== 'boolean' || typeof value.overflow.overflowX !== 'string' || typeof value.overflow.overflowY !== 'string')) return false;
  if (value.scrollOwner !== undefined && (!object(value.scrollOwner) || typeof value.scrollOwner.kind !== 'string' || (value.scrollOwner.kind === 'target' ? !text(value.scrollOwner.target) : !['document', 'none', 'indeterminate'].includes(value.scrollOwner.kind)))) return false;
  if (value.relationshipEvidence !== undefined && !refs(value.relationshipEvidence, OBSERVER_EVIDENCE_BOUNDS.maxRelationshipEvidencePerTarget)) return false;
  return value.screenshotRef === undefined || (object(value.screenshotRef) && text(value.screenshotRef.path) && text(value.screenshotRef.kind));
}
function validCorrelation(value: unknown): boolean {
  if (!object(value) || !text(value.runtimeTargetId) || !refs(value.runtimeEvidenceRefs, OBSERVER_EVIDENCE_BOUNDS.maxEvidenceRefsPerCorrelationField)) return false;
  if (!object(value.staticProducer) || !text(value.staticProducer.name) || !text(value.staticProducer.version) || !text(value.staticProducer.indexId)) return false;
  if (typeof value.status !== 'string' || !correlationStatuses.has(value.status) || !Array.isArray(value.candidates) || value.candidates.length > OBSERVER_EVIDENCE_BOUNDS.maxStaticCandidatesPerTarget || !value.candidates.every(validCandidate)) return false;
  if ((value.status === 'correlated' && value.candidates.length !== 1) || (value.status === 'ambiguous' && value.candidates.length < 2) || (value.status === 'unavailable' && value.candidates.length !== 0)) return false;
  if (value.evidenceBasis !== undefined && (typeof value.evidenceBasis !== 'string' || value.evidenceBasis.length > OBSERVER_EVIDENCE_BOUNDS.maxTextSummaryChars)) return false;
  return (value.omissions === undefined || omissions(value.omissions)) && (value.truncations === undefined || truncations(value.truncations)) && object(value.provenance) && text(value.provenance.correlatedAt);
}
function validCandidate(value: unknown): boolean { return object(value) && text(value.candidateId) && ((value.kind === 'file' && value.candidateId.startsWith('file:')) || (value.kind === 'symbol' && value.candidateId.startsWith('symbol:'))) && refs(value.evidenceRefs, OBSERVER_EVIDENCE_BOUNDS.maxEvidenceRefsPerCorrelationField); }

function projectArtifact(value: Record<string, unknown>): BoundedObserverEvidenceArtifact {
  const sources = value.sources as Record<string, unknown>;
  const artifact: BoundedObserverEvidenceArtifact = {
    artifactKind: OBSERVER_BOUNDED_AGENT_CONTEXT_ARTIFACT_KIND,
    schemaVersion: OBSERVER_BOUNDED_AGENT_CONTEXT_SCHEMA_VERSION,
    contextId: value.contextId as string,
    contextRequestId: value.contextRequestId as string,
    producer: { name: 'my-frontend-observer', version: (value.producer as Record<string, unknown>).version as string },
    provenance: { generatedAt: (value.provenance as Record<string, unknown>).generatedAt as string },
    projectionProfile: 'frontend-change-review',
    sources: {
      observationIds: [...(sources.observationIds as string[])],
      ...optionalSourceFields(sources),
    },
    targets: (value.targets as Record<string, unknown>[]).map(projectTarget),
    adequacy: {
      state: (value.adequacy as { state: BoundedObserverEvidenceArtifact['adequacy']['state'] }).state,
      reasons: ((value.adequacy as Record<string, unknown>).reasons as Record<string, unknown>[]).map((reason) => ({ code: reason.code as string, ...(reason.detail === undefined ? {} : { detail: reason.detail as string }) })),
    },
    omissions: (value.omissions as Record<string, unknown>[]).map(projectOmission),
    truncations: (value.truncations as Record<string, unknown>[]).map(projectTruncation),
  };
  if (value.correlations !== undefined) artifact.correlations = (value.correlations as Record<string, unknown>[]).map(projectCorrelation);
  return artifact;
}

function optionalSourceFields(value: Record<string, unknown>): Omit<BoundedObserverEvidenceArtifact['sources'], 'observationIds'> {
  const result: Omit<BoundedObserverEvidenceArtifact['sources'], 'observationIds'> = {};
  for (const field of ['comparisonId', 'comparisonRequestId', 'baselineContractId', 'changeContractId', 'evaluationId', 'evaluationRequestId'] as const) if (value[field] !== undefined) result[field] = value[field] as string;
  return result;
}
function projectTarget(value: Record<string, unknown>): BoundedObserverEvidenceArtifact['targets'][number] {
  const target: BoundedObserverEvidenceArtifact['targets'][number] = { targetId: value.targetId as string };
  if (value.geometry !== undefined) { const geometry = value.geometry as Record<string, unknown>; target.geometry = { x: geometry.x as number, y: geometry.y as number, width: geometry.width as number, height: geometry.height as number, right: geometry.right as number, bottom: geometry.bottom as number }; }
  if (value.visibility !== undefined) { const visibility = value.visibility as Record<string, unknown>; target.visibility = { visible: visibility.visible as boolean }; }
  if (value.overflow !== undefined) { const overflow = value.overflow as Record<string, unknown>; target.overflow = { horizontalOverflow: overflow.horizontalOverflow as boolean, verticalOverflow: overflow.verticalOverflow as boolean, overflowX: overflow.overflowX as string, overflowY: overflow.overflowY as string }; }
  if (value.scrollOwner !== undefined) { const scrollOwner = value.scrollOwner as Record<string, unknown>; target.scrollOwner = { kind: scrollOwner.kind as 'document' | 'target' | 'none' | 'indeterminate', ...(scrollOwner.target === undefined ? {} : { target: scrollOwner.target as string }) }; }
  if (value.relationshipEvidence !== undefined) target.relationshipEvidence = (value.relationshipEvidence as ObserverEvidenceReference[]).map((reference) => ({ path: reference.path }));
  if (value.screenshotRef !== undefined) target.screenshotRef = { ...(value.screenshotRef as ObserverArtifactReference) };
  return target;
}
function projectOmission(value: Record<string, unknown>): ObserverOmissionRecord { return { subject: value.subject as string, reason: value.reason as string, required: value.required as boolean, ...(value.detail === undefined ? {} : { detail: value.detail as string }) }; }
function projectTruncation(value: Record<string, unknown>): ObserverTruncationRecord { return { subject: value.subject as string, limit: value.limit as number, actualCount: value.actualCount as number, required: value.required as boolean }; }
function projectCorrelation(value: Record<string, unknown>): NonNullable<BoundedObserverEvidenceArtifact['correlations']>[number] {
  const correlation: NonNullable<BoundedObserverEvidenceArtifact['correlations']>[number] = {
    runtimeTargetId: value.runtimeTargetId as string,
    runtimeEvidenceRefs: (value.runtimeEvidenceRefs as ObserverEvidenceReference[]).map((reference) => ({ path: reference.path })),
    staticProducer: { ...(value.staticProducer as { name: string; version: string; indexId: string }) },
    status: value.status as 'correlated' | 'ambiguous' | 'unavailable',
    candidates: (value.candidates as Record<string, unknown>[]).map((candidate) => ({ candidateId: candidate.candidateId as string, kind: candidate.kind as 'file' | 'symbol', evidenceRefs: (candidate.evidenceRefs as ObserverEvidenceReference[]).map((reference) => ({ path: reference.path })) })),
    provenance: { correlatedAt: (value.provenance as Record<string, unknown>).correlatedAt as string },
  };
  if (value.evidenceBasis !== undefined) correlation.evidenceBasis = value.evidenceBasis as string;
  if (value.omissions !== undefined) correlation.omissions = (value.omissions as Record<string, unknown>[]).map(projectOmission);
  if (value.truncations !== undefined) correlation.truncations = (value.truncations as Record<string, unknown>[]).map(projectTruncation);
  return correlation;
}
