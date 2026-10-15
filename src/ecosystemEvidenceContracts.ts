// ECO-00 reference shapes are frozen in Kit v1.12.5 (schema 1.0.0).
// This consumer validates their shape; it neither owns a schema registry nor
// authenticates producer claims, native artifacts, testing or certification.
export interface SubjectIdentityV1 {
  schemaVersion: '1.0.0';
  authority: string;
  namespace: string;
  value: string;
  repository?: { owner: string; name: string; commit?: string };
}
export interface EnvironmentIdentityV1 {
  schemaVersion: '1.0.0';
  environmentId: string;
  dimensions: Record<string, string>;
}
export interface NativeArtifactReferenceV1 {
  schemaVersion: '1.0.0';
  producer: { packageName: string; packageVersion: string };
  artifactKind: string;
  artifactSchemaVersion?: string;
  locator: { kind: 'path' | 'uri' | 'opaque-id'; value: string };
  integrity?: { sha256: string };
}
export interface EvidenceEnvelopeV1 {
  schemaVersion: '1.0.0';
  evidenceId: string;
  capabilityId: string;
  subject: SubjectIdentityV1;
  environment?: EnvironmentIdentityV1;
  nativeArtifact: NativeArtifactReferenceV1;
  freshness: 'current' | 'stale' | 'partially-stale' | 'unknown' | 'not-applicable';
  observedAt?: string;
}
export interface EvidenceRequirementV1 {
  schemaVersion: '1.0.0';
  requirementId: string;
  capabilityId: string;
  criticality: 'critical' | 'noncritical';
  responsibility?: SubjectIdentityV1;
  acceptedArtifactKinds: string[];
}
export interface CompatibilityBundleV1 {
  schemaVersion: '1.0.0';
  bundleId: string;
  status: 'supported' | 'tested' | 'certified' | 'active';
  components: Array<{ packageName: string; packageVersion: string; commit?: string; artifactSha256?: string }>;
  contracts: Array<{ contractId: string; schemaVersion: string }>;
  testEvidenceRefs?: string[];
  certificationProfile?: string;
  supersedesBundleId?: string;
}
export interface RunEcosystemRequirementsDocumentV1 {
  schemaVersion: '1.0.0';
  subject: SubjectIdentityV1;
  environment?: EnvironmentIdentityV1;
  requirements: EvidenceRequirementV1[];
}
export interface RunEcosystemEvidenceDocumentV1 {
  schemaVersion: '1.0.0';
  evidence: EvidenceEnvelopeV1[];
  compatibilityBundles?: CompatibilityBundleV1[];
}
export type EcosystemRecordIssueCode =
  | 'ECO_RECORD_INVALID' | 'ECO_SCHEMA_UNSUPPORTED'
  | 'ECO_REQUIREMENTS_UNAVAILABLE' | 'ECO_REQUIREMENTS_DIGEST_MISMATCH'
  | 'ECO_EVIDENCE_UNAVAILABLE' | 'ECO_COMPATIBILITY_UNVERIFIED';
export interface EcosystemValidationIssue {
  code: 'ECO_RECORD_INVALID' | 'ECO_SCHEMA_UNSUPPORTED';
  // Only contract-owned property names and numeric indices; never raw keys/values.
  path: string;
}
export type EcosystemValidationResult<T> =
  | { valid: true; document: T; issues: [] }
  | { valid: false; issues: EcosystemValidationIssue[] };

type Check = (value: unknown, at: string, issues: EcosystemValidationIssue[]) => void;
const hasOwn = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key);
const invalid = (at: string, issues: EcosystemValidationIssue[]): void => {
  issues.push({ code: 'ECO_RECORD_INVALID', path: at });
};
const text: Check = (v, at, issues) => {
  if (typeof v !== 'string' || v.length === 0) invalid(at, issues);
};
const version: Check = (v, at, issues) => {
  if (typeof v !== 'string') invalid(at, issues);
  else if (v !== '1.0.0') issues.push({ code: 'ECO_SCHEMA_UNSUPPORTED', path: at });
};
const digest = (length: number): Check => (v, at, issues) => {
  if (typeof v !== 'string' || v.length !== length || !new RegExp(`^[0-9a-f]{${length}}$`).test(v)) invalid(at, issues);
};
const enumeration = (values: readonly string[]): Check => (v, at, issues) => {
  if (typeof v !== 'string' || !values.includes(v)) invalid(at, issues);
};

function plainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return false;
  return Reflect.ownKeys(v).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(v, key)!;
    return typeof key === 'string' && descriptor.enumerable && 'value' in descriptor;
  });
}
function object(required: Record<string, Check>, optional: Record<string, Check> = {}): Check {
  return (v, at, issues) => {
    if (!plainObject(v)) { invalid(at, issues); return; }
    if (Object.keys(v).some((key) => !hasOwn(required, key) && !hasOwn(optional, key))) invalid(at, issues);
    for (const [key, check] of Object.entries(required)) check(v[key], `${at}.${key}`, issues);
    for (const [key, check] of Object.entries(optional)) {
      if (hasOwn(v, key)) check(v[key], `${at}.${key}`, issues);
    }
  };
}
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue((value as Record<string, unknown>)[key])]));
  }
  return value;
}
// Call only on a successfully validated document. Arrays retain their order;
// object keys are sorted recursively, with two-space indentation and final LF.
export function serializeEcosystemDocument(document: RunEcosystemRequirementsDocumentV1 | RunEcosystemEvidenceDocumentV1): string {
  return JSON.stringify(canonicalValue(document), null, 2) + '\n';
}
function array(check: Check, minimum: number, unique = false, id?: string): Check {
  return (v, at, issues) => {
    if (!Array.isArray(v)) { invalid(at, issues); return; }
    if (Object.getPrototypeOf(v) !== Array.prototype || Reflect.ownKeys(v).some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(v, key)!;
      return typeof key !== 'string' || (key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key)) || !('value' in descriptor);
    })) { invalid(at, issues); return; }
    if (v.length < minimum) invalid(at, issues);
    const seen = new Set<unknown>();
    for (let i = 0; i < v.length; i++) {
      const item = v[i];
      const itemPath = `${at}[${i}]`;
      const before = issues.length;
      check(item, itemPath, issues);
      if (issues.length !== before) continue;
      const identity = id ? (item as Record<string, unknown>)[id] : unique ? JSON.stringify(canonicalValue(item)) : undefined;
      if (id || unique) {
        if (seen.has(identity)) invalid(itemPath, issues);
        seen.add(identity);
      }
    }
  };
}
const dateTime: Check = (v, at, issues) => {
  if (typeof v !== 'string') { invalid(at, issues); return; }
  const match = /^(\d{4})-(\d{2})-(\d{2})[tT](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[zZ]|([+-])(\d{2}):(\d{2}))$/.exec(v);
  if (!match) { invalid(at, issues); return; }
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const offsetHour = Number(match[8] ?? 0);
  const offsetMinute = Number(match[9] ?? 0);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const utcMinute = ((hour * 60 + minute - (match[7] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute)) % 1440 + 1440) % 1440;
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 60 ||
      offsetHour > 23 || offsetMinute > 59 || (second === 60 && utcMinute !== 1439)) invalid(at, issues);
};
const subject = object({ schemaVersion: version, authority: text, namespace: text, value: text }, {
  repository: object({ owner: text, name: text }, { commit: digest(40) }),
});
const environment = object({ schemaVersion: version, environmentId: text, dimensions: (v, at, issues) => {
  if (!plainObject(v)) { invalid(at, issues); return; }
  if (Object.keys(v).length === 0) invalid(at, issues);
  for (const key of Object.keys(v).sort()) text(v[key], `${at}[*]`, issues);
} });
const nativeArtifact = object({
  schemaVersion: version,
  producer: object({ packageName: text, packageVersion: text }),
  artifactKind: text,
  locator: object({ kind: enumeration(['path', 'uri', 'opaque-id']), value: text }),
}, { artifactSchemaVersion: text, integrity: object({ sha256: digest(64) }) });
const envelope = object({
  schemaVersion: version, evidenceId: text, capabilityId: text, subject, nativeArtifact,
  freshness: enumeration(['current', 'stale', 'partially-stale', 'unknown', 'not-applicable']),
}, { environment, observedAt: dateTime });
const requirement = object({
  schemaVersion: version, requirementId: text, capabilityId: text,
  criticality: enumeration(['critical', 'noncritical']), acceptedArtifactKinds: array(text, 1, true),
}, { responsibility: subject });
const bundleShape = object({
  schemaVersion: version, bundleId: text, status: enumeration(['supported', 'tested', 'certified', 'active']),
  components: array(object({ packageName: text, packageVersion: text }, { commit: digest(40), artifactSha256: digest(64) }), 1, true),
  // The frozen contract deliberately does not require unique contracts.
  contracts: array(object({ contractId: text, schemaVersion: text }), 1),
}, { testEvidenceRefs: array(text, 0, true), certificationProfile: text, supersedesBundleId: text });
const bundle: Check = (v, at, issues) => {
  bundleShape(v, at, issues);
  if (plainObject(v) && (v.status === 'certified' || v.status === 'active')) {
    if (!hasOwn(v, 'testEvidenceRefs')) invalid(`${at}.testEvidenceRefs`, issues);
    else if (Array.isArray(v.testEvidenceRefs) && v.testEvidenceRefs.length === 0) invalid(`${at}.testEvidenceRefs`, issues);
    if (!hasOwn(v, 'certificationProfile')) invalid(`${at}.certificationProfile`, issues);
  }
};
const requirementsDocument = object({ schemaVersion: version, subject, requirements: array(requirement, 1, false, 'requirementId') }, { environment });
const evidenceDocument = object({ schemaVersion: version, evidence: array(envelope, 0, false, 'evidenceId') }, {
  compatibilityBundles: array(bundle, 0, false, 'bundleId'),
});
function validate<T>(value: unknown, check: Check): EcosystemValidationResult<T> {
  const issues: EcosystemValidationIssue[] = [];
  try { check(value, '$', issues); } catch { invalid('$', issues); }
  return issues.length ? { valid: false, issues } : { valid: true, document: value as T, issues: [] };
}
export const validateSubjectIdentityV1 = (v: unknown): EcosystemValidationResult<SubjectIdentityV1> => validate(v, subject);
export const validateEnvironmentIdentityV1 = (v: unknown): EcosystemValidationResult<EnvironmentIdentityV1> => validate(v, environment);
export const validateNativeArtifactReferenceV1 = (v: unknown): EcosystemValidationResult<NativeArtifactReferenceV1> => validate(v, nativeArtifact);
export const validateEvidenceEnvelopeV1 = (v: unknown): EcosystemValidationResult<EvidenceEnvelopeV1> => validate(v, envelope);
export const validateEvidenceRequirementV1 = (v: unknown): EcosystemValidationResult<EvidenceRequirementV1> => validate(v, requirement);
export const validateCompatibilityBundleV1 = (v: unknown): EcosystemValidationResult<CompatibilityBundleV1> => validate(v, bundle);
export const validateRunEcosystemRequirementsDocument = (v: unknown): EcosystemValidationResult<RunEcosystemRequirementsDocumentV1> => validate(v, requirementsDocument);
export const validateRunEcosystemEvidenceDocument = (v: unknown): EcosystemValidationResult<RunEcosystemEvidenceDocumentV1> => validate(v, evidenceDocument);
