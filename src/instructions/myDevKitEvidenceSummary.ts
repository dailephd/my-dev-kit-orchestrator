// Minimal, bounded projection of raw my-dev-kit context-capsule and
// retrieval-audit JSON documents (Batch 5). Parses only the fields the
// orchestrator's readiness engine needs; it does not reproduce my-dev-kit's
// ranking, graph traversal, evidence selection, freshness algorithm, or
// adequacy algorithm -- those remain my-dev-kit's authority (AGENTS.txt
// Batch 5 section 3.1). Field shapes are taken from the verified v1.10.2
// fixtures at tests/fixtures/context-contracts/my-dev-kit-1.10.2/, not from
// invented names: capsule and audit documents share the same top-level
// result fields (schemaVersion, tool, index, request, roleContext,
// roleAdequacy, freshness, responsibilityMappings, truncation, provenance,
// warnings) -- the audit additionally carries a "steps" trail.

import * as fs from 'fs';
import * as path from 'path';
import { identityPathsEqual } from './contextIdentity';
import { createHash } from 'crypto';
import { assertEcosystemPathSafety } from '../ecosystemEvidenceStore';
import type { EvidenceEnvelopeV1 } from '../ecosystemEvidenceContracts';
import type { EcosystemNativeAdapterResult } from '../ecosystemEvidenceReadiness';

export const RAW_CONTEXT_CAPSULE_SUPPORTED_MAJOR = 1;
export const RAW_RETRIEVAL_AUDIT_SUPPORTED_MAJOR = 1;

// Bounded projection of a producer EvidenceItemRef (v1.5 Batch 1): only the
// identity fields the implementation-evidence bridge matches exactly.
export interface RawEvidenceItemRef {
  id: string;
  itemKind?: string;
  path?: string;
  symbolId?: string;
  nodeId?: string;
}

export interface RawResponsibilityMappingEntry {
  responsibilityId: string;
  mappingStatus: string;
  // Producer responsibilityMappings.mappings[].productionSymbols. Optional in
  // the type so pre-existing literals stay valid; the parser always populates
  // it ([] when the producer omitted it, as older schema-major-1 producers do).
  // Request-scoped in my-dev-kit 1.12.4: may be shared across mappings, so it
  // corroborates repository identity only, never per-responsibility causality.
  productionSymbols?: RawEvidenceItemRef[];
  // Producer responsibilityMappings.mappings[].proposedOrExistingTestFiles
  // (v1.5 Batch 2). File-level test evidence only; same optional/[]-default
  // and fail-closed rules as productionSymbols.
  proposedOrExistingTestFiles?: RawEvidenceItemRef[];
  // v1.6.1: typed, count/enum-level projections of producer mapping fields the
  // phase-aware test-context policy classifies on (never prose). All optional
  // and parser-populated; absent producer fields project to 0 / undefined so
  // older schema-major-1 producers stay loadable and fail closed in the policy.
  // contracts + validators + constants + errors evidence items (the producer's
  // "contract, validator, or error evidence" category).
  contractLikeEvidenceCount?: number;
  testCommandCount?: number;
  oracleEvidenceCount?: number;
  // Producer mappings[].unresolvedReasons (fixed producer vocabulary).
  unresolvedReasons?: string[];
}

// Bounded projection of my-dev-kit v1.10.4's additive `roleConditionCoverage`
// (AGENTS.txt Batch 1 / v1.2.3): condition-aware role adequacy with retained
// required-condition witnesses and lost-required-condition diagnostics. Not
// present on schema-major-1 artifacts from older producers (v1.10.1-1.10.3);
// absence is legacy-compatible and yields an empty array, never a rejection.
export interface RawRoleConditionCoverageEntry {
  conditionId: string;
  role: string;
  required: boolean;
  retainedWitnessIds: string[];
  conditionSatisfied: boolean;
  lostRequiredCondition: boolean;
}

