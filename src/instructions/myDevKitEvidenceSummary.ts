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

export const RAW_CONTEXT_CAPSULE_SUPPORTED_MAJOR = 1;
export const RAW_RETRIEVAL_AUDIT_SUPPORTED_MAJOR = 1;

export interface RawResponsibilityMappingEntry {
  responsibilityId: string;
  mappingStatus: string;
}

export interface RawEvidenceProjection {
  schemaVersion: string;
  schemaMajor: number;
  toolName?: string;
  toolVersion?: string;
  indexPath?: string;
  manifestPath?: string;
  requestRole?: string;
  roleContextRole?: string;
  roleAdequacyStatus?: string;
  freshnessState?: string;
  freshnessRole?: string;
  freshnessAfterIndexDeclared: boolean;
  freshnessAfterIndexPath: string | null;
  responsibilityMappings: RawResponsibilityMappingEntry[];
  responsibilityMappingsTruncated: boolean;
  truncated: boolean;
  truncationRequiredEvidenceLost: boolean;
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

function projectRawEvidence(data: Record<string, unknown>, schemaMajor: number): RawEvidenceProjection {
  const tool = isPlainObject(data.tool) ? data.tool : {};
  const index = isPlainObject(data.index) ? data.index : {};
  const request = isPlainObject(data.request) ? data.request : {};
  const roleContext = isPlainObject(data.roleContext) ? data.roleContext : {};
  const roleAdequacy = isPlainObject(data.roleAdequacy) ? data.roleAdequacy : {};
  const freshness = isPlainObject(data.freshness) ? data.freshness : {};
  const responsibilityMappingsRaw = isPlainObject(data.responsibilityMappings) ? data.responsibilityMappings : {};
  const truncation = isPlainObject(data.truncation) ? data.truncation : {};
  const fullFileFallback = isPlainObject(data.fullFileFallback) ? data.fullFileFallback : {};

  let freshnessAfterIndexDeclared = false;
  let freshnessAfterIndexPath: string | null = null;
  if (Array.isArray(freshness.comparedIdentities)) {
    const entry = freshness.comparedIdentities.find(
      (e): e is { label: unknown; value: unknown } => isPlainObject(e) && e.label === 'afterIndexPath',
    );
    if (entry) {
      freshnessAfterIndexDeclared = true;
      freshnessAfterIndexPath = asString(entry.value) ?? null;
    }
  }

  const mappingsRaw = Array.isArray(responsibilityMappingsRaw.mappings) ? responsibilityMappingsRaw.mappings : [];
  const responsibilityMappings: RawResponsibilityMappingEntry[] = mappingsRaw
    .filter(isPlainObject)
    .map((m) => ({
      responsibilityId: asString(m.responsibilityId) ?? '',
      mappingStatus: asString(m.mappingStatus) ?? 'unmapped',
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
    requestRole: asString(request.role),
    roleContextRole: asString(roleContext.role),
    roleAdequacyStatus: asString(roleAdequacy.status),
    freshnessState: asString(freshness.state),
    freshnessRole: asString(freshness.role),
    freshnessAfterIndexDeclared,
    freshnessAfterIndexPath,
    responsibilityMappings,
    responsibilityMappingsTruncated: asBoolean(responsibilityMappingsRaw.truncated),
    truncated: asBoolean(truncation.truncated),
    truncationRequiredEvidenceLost,
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
  return { ok: true, projection: projectRawEvidence(data, major) };
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
  if (capsule.indexPath !== audit.indexPath) mismatches.push('indexIdentity');
  if (capsule.freshnessState !== audit.freshnessState) mismatches.push('freshness');
  if (capsule.roleAdequacyStatus !== audit.roleAdequacyStatus) mismatches.push('adequacy');
  if (capsule.truncated !== audit.truncated) mismatches.push('truncation');
  return mismatches;
}
