import {
  validateSubjectIdentityV1, validateEnvironmentIdentityV1, validateNativeArtifactReferenceV1,
  validateEvidenceEnvelopeV1, validateEvidenceRequirementV1, validateCompatibilityBundleV1,
  validateRunEcosystemRequirementsDocument, validateRunEcosystemEvidenceDocument, serializeEcosystemDocument,
} from '../src/ecosystemEvidenceContracts';

const subject = { schemaVersion: '1.0.0', authority: '@dailephd/my-dev-kit-orchestrator', namespace: 'my-dev-kit-orchestrator/semantic-responsibility', value: 'RSP-001', repository: { owner: 'dailephd', name: 'my-dev-kit-orchestrator', commit: 'a'.repeat(40) } };
const environment = { schemaVersion: '1.0.0', environmentId: 'node24-windows', dimensions: { os: 'windows', node: '24' } };
const nativeArtifact = { schemaVersion: '1.0.0', producer: { packageName: '@dailephd/my-dev-kit-lab', packageVersion: '0.10.0' }, artifactKind: 'my-dev-kit-lab/verification-record', artifactSchemaVersion: '9.7.3', locator: { kind: 'path', value: 'lab output/verification/manifest.json' }, integrity: { sha256: 'b'.repeat(64) } };
const envelope = { schemaVersion: '1.0.0', evidenceId: 'ev-001', capabilityId: 'verification.test-result', subject, environment, nativeArtifact, freshness: 'current', observedAt: '2026-10-14T09:00:00-05:00' };
const requirement = { schemaVersion: '1.0.0', requirementId: 'req-001', capabilityId: 'verification.test-result', criticality: 'critical', acceptedArtifactKinds: ['my-dev-kit-lab/verification-record'], responsibility: subject };
const bundle = { schemaVersion: '1.0.0', bundleId: 'bundle-001', status: 'supported', components: [{ packageName: '@dailephd/my-dev-kit', packageVersion: '1.12.5', commit: 'c'.repeat(40), artifactSha256: 'd'.repeat(64) }], contracts: [{ contractId: 'eco.evidence-envelope', schemaVersion: '1.0.0' }], testEvidenceRefs: ['test-ref'], certificationProfile: 'profile', supersedesBundleId: 'previous' };
const requirements = { schemaVersion: '1.0.0', subject, environment, requirements: [requirement] };
const evidence = { schemaVersion: '1.0.0', evidence: [envelope], compatibilityBundles: [bundle] };
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
type Validator = (v: unknown) => { valid: boolean; issues: Array<{ code: string; path: string }> };
const shapes: Array<[string, Record<string, unknown>, Validator, string[]]> = [
  ['subject', subject, validateSubjectIdentityV1, ['schemaVersion', 'authority', 'namespace', 'value']],
  ['environment', environment, validateEnvironmentIdentityV1, ['schemaVersion', 'environmentId', 'dimensions']],
  ['native', nativeArtifact, validateNativeArtifactReferenceV1, ['schemaVersion', 'producer', 'artifactKind', 'locator']],
  ['envelope', envelope, validateEvidenceEnvelopeV1, ['schemaVersion', 'evidenceId', 'capabilityId', 'subject', 'nativeArtifact', 'freshness']],
  ['requirement', requirement, validateEvidenceRequirementV1, ['schemaVersion', 'requirementId', 'capabilityId', 'criticality', 'acceptedArtifactKinds']],
  ['bundle', bundle, validateCompatibilityBundleV1, ['schemaVersion', 'bundleId', 'status', 'components', 'contracts']],
  ['requirements document', requirements, validateRunEcosystemRequirementsDocument, ['schemaVersion', 'subject', 'requirements']],
  ['evidence document', evidence, validateRunEcosystemEvidenceDocument, ['schemaVersion', 'evidence']],
];
describe.each(shapes)('%s strict frozen shape', (_name, fixture, validate, required) => {
  it('accepts the complete deterministic fixture', () => expect(validate(copy(fixture)).valid).toBe(true));
  it.each(required)('rejects missing %s', (key) => {
    const bad = copy(fixture); delete bad[key]; expect(validate(bad).valid).toBe(false);
  });
  it.each(required)('rejects the wrong type for %s', (key) => {
    expect(validate({ ...copy(fixture), [key]: false }).valid).toBe(false);
  });
  it.each([null, [], 'text', 5])('rejects a non-object %p', (bad) => expect(validate(bad).valid).toBe(false));
  it('rejects unknown keys without echoing their names or values', () => {
    const result = validate({ ...copy(fixture), 'private-secret-key': 'private-secret-value' });
    expect(result.valid).toBe(false);
    expect(JSON.stringify(result.issues)).not.toContain('private-secret');
  });
  it('distinguishes an unsupported version from malformed fields', () => {
    expect(validate({ ...copy(fixture), schemaVersion: '2.0.0' }).issues).toContainEqual({ code: 'ECO_SCHEMA_UNSUPPORTED', path: '$.schemaVersion' });
    expect(validate({ ...copy(fixture), schemaVersion: 1 }).issues).toContainEqual({ code: 'ECO_RECORD_INVALID', path: '$.schemaVersion' });
  });
  it('keeps deterministic issue order regardless of input key insertion order', () => {
    const bad = { ...copy(fixture), schemaVersion: '2.0.0', privateKey: 'secret' };
    expect(validate(bad).issues).toEqual(validate(Object.fromEntries(Object.entries(bad).reverse())).issues);
  });
});