export interface RawEvidenceProjection {
  schemaVersion: string;
  schemaMajor: number;
  toolName?: string;
  toolVersion?: string;
  indexPath?: string;
  manifestPath?: string;
  projectRoot?: string;
  requestRole?: string;
  roleContextRole?: string;
  roleAdequacyStatus?: string;
  overallAdequacyStatus?: string;
  freshnessState?: string;
  freshnessRole?: string;
  freshnessAfterIndexDeclared: boolean;
  freshnessAfterIndexPath: string | null;
  freshnessBeforeIndexDeclared: boolean;
  freshnessBeforeIndexPath: string | null;
  responsibilityMappings: RawResponsibilityMappingEntry[];
  responsibilityMappingsTruncated: boolean;
  truncated: boolean;
  truncationRequiredEvidenceLost: boolean;
  roleConditionCoverage: RawRoleConditionCoverageEntry[];
  // Derived: true when any *required* condition reports lostRequiredCondition
  // (v1.10.4's corrected requiredEvidenceLost signal). Kept independent from
  // truncationRequiredEvidenceLost so readiness can surface a required
  // role-condition witness loss even when it does not want to conflate the
  // two diagnostics.
  requiredConditionWitnessLost: boolean;
  fullFileFallbackUsed: boolean;
  provenanceCount: number;
  warnings: string[];
}

export type RawEvidenceReadStatus = 'reference-missing' | 'unreadable' | 'malformed' | 'unsupported-schema';

export type RawEvidenceParseResult =
  | { ok: true; projection: RawEvidenceProjection }
  | { ok: false; status: RawEvidenceReadStatus; declaredSchemaVersion?: string; message: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidSchemaVersion(v: unknown): v is string {
  return typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

// Validates the additive v1.10.4 `roleConditionCoverage` field. Absence is
// legacy-compatible ([]). Presence with the wrong shape is a malformed raw
// evidence document, not a value to silently drop or reinterpret -- a
// producer that emits this field at all is expected to emit it correctly.
function validateRoleConditionCoverage(value: unknown): RawRoleConditionCoverageEntry[] | 'malformed' {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return 'malformed';
  const entries: RawRoleConditionCoverageEntry[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) return 'malformed';
    const { conditionId, role, required, retainedWitnessIds, conditionSatisfied, lostRequiredCondition } = item;
    if (
      typeof conditionId !== 'string' ||
      conditionId.length === 0 ||
      typeof role !== 'string' ||
      role.length === 0 ||
      typeof required !== 'boolean' ||
      typeof conditionSatisfied !== 'boolean' ||
      typeof lostRequiredCondition !== 'boolean' ||
      !Array.isArray(retainedWitnessIds) ||
      !retainedWitnessIds.every((w) => typeof w === 'string')
    ) {
      return 'malformed';
    }
    entries.push({
      conditionId,
      role,
      required,
      retainedWitnessIds: [...retainedWitnessIds],
      conditionSatisfied,
      lostRequiredCondition,
    });
  }
  return entries;
}

// Validates an additive per-mapping evidence-item list (`productionSymbols`,
// `proposedOrExistingTestFiles`). Absent is legacy-compatible ([]);
// present-but-malformed is a malformed document.
function validateEvidenceItems(value: unknown): RawEvidenceItemRef[] | 'malformed' {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return 'malformed';
  const items: RawEvidenceItemRef[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) return 'malformed';
    if (typeof item.id !== 'string' || item.id.length === 0) return 'malformed';
    const ref: RawEvidenceItemRef = { id: item.id };
    for (const key of ['itemKind', 'path', 'symbolId', 'nodeId'] as const) {
      const v = item[key];
      if (v === undefined) continue;
      if (typeof v !== 'string') return 'malformed';
      ref[key] = v;
    }
    items.push(ref);
  }
  return items;
}

const CONSUMED_EVIDENCE_ITEM_FIELDS = ['productionSymbols', 'proposedOrExistingTestFiles'] as const;

function hasMalformedEvidenceItems(data: Record<string, unknown>): boolean {
  const rm = data.responsibilityMappings;
  if (!isPlainObject(rm) || !Array.isArray(rm.mappings)) return false;
  return rm.mappings.some(
    (m) =>
      isPlainObject(m) &&
      CONSUMED_EVIDENCE_ITEM_FIELDS.some((field) => validateEvidenceItems(m[field]) === 'malformed'),
  );
}

function projectRawEvidence(
  data: Record<string, unknown>,
  schemaMajor: number,
  roleConditionCoverage: RawRoleConditionCoverageEntry[],
): RawEvidenceProjection {
  const tool = isPlainObject(data.tool) ? data.tool : {};
  const index = isPlainObject(data.index) ? data.index : {};
  const request = isPlainObject(data.request) ? data.request : {};
  const roleContext = isPlainObject(data.roleContext) ? data.roleContext : {};
  const roleAdequacy = isPlainObject(data.roleAdequacy) ? data.roleAdequacy : {};
  const contextAdequacy = isPlainObject(data.contextAdequacy) ? data.contextAdequacy : {};
  const freshness = isPlainObject(data.freshness) ? data.freshness : {};
  const responsibilityMappingsRaw = isPlainObject(data.responsibilityMappings) ? data.responsibilityMappings : {};
  const truncation = isPlainObject(data.truncation) ? data.truncation : {};
  const fullFileFallback = isPlainObject(data.fullFileFallback) ? data.fullFileFallback : {};

  let freshnessAfterIndexDeclared = false;
  let freshnessAfterIndexPath: string | null = null;
  let freshnessBeforeIndexDeclared = false;
  let freshnessBeforeIndexPath: string | null = null;
  if (Array.isArray(freshness.comparedIdentities)) {
    const afterEntry = freshness.comparedIdentities.find(
      (e): e is { label: unknown; value: unknown } => isPlainObject(e) && e.label === 'afterIndexPath',
    );
    if (afterEntry) {
      freshnessAfterIndexDeclared = true;
      freshnessAfterIndexPath = asString(afterEntry.value) ?? null;
    }
    const beforeEntry = freshness.comparedIdentities.find(
      (e): e is { label: unknown; value: unknown } => isPlainObject(e) && e.label === 'beforeIndexPath',
    );
    if (beforeEntry) {
      freshnessBeforeIndexDeclared = true;
      freshnessBeforeIndexPath = asString(beforeEntry.value) ?? null;
    }
  }

  const mappingsRaw = Array.isArray(responsibilityMappingsRaw.mappings) ? responsibilityMappingsRaw.mappings : [];
  const responsibilityMappings: RawResponsibilityMappingEntry[] = mappingsRaw
    .filter(isPlainObject)
    .map((m) => ({
      responsibilityId: asString(m.responsibilityId) ?? '',
      mappingStatus: asString(m.mappingStatus) ?? 'unmapped',
      productionSymbols: validateEvidenceItems(m.productionSymbols) as RawEvidenceItemRef[],
      proposedOrExistingTestFiles: validateEvidenceItems(m.proposedOrExistingTestFiles) as RawEvidenceItemRef[],
      contractLikeEvidenceCount: ['contracts', 'validators', 'constants', 'errors'].reduce(
        (total, key) => total + (Array.isArray(m[key]) ? (m[key] as unknown[]).length : 0),
        0,
      ),
      testCommandCount: Array.isArray(m.testCommands) ? m.testCommands.length : 0,
      oracleEvidenceCount: Array.isArray(m.oracleEvidence) ? m.oracleEvidence.length : 0,
      unresolvedReasons: Array.isArray(m.unresolvedReasons)
        ? m.unresolvedReasons.filter((reason): reason is string => typeof reason === 'string')
        : [],
    }))
    .filter((m) => m.responsibilityId.length > 0);

  const truncationRecords = Array.isArray(truncation.records) ? truncation.records : [];
  const truncationRequiredEvidenceLost = truncationRecords.some(
    (r) => isPlainObject(r) && r.requiredEvidenceLost === true,
  );

  const provenance = data.provenance;
  const provenanceCount = Array.isArray(provenance)
    ? provenance.length
    : isPlainObject(provenance)
      ? Object.keys(provenance).length
      : 0;

  return {
    schemaVersion: asString(data.schemaVersion) as string,
    schemaMajor,
    toolName: asString(tool.name),
    toolVersion: asString(tool.version),
    indexPath: asString(index.indexPath),
    manifestPath: asString(index.manifestPath),
    projectRoot: asString(index.projectRoot),
    requestRole: asString(request.role),
    roleContextRole: asString(roleContext.role),
    roleAdequacyStatus: asString(roleAdequacy.status),
    overallAdequacyStatus: asString(contextAdequacy.status),
    freshnessState: asString(freshness.state),
    freshnessRole: asString(freshness.role),
    freshnessAfterIndexDeclared,
    freshnessAfterIndexPath,
    freshnessBeforeIndexDeclared,
    freshnessBeforeIndexPath,
    responsibilityMappings,
    responsibilityMappingsTruncated: asBoolean(responsibilityMappingsRaw.truncated),
    truncated: asBoolean(truncation.truncated),
    truncationRequiredEvidenceLost,
    roleConditionCoverage,
    requiredConditionWitnessLost: roleConditionCoverage.some((c) => c.required && c.lostRequiredCondition),
    fullFileFallbackUsed: (typeof fullFileFallback.used === 'number' ? fullFileFallback.used : 0) > 0,
    provenanceCount,
    warnings: Array.isArray(data.warnings) ? data.warnings.filter((w): w is string => typeof w === 'string') : [],
  };
}