describe('nested rules and exact reference semantics', () => {
  it.each([
    { ...subject, authority: '' }, { ...subject, namespace: '' }, { ...subject, value: '' },
    { ...subject, repository: { owner: 'x' } }, { ...subject, repository: { ...subject.repository, commit: 'a'.repeat(39) } },
    { ...subject, repository: { ...subject.repository, commit: 'A'.repeat(40) } },
    { ...subject, repository: { ...subject.repository, extra: 'secret' } },
  ])('rejects malformed subject identity %p', (bad) => expect(validateSubjectIdentityV1(bad).valid).toBe(false));
  it('does not invent identity syntax or normalize schema-valid text', () => {
    const value = { ...subject, value: ' RSP-01 ', authority: ' ' };
    const result = validateSubjectIdentityV1(value);
    expect(result.valid).toBe(true); // Frozen identity strings require minLength 1 only.
    if (result.valid) expect(result.document.value).toBe(' RSP-01 ');
  });
  it.each([{}, { os: '' }, { os: 24 }, { os: null }, []])('rejects malformed dimensions %p', (dimensions) => {
    expect(validateEnvironmentIdentityV1({ ...environment, dimensions }).valid).toBe(false);
  });
  it.each([
    { ...nativeArtifact, producer: { packageName: 'x' } },
    { ...nativeArtifact, producer: { ...nativeArtifact.producer, extra: true } },
    { ...nativeArtifact, producer: { packageName: '', packageVersion: '1' } },
    { ...nativeArtifact, locator: { kind: 'execute', value: 'x' } },
    { ...nativeArtifact, locator: { kind: 'uri', value: '' } },
    { ...nativeArtifact, locator: { kind: 'path', value: 'x', extra: true } },
    { ...nativeArtifact, integrity: { sha256: 'a'.repeat(63) } },
    { ...nativeArtifact, integrity: { sha256: 'A'.repeat(64) } },
    { ...nativeArtifact, integrity: { sha256: 'a'.repeat(64), extra: true } },
    { ...nativeArtifact, artifactSchemaVersion: '' },
  ])('rejects malformed native references %p', (bad) => expect(validateNativeArtifactReferenceV1(bad).valid).toBe(false));
  it.each(['path', 'uri', 'opaque-id'])('preserves inert %s locator text and arbitrary native version', (kind) => {
    const value = { ...nativeArtifact, locator: { kind, value: '../../private secrets; https://invalid.test/$(execute)' } };
    const result = validateNativeArtifactReferenceV1(value);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.document.locator.value).toBe(value.locator.value);
  });
  it.each(['current', 'stale', 'partially-stale', 'unknown', 'not-applicable'])('accepts freshness %s without granting readiness', (freshness) => {
    expect(validateEvidenceEnvelopeV1({ ...envelope, freshness }).valid).toBe(true);
  });
  it.each(['', 'ready', null])('rejects freshness %p', (freshness) => expect(validateEvidenceEnvelopeV1({ ...envelope, freshness }).valid).toBe(false));
  it.each(['2026-02-30T12:00:00Z', '2025-02-29T12:00:00Z', '2026-10-14', '2026-10-14T24:00:00Z', '2026-10-14T00:60:00Z', '2026-10-14T12:00:61Z', '2026-10-14T12:00:00+24:00', '2026-10-14T12:00:00', '2026-10-14T12:00:00Z trailing'])('rejects malformed date-time %s', (observedAt) => expect(validateEvidenceEnvelopeV1({ ...envelope, observedAt }).valid).toBe(false));
  it.each(['2024-02-29T23:59:59.123Z', '2026-10-14t00:00:00z', '2016-12-31T23:59:60Z'])('accepts RFC3339 form %s', (observedAt) => expect(validateEvidenceEnvelopeV1({ ...envelope, observedAt }).valid).toBe(true));
  it.each([
    { ...requirement, criticality: 'high' }, { ...requirement, requirementId: '' },
    { ...requirement, acceptedArtifactKinds: [] }, { ...requirement, acceptedArtifactKinds: ['x', 'x'] },
    { ...requirement, acceptedArtifactKinds: [''] }, { ...requirement, responsibility: 'RSP-001' },
    { ...requirement, responsibility: { ...subject, schemaVersion: '9' } },
  ])('rejects malformed requirement %p', (bad) => expect(validateEvidenceRequirementV1(bad).valid).toBe(false));
  it.each(['certified', 'active'])('requires certification metadata for %s', (status) => {
    const { testEvidenceRefs: _refs, certificationProfile: _profile, ...without } = bundle;
    expect(validateCompatibilityBundleV1({ ...without, status }).valid).toBe(false);
    expect(validateCompatibilityBundleV1({ ...bundle, status, testEvidenceRefs: [] }).valid).toBe(false);
    expect(validateCompatibilityBundleV1({ ...bundle, status }).valid).toBe(true);
  });
  it.each([
    { ...bundle, status: 'verified' }, { ...bundle, bundleId: '' }, { ...bundle, components: [] },
    { ...bundle, components: [bundle.components[0], Object.fromEntries(Object.entries(bundle.components[0]).reverse())] },
    { ...bundle, components: [{ ...bundle.components[0], commit: 'X' }] },
    { ...bundle, components: [{ ...bundle.components[0], artifactSha256: 'x' }] },
    { ...bundle, components: [{ ...bundle.components[0], extra: true }] },
    { ...bundle, contracts: [] }, { ...bundle, contracts: [{ contractId: 'x', schemaVersion: '' }] },
    { ...bundle, contracts: [{ ...bundle.contracts[0], extra: true }] },
    { ...bundle, testEvidenceRefs: ['x', 'x'] }, { ...bundle, certificationProfile: '' },
  ])('rejects malformed bundle %p', (bad) => expect(validateCompatibilityBundleV1(bad).valid).toBe(false));
  it('preserves frozen contract-array semantics', () => expect(validateCompatibilityBundleV1({ ...bundle, contracts: [bundle.contracts[0], bundle.contracts[0]] }).valid).toBe(true));
});