function parseRawEvidenceText(text: string, supportedMajor: number): RawEvidenceParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, status: 'malformed', message: 'Raw evidence file is not valid JSON.' };
  }
  if (!isPlainObject(data)) {
    return { ok: false, status: 'malformed', message: 'Raw evidence JSON must be a top-level object.' };
  }
  if (!isValidSchemaVersion(data.schemaVersion)) {
    return { ok: false, status: 'malformed', message: 'Raw evidence JSON is missing a valid "schemaVersion".' };
  }
  const major = parseInt((data.schemaVersion as string).split('.')[0], 10);
  if (major !== supportedMajor) {
    return {
      ok: false,
      status: 'unsupported-schema',
      declaredSchemaVersion: data.schemaVersion as string,
      message: `Unsupported schema major ${major}; supported major is ${supportedMajor}.`,
    };
  }
  const roleConditionCoverage = validateRoleConditionCoverage(data.roleConditionCoverage);
  if (roleConditionCoverage === 'malformed') {
    return { ok: false, status: 'malformed', message: 'Raw evidence JSON declares a malformed "roleConditionCoverage" field.' };
  }
  if (hasMalformedEvidenceItems(data)) {
    return {
      ok: false,
      status: 'malformed',
      message: 'Raw evidence JSON declares a malformed "productionSymbols" or "proposedOrExistingTestFiles" field in a responsibility mapping.',
    };
  }
  return { ok: true, projection: projectRawEvidence(data, major, roleConditionCoverage) };
}

// Path safety: reject traversal sequences in the raw declared string (before
// resolution, matching src/commands/export.ts's isSafePath convention),
// reject URL schemes and NUL bytes, and reject directories. Absolute local
// paths are allowed -- raw my-dev-kit evidence is typically written outside
// the run folder, at whatever --out location the user chose when running
// the CLI manually (see AGENTS.txt Batch 5 section 8.7).
export function resolveRawEvidencePath(declaredPath: string, runFolder: string): { safe: boolean; resolved: string; reason?: string } {
  if (declaredPath.includes('\0')) {
    return { safe: false, resolved: declaredPath, reason: 'path contains a NUL byte' };
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(declaredPath)) {
    return { safe: false, resolved: declaredPath, reason: 'path is a URL, not a local file path' };
  }
  if (declaredPath.includes('..')) {
    return { safe: false, resolved: declaredPath, reason: 'path contains path traversal (..)' };
  }
  const resolved = path.isAbsolute(declaredPath) ? path.normalize(declaredPath) : path.resolve(runFolder, declaredPath);
  return { safe: true, resolved };
}

export function readRawEvidenceFile(
  declaredPath: string,
  runFolder: string,
  supportedMajor: number,
): RawEvidenceParseResult {
  const { safe, resolved, reason } = resolveRawEvidencePath(declaredPath, runFolder);
  if (!safe) {
    return { ok: false, status: 'unreadable', message: `Rejected raw evidence path: ${reason}` };
  }
  if (!fs.existsSync(resolved)) {
    return { ok: false, status: 'reference-missing', message: `Raw evidence file does not exist: ${resolved}` };
  }
  if (fs.statSync(resolved).isDirectory()) {
    return { ok: false, status: 'unreadable', message: `Raw evidence path is a directory: ${resolved}` };
  }
  let text: string;
  try {
    text = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    return { ok: false, status: 'unreadable', message: `Failed to read raw evidence file: ${(err as Error).message}` };
  }
  return parseRawEvidenceText(text, supportedMajor);
}

export function readRawContextCapsule(declaredPath: string, runFolder: string): RawEvidenceParseResult {
  return readRawEvidenceFile(declaredPath, runFolder, RAW_CONTEXT_CAPSULE_SUPPORTED_MAJOR);
}

export function readRawRetrievalAudit(declaredPath: string, runFolder: string): RawEvidenceParseResult {
  return readRawEvidenceFile(declaredPath, runFolder, RAW_RETRIEVAL_AUDIT_SUPPORTED_MAJOR);
}