describe('run documents', () => {
  it.each([
    { ...requirements, requirements: [] }, { ...requirements, requirements: [requirement, requirement] },
    { ...requirements, requirements: [{ ...requirement, capabilityId: false }] },
    { ...requirements, subject: { ...subject, extra: true } },
    { ...requirements, environment: { ...environment, schemaVersion: '2' } },
  ])('rejects invalid requirements %p', (bad) => expect(validateRunEcosystemRequirementsDocument(bad).valid).toBe(false));
  it('accepts optional environment/responsibility absence and valid empty evidence', () => {
    const { responsibility: _responsibility, ...without } = requirement;
    expect(validateRunEcosystemRequirementsDocument({ schemaVersion: '1.0.0', subject, requirements: [without] }).valid).toBe(true);
    expect(validateRunEcosystemEvidenceDocument({ schemaVersion: '1.0.0', evidence: [] }).valid).toBe(true);
  });
  it.each([
    { ...evidence, evidence: [envelope, envelope] }, { ...evidence, evidence: [{ ...envelope, nativeArtifact: null }] },
    { ...evidence, evidence: [{ ...envelope, subject: { ...subject, schemaVersion: '3' } }] },
    { ...evidence, compatibilityBundles: [{ ...bundle, status: 'active', testEvidenceRefs: [] }] },
    { ...evidence, compatibilityBundles: [bundle, bundle] },
  ])('rejects invalid evidence %p', (bad) => expect(validateRunEcosystemEvidenceDocument(bad).valid).toBe(false));
  it('serializes equal valid documents with equal canonical UTF-8 content', () => {
    const valid = validateRunEcosystemRequirementsDocument(requirements);
    const reordered = validateRunEcosystemRequirementsDocument(Object.fromEntries(Object.entries(requirements).reverse()));
    expect(valid.valid && reordered.valid).toBe(true);
    if (valid.valid && reordered.valid) expect(serializeEcosystemDocument(valid.document)).toBe(serializeEcosystemDocument(reordered.document));
  });
  it('rejects accessors/class instances without invoking untrusted code', () => {
    const getter = jest.fn(() => 'secret');
    const untrusted = { ...subject };
    Object.defineProperty(untrusted, 'value', { get: getter, enumerable: true });
    expect(validateSubjectIdentityV1(untrusted).valid).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(validateSubjectIdentityV1(new Date()).valid).toBe(false);
  });
  it('rejects an array accessor or custom serialization hook without calling it', () => {
    const getter = jest.fn(() => requirement);
    const array: unknown[] = [];
    Object.defineProperty(array, '0', { get: getter, enumerable: true });
    expect(validateRunEcosystemRequirementsDocument({ ...requirements, requirements: array }).valid).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    const hook = jest.fn(() => []);
    const evidenceArray = Object.assign([envelope], { toJSON: hook });
    expect(validateRunEcosystemEvidenceDocument({ ...evidence, evidence: evidenceArray }).valid).toBe(false);
    expect(hook).not.toHaveBeenCalled();
  });
});