/** Bounded ECO adapter for the pinned Kit wire contract; legacy readers remain unchanged. */
export function readKitEcosystemEvidence(envelope: EvidenceEnvelopeV1, runFolder: string, projectRoot?: string): EcosystemNativeAdapterResult {
  const result: EcosystemNativeAdapterResult = { evidenceId: envelope.evidenceId, issueCodes: [] };
  const ref = envelope.nativeArtifact;
  if (ref.producer.packageName !== '@dailephd/my-dev-kit' || ref.producer.packageVersion !== '1.12.5') {
    result.issueCodes.push('ECO_EVIDENCE_UNSUPPORTED_PRODUCER');
    return result;
  }
  if (!['my-dev-kit/context-capsule', 'my-dev-kit/retrieval-audit'].includes(ref.artifactKind)) {
    result.issueCodes.push('ECO_EVIDENCE_UNSUPPORTED_KIND');
    return result;
  }
  if (envelope.capabilityId !== 'my-dev-kit/static-context') result.issueCodes.push('ECO_EVIDENCE_RUNTIME_PROOF_MISSING');
  if (ref.artifactSchemaVersion !== '1.0.0') result.issueCodes.push('ECO_SCHEMA_UNSUPPORTED');
  if (ref.locator.kind !== 'path') {
    result.issueCodes.push('ECO_EVIDENCE_NATIVE_VALIDATION_FAILED');
    return result;
  }
  try {
    const resolved = resolveRawEvidencePath(ref.locator.value, runFolder);
    if (!resolved.safe) throw new Error();
    // Both owning roots already exist: run-scoped files and the run's project.
    const roots = [runFolder, ...(projectRoot ? [projectRoot] : [])];
    const trustedRoot = roots.find(root => {
      const relative = path.relative(path.resolve(root), path.resolve(resolved.resolved));
      return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    });
    if (!trustedRoot) throw new Error();
    assertEcosystemPathSafety(resolved.resolved, true, true, trustedRoot);
    if (['ecosystem-requirements.json', 'ecosystem-evidence.json'].includes(path.basename(resolved.resolved))) throw new Error();
    const fd = fs.openSync(resolved.resolved, 'r');
    let bytes: Buffer;
    try {
      const size = fs.fstatSync(fd).size;
      if (size > 4 * 1024 * 1024) throw new Error();
      bytes = Buffer.alloc(size + 1);
      const count = fs.readSync(fd, bytes, 0, bytes.length, 0);
      if (count !== size) throw new Error();
      bytes = bytes.subarray(0, count);
    } finally { fs.closeSync(fd); }
    if (ref.integrity && createHash('sha256').update(bytes).digest('hex') !== ref.integrity.sha256) throw new Error();
    const raw: unknown = JSON.parse(bytes.toString('utf8'));
    if (!isPlainObject(raw) || (ref.artifactKind === 'my-dev-kit/retrieval-audit' ? !Array.isArray(raw.steps) : !isPlainObject(raw.selectedGraph))) throw new Error();
    const parsed = parseRawEvidenceText(bytes.toString('utf8'), 1);
    if (!parsed.ok) {
      result.issueCodes.push(parsed.status === 'unsupported-schema' ? 'ECO_SCHEMA_UNSUPPORTED' : 'ECO_EVIDENCE_NATIVE_VALIDATION_FAILED');
      return result;
    }
    const p = parsed.projection;
    if (new Set(p.responsibilityMappings.map(m => m.responsibilityId)).size !== p.responsibilityMappings.length ||
      new Set(p.roleConditionCoverage.map(c => c.conditionId)).size !== p.roleConditionCoverage.length) result.issueCodes.push('ECO_DUPLICATE_ID');
    const freshness = isPlainObject(raw.freshness) ? raw.freshness : {};
    if (Array.isArray(freshness.comparedIdentities)) {
      const labels = freshness.comparedIdentities.filter(isPlainObject).map(i => i.label);
      if (new Set(labels).size !== labels.length) result.issueCodes.push('ECO_EVIDENCE_CONFLICT');
    }
    const adequacy = isPlainObject(raw.roleAdequacy) ? raw.roleAdequacy : {};
    const truncation = isPlainObject(raw.truncation) ? raw.truncation : {};
    if (p.schemaVersion !== '1.0.0') result.issueCodes.push('ECO_SCHEMA_UNSUPPORTED');
    if (p.toolName !== 'my-dev-kit' || p.toolVersion !== '1.12.5') result.issueCodes.push('ECO_EVIDENCE_UNSUPPORTED_PRODUCER');
    if (p.projectRoot) result.subject = { schemaVersion: '1.0.0', authority: '@dailephd/my-dev-kit', namespace: 'my-dev-kit/static', value: p.projectRoot };
    if (!projectRoot || !p.projectRoot || !identityPathsEqual(projectRoot, p.projectRoot)) result.issueCodes.push('ECO_EVIDENCE_SUBJECT_MISMATCH');
    if (p.freshnessState !== 'fresh' || !p.freshnessAfterIndexDeclared || !p.freshnessAfterIndexPath || !p.indexPath ||
      !identityPathsEqual(p.indexPath, p.freshnessAfterIndexPath)) result.issueCodes.push('ECO_EVIDENCE_FRESHNESS_UNACCEPTABLE');
    if (p.overallAdequacyStatus !== 'context sufficient for implementation' ||
      p.roleAdequacyStatus !== 'context sufficient for implementation' ||
      !p.requestRole || p.requestRole !== p.roleContextRole || p.requestRole !== p.freshnessRole ||
      !p.provenanceCount || p.truncationRequiredEvidenceLost || truncation.requiredEvidenceLost === true ||
      p.requiredConditionWitnessLost || p.responsibilityMappingsTruncated ||
      !Array.isArray(adequacy.missingConditions) || adequacy.missingConditions.length > 0 ||
      !Array.isArray(adequacy.blockingConditions) || adequacy.blockingConditions.length > 0 ||
      (Array.isArray(adequacy.requiredConditions) && adequacy.requiredConditions.length > 0 && !p.roleConditionCoverage.length) ||
      p.roleConditionCoverage.some(c => c.required && (!c.conditionSatisfied || !c.retainedWitnessIds.length))) {
      result.issueCodes.push('ECO_EVIDENCE_NATIVE_VALIDATION_FAILED');
    }
    result.responsibilityIds = p.responsibilityMappings.filter(m => m.mappingStatus === 'mapped' && (m.productionSymbols?.length ?? 0) > 0 && m.unresolvedReasons?.length === 0).map(m => m.responsibilityId);
    const nativeRequest = isPlainObject(raw.request) ? raw.request : {};
    // Adequacy/mappings are relative to this native request/focus, not every
    // other independent context generated from the same project/index.
    result.identityKey = JSON.stringify([p.projectRoot, p.indexPath, p.requestRole, nativeRequest.normalizedQuery, raw.roleContext]);
    result.factSignature = JSON.stringify([p.freshnessState, p.overallAdequacyStatus, p.roleAdequacyStatus, p.requiredConditionWitnessLost, p.truncationRequiredEvidenceLost, p.responsibilityMappings]);
  } catch { result.issueCodes.push('ECO_EVIDENCE_NATIVE_VALIDATION_FAILED'); }
  return result;
}

// Stable, order-independent signature for a roleConditionCoverage array, used
// to detect capsule/audit disagreement on any condition's fields -- not just
// the derived requiredConditionWitnessLost rollup (v1.10.4 capsule/audit
// parity, AGENTS.txt Batch 1 / v1.2.3).
function roleConditionCoverageSignature(entries: RawRoleConditionCoverageEntry[]): string {
  return entries
    .map(
      (e) =>
        `${e.conditionId}:${e.role}:${e.required}:${e.conditionSatisfied}:${e.lostRequiredCondition}:${[...e.retainedWitnessIds].sort().join(',')}`,
    )
    .sort()
    .join('|');
}

// Deterministic consistency check between capsule and audit projections
// (AGENTS.txt Batch 5 section 8.5). Returns the field names that disagree,
// in a stable order.
export function findCapsuleAuditInconsistencies(
  capsule: RawEvidenceProjection,
  audit: RawEvidenceProjection,
): string[] {
  const mismatches: string[] = [];
  if ((capsule.requestRole ?? capsule.roleContextRole) !== (audit.requestRole ?? audit.roleContextRole)) {
    mismatches.push('role');
  }
  if (capsule.schemaMajor !== audit.schemaMajor) mismatches.push('schemaMajor');
  if (!identityPathsEqual(capsule.indexPath, audit.indexPath)) mismatches.push('indexIdentity');
  if (!identityPathsEqual(capsule.projectRoot, audit.projectRoot)) mismatches.push('repositoryIdentity');
  if (!identityPathsEqual(capsule.freshnessBeforeIndexPath ?? undefined, audit.freshnessBeforeIndexPath ?? undefined)) {
    mismatches.push('beforeIndexIdentity');
  }
  if (!identityPathsEqual(capsule.freshnessAfterIndexPath ?? undefined, audit.freshnessAfterIndexPath ?? undefined)) {
    mismatches.push('afterIndexIdentity');
  }
  if (capsule.freshnessState !== audit.freshnessState) mismatches.push('freshness');
  if (capsule.overallAdequacyStatus !== audit.overallAdequacyStatus) mismatches.push('overallAdequacy');
  if (capsule.roleAdequacyStatus !== audit.roleAdequacyStatus) mismatches.push('adequacy');
  if (capsule.truncationRequiredEvidenceLost !== audit.truncationRequiredEvidenceLost) mismatches.push('requiredTruncation');
  if (capsule.truncated !== audit.truncated) mismatches.push('truncation');
  if (capsule.fullFileFallbackUsed !== audit.fullFileFallbackUsed) mismatches.push('fallback');
  if (capsule.provenanceCount !== audit.provenanceCount) mismatches.push('provenance');
  if (capsule.responsibilityMappingsTruncated !== audit.responsibilityMappingsTruncated) mismatches.push('responsibilityMappings');
  if (roleConditionCoverageSignature(capsule.roleConditionCoverage) !== roleConditionCoverageSignature(audit.roleConditionCoverage)) {
    mismatches.push('requiredConditionCoverage');
  }
  return mismatches;
}
