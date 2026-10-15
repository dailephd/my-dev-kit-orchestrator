import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { runCli } from './cliTestHelpers';
import { buildExportText } from '../src/commands/export';
import { RunEvidenceInspectionV1 } from '../src/ecosystemEvidenceInspection';
import { createRun, RunMetadata } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { inspectRunEcosystemRecords, replaceRunEcosystemEvidence } from '../src/ecosystemEvidenceStore';
import { EvidenceEnvelopeV1, RunEcosystemRequirementsDocumentV1 } from '../src/ecosystemEvidenceContracts';
import { evaluateRunEcosystemEvidenceReadiness } from '../src/ecosystemEvidenceReadiness';
import { readKitEcosystemEvidence } from '../src/instructions/myDevKitEvidenceSummary';
import { readObserverEcosystemEvidence } from '../src/observerEvidence';
import { evaluateRunIntegrityGate, evaluateStageRunIntegrity } from '../src/runIntegrityGate';
import { evaluateJudgeIntegrity, evaluateFinalReportEligibility } from '../src/judgeIntegrity';
import { readArtifactStateFile } from '../src/artifactLifecycle';
import { makeReadyRunFolder } from './readyContextTestHelpers';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
let root: string;
let meta: RunMetadata;
let envelope: EvidenceEnvelopeV1;
let native: typeof publishedKitFixture;
function setup(criticality: 'critical' | 'noncritical' = 'critical', extra: Partial<RunEcosystemRequirementsDocumentV1> = {}): void {
  const subject = { schemaVersion: '1.0.0' as const, authority: '@dailephd/my-dev-kit', namespace: 'my-dev-kit/static', value: root };
  const requirements: RunEcosystemRequirementsDocumentV1 = { schemaVersion: '1.0.0', subject,
    requirements: [{ schemaVersion: '1.0.0', requirementId: 'r-1', capabilityId: 'my-dev-kit/static-context', criticality, acceptedArtifactKinds: ['my-dev-kit/context-capsule', 'my-dev-kit/retrieval-audit'] }], ...extra };
  meta = createRun({ mode: 'feature', projectRoot: root, name: `native-${fs.readdirSync(path.join(root, '.my-dev-kit-orchestrator', 'runs')).length}`, request: 'native evidence', ecosystemRequirementsDocument: requirements });
  native = clone(publishedKitFixture);
  native.index.projectRoot = root;
  native.index.indexPath = path.join(root, 'index');
  native.index.manifestPath = path.join(root, 'index', 'manifest.json');
  for (const identity of native.freshness.comparedIdentities) if (['activeIndexPath', 'beforeIndexPath', 'afterIndexPath'].includes(identity.label)) identity.value = native.index.indexPath;
  fs.writeFileSync(path.join(root, 'capsule.json'), JSON.stringify(native));
  envelope = { schemaVersion: '1.0.0', evidenceId: 'e-1', capabilityId: 'my-dev-kit/static-context', subject,
    freshness: 'current', nativeArtifact: { schemaVersion: '1.0.0', producer: { packageName: '@dailephd/my-dev-kit', packageVersion: '1.12.5' }, artifactKind: 'my-dev-kit/context-capsule', artifactSchemaVersion: '1.0.0', locator: { kind: 'path', value: path.join(root, 'capsule.json') } } };
}
function evaluate() {
  replaceRunEcosystemEvidence(meta.runFolder, { schemaVersion: '1.0.0', evidence: [envelope] });
  return evaluateRunEcosystemEvidenceReadiness(inspectRunEcosystemRecords(meta.runFolder, meta), [readKitEcosystemEvidence(envelope, meta.runFolder, root)]);
}
function gate() {
  return evaluateRunIntegrityGate({ ...meta, workflowStageNames: meta.stages.map(s => s.name) });
}
beforeEach(() => {
  const tmp = path.resolve('.my-dev-kit-workflow/tmp'); fs.mkdirSync(tmp, { recursive: true });
  root = fs.mkdtempSync(path.join(tmp, 'batch2-native-')); initWorkspace(root); setup();
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
describe('pinned native evidence and deterministic run readiness', () => {
  it('accepts genuinely fresh, adequate published Kit static context and recomputes the gate', () => {
    expect(evaluate()).toMatchObject({ required: true, ready: true, classification: 'ready', requirements: [{ state: 'satisfied', matchingEvidenceIds: ['e-1'] }], blockingCodes: [] });
    makeReadyRunFolder(meta.runFolder, 'feature');
    expect(gate()).toMatchObject({ ecosystemEvidenceReady: true, expectedJudgeVerdict: 'PASS', runIntegrityReady: true });
    native.freshness.state = 'stale'; fs.writeFileSync(path.join(root, 'capsule.json'), JSON.stringify(native));
    expect(gate()).toMatchObject({ ecosystemEvidenceReady: false, expectedJudgeVerdict: 'NEED_CONTEXT' });
    native.freshness.state = 'fresh'; fs.writeFileSync(path.join(root, 'capsule.json'), JSON.stringify(native));
    expect(gate().ecosystemEvidenceReady).toBe(true);
  });
  it('preserves legacy behavior and ignores stray sidecars', () => {
    const legacy = createRun({ mode: 'greenfield', projectRoot: root, request: 'legacy', name: 'legacy' });
    fs.writeFileSync(path.join(legacy.runFolder, 'ecosystem-evidence.json'), 'invalid');
    expect(evaluateRunEcosystemEvidenceReadiness(inspectRunEcosystemRecords(legacy.runFolder, legacy))).toEqual({ schemaVersion: '1.0.0', required: false, ready: true, classification: 'not-required', requirements: [], blockingCodes: [], warningCodes: [], recommendedCorrectionStage: null });
  });
  it.each(['critical', 'noncritical'] as const)('classifies empty initialized evidence for %s requirements', criticality => {
    setup(criticality);
    const result = evaluateRunEcosystemEvidenceReadiness(inspectRunEcosystemRecords(meta.runFolder, meta));
    expect(result.ready).toBe(criticality === 'noncritical');
    expect(result.classification).toBe(criticality === 'critical' ? 'blocked' : 'warning');
    expect([...result.blockingCodes, ...result.warningCodes]).toEqual(['ECO_REQUIREMENT_MISSING_EVIDENCE']);
  });
  it.each(['stale', 'partially-stale', 'unknown', 'not-applicable'] as const)('never accepts envelope freshness %s', freshness => {
    envelope.freshness = freshness; expect(evaluate().blockingCodes).toContain('ECO_EVIDENCE_FRESHNESS_UNACCEPTABLE');
    setup('noncritical'); envelope.freshness = freshness; expect(evaluate()).toMatchObject({ ready: true, classification: 'warning' });
  });
  it.each(['stale', 'unknown'])('does not upgrade native Kit %s using envelope current', state => {
    native.freshness.state = state; fs.writeFileSync(path.join(root, 'capsule.json'), JSON.stringify(native));
    expect(evaluate().blockingCodes).toContain('ECO_EVIDENCE_FRESHNESS_UNACCEPTABLE');
  });
  it.each(['package', 'version', 'kind', 'schema', 'uri', 'opaque-id', 'missing', 'malformed', 'digest', 'escape'])('fails closed for %s native reference', failure => {
    const ref = envelope.nativeArtifact;
    if (failure === 'package') ref.producer.packageName = 'unknown';
    if (failure === 'version') ref.producer.packageVersion = '1.12.6';
    if (failure === 'kind') ref.artifactKind = 'my-dev-kit/context-capsule-extra';
    if (failure === 'schema') ref.artifactSchemaVersion = '2.0.0';
    if (failure === 'uri' || failure === 'opaque-id') ref.locator = { kind: failure, value: 'https://invalid.test/private' };
    if (failure === 'missing') fs.unlinkSync(path.join(root, 'capsule.json'));
    if (failure === 'malformed') fs.writeFileSync(path.join(root, 'capsule.json'), '{invalid');
    if (failure === 'digest') ref.integrity = { sha256: 'a'.repeat(64) };
    if (failure === 'escape') ref.locator.value = path.join(root, '..', 'capsule.json');
    expect(evaluate().ready).toBe(false);
    expect(evaluate().primaryBlockingReason).not.toContain(root);
  });
  it('recomputes optional native digest from actual bytes', () => {
    envelope.nativeArtifact.integrity = { sha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'capsule.json'))).digest('hex') };
    expect(evaluate().ready).toBe(true);
    fs.appendFileSync(path.join(root, 'capsule.json'), ' ');
    expect(evaluate().ready).toBe(false);
  });
  it('rejects a native file through a junction and a file outside the owning roots', () => {
    const link = path.join(root, 'linked');
    fs.symlinkSync(root, link, 'junction');
    envelope.nativeArtifact.locator.value = path.join(link, 'capsule.json');
    expect(evaluate().blockingCodes).toContain('ECO_EVIDENCE_NATIVE_VALIDATION_FAILED');
    fs.unlinkSync(link);
    const outside = path.join(path.dirname(root), `${path.basename(root)}-outside.json`);
    fs.writeFileSync(outside, JSON.stringify(native));
    try {
      envelope.nativeArtifact.locator.value = outside;
      expect(evaluate().blockingCodes).toContain('ECO_EVIDENCE_NATIVE_VALIDATION_FAILED');
    } finally { fs.unlinkSync(outside); }
  });
  it.each(['authority', 'namespace', 'value'] as const)('requires exact ECO subject %s', field => {
    envelope.subject = { ...envelope.subject, [field]: envelope.subject[field].toUpperCase() };
    expect(evaluate().blockingCodes).toContain('ECO_EVIDENCE_SUBJECT_MISMATCH');
  });
  it('cannot attest repository commits, execution environments or unmapped responsibility', () => {
    setup('critical', { subject: { ...envelope.subject, repository: { owner: 'owner', name: 'repo', commit: 'a'.repeat(40) } } });
    envelope.subject.repository = { owner: 'owner', name: 'repo', commit: 'a'.repeat(40) };
    expect(evaluate().blockingCodes).toContain('ECO_EVIDENCE_SUBJECT_MISMATCH');
    setup('critical', { environment: { schemaVersion: '1.0.0', environmentId: 'node', dimensions: { node: '24' } } });
    envelope.environment = { schemaVersion: '1.0.0', environmentId: 'node', dimensions: { node: '24' } };
    expect(evaluate().blockingCodes).toContain('ECO_EVIDENCE_ENVIRONMENT_MISMATCH');
    setup('critical', { requirements: [{ schemaVersion: '1.0.0', requirementId: 'rsp', capabilityId: 'my-dev-kit/static-context', criticality: 'critical', acceptedArtifactKinds: ['my-dev-kit/context-capsule'], responsibility: { schemaVersion: '1.0.0', authority: '@dailephd/my-dev-kit-orchestrator', namespace: 'my-dev-kit-orchestrator/semantic-responsibility', value: 'RSP-001' } }] });
    expect(evaluate().blockingCodes).toContain('ECO_EVIDENCE_RESPONSIBILITY_UNCORROBORATED');
  });
  it('rejects required witness loss and other native project identity', () => {
    native.roleConditionCoverage[0].lostRequiredCondition = true; fs.writeFileSync(path.join(root, 'capsule.json'), JSON.stringify(native));
    expect(evaluate().blockingCodes).toContain('ECO_EVIDENCE_NATIVE_VALIDATION_FAILED');
    native.index.projectRoot = `${root}-other`; fs.writeFileSync(path.join(root, 'capsule.json'), JSON.stringify(native));
    expect(evaluate().blockingCodes).toContain('ECO_EVIDENCE_SUBJECT_MISMATCH');
  });
  it('blocks ambiguous native identity globally even for noncritical requirements', () => {
    setup('noncritical');
    native.freshness.comparedIdentities.push(clone(native.freshness.comparedIdentities[0]));
    fs.writeFileSync(path.join(root, 'capsule.json'), JSON.stringify(native));
    expect(evaluate()).toMatchObject({ ready: false, classification: 'blocked', blockingCodes: ['ECO_EVIDENCE_CONFLICT'] });
  });
  it('bounds parsing and rejects using either ECO sidecar as native content', () => {
    fs.writeFileSync(path.join(root, 'capsule.json'), ' '.repeat(4 * 1024 * 1024 + 1));
    expect(evaluate().blockingCodes).toContain('ECO_EVIDENCE_NATIVE_VALIDATION_FAILED');
    envelope.nativeArtifact.locator.value = path.join(meta.runFolder, 'ecosystem-requirements.json');
    expect(evaluate().blockingCodes).toContain('ECO_EVIDENCE_NATIVE_VALIDATION_FAILED');
  });
  it('keeps existing context/semantic precedence when ECO is genuinely ready', () => {
    evaluate(); const context = evaluateRunIntegrityGate({ ...meta, currentStage: 'implementation', workflowStageNames: meta.stages.map(s => s.name) });
    expect(context.ecosystemEvidenceReady).toBe(true);
    expect(context.runIntegrityReady).toBe(false);
    expect(context.primaryBlockingCode).not.toMatch(/^ECO_/);
    makeReadyRunFolder(meta.runFolder, 'feature');
    const semantic = evaluateRunIntegrityGate({ ...meta, semanticContinuityVersion: 'unsupported', workflowStageNames: meta.stages.map(s => s.name) });
    expect(semantic.ecosystemEvidenceReady).toBe(true);
    expect(semantic.runIntegrityReady).toBe(false);
    expect(semantic.primaryBlockingCode).toBe('SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED');
  });
  it('detects contradictory native facts globally and remains deterministic under evidence reordering', () => {
    evaluate(); const snapshot = inspectRunEcosystemRecords(meta.runFolder, meta);
    snapshot.evidence!.evidence.push({ ...clone(envelope), evidenceId: 'e-2' });
    const a = readKitEcosystemEvidence(envelope, meta.runFolder, root);
    const b = { ...a, evidenceId: 'e-2', factSignature: 'contradiction' };
    const result = evaluateRunEcosystemEvidenceReadiness(snapshot, [b, a]);
    expect(result.blockingCodes).toContain('ECO_EVIDENCE_CONFLICT');
    snapshot.evidence!.evidence.reverse();
    expect(evaluateRunEcosystemEvidenceReadiness(snapshot, [a, b])).toEqual(result);
    snapshot.evidence!.evidence.push(clone(envelope));
    expect(evaluateRunEcosystemEvidenceReadiness(snapshot, [a, b]).blockingCodes).toContain('ECO_DUPLICATE_ID');
  });
  it('keeps execution requirements unmet despite static success and certified bundle assertions', () => {
    evaluate(); const snapshot = inspectRunEcosystemRecords(meta.runFolder, meta);
    snapshot.requirements!.requirements.push({ schemaVersion: '1.0.0', requirementId: 'test', capabilityId: 'project-test-execution', criticality: 'critical', acceptedArtifactKinds: ['my-dev-kit/context-capsule'] });
    const execution = { ...clone(envelope), evidenceId: 'exec', capabilityId: 'project-test-execution' };
    snapshot.evidence!.evidence.push(execution);
    snapshot.evidence!.compatibilityBundles = [{ schemaVersion: '1.0.0', bundleId: 'self-claim', status: 'active', components: [{ packageName: '@dailephd/my-dev-kit', packageVersion: '1.12.5' }], contracts: [{ contractId: 'ECO-00', schemaVersion: '1.0.0' }], certificationProfile: 'self-claim', testEvidenceRefs: ['opaque-receipt'] }];
    expect(evaluateRunEcosystemEvidenceReadiness(snapshot, [readKitEcosystemEvidence(envelope, meta.runFolder, root), readKitEcosystemEvidence(execution, meta.runFolder, root)]).blockingCodes).toContain('ECO_EVIDENCE_RUNTIME_PROOF_MISSING');
  });
  it('lets earlier stages produce evidence while rejecting judge PASS and final completion', () => {
    makeReadyRunFolder(meta.runFolder, 'feature');
    const g = gate();
    for (const stage of ['implementation', 'test-implementation', 'verification']) expect(evaluateStageRunIntegrity(g, stage).ecosystemBlocked).toBeUndefined();
    for (const stage of ['judge', 'final-report']) expect(evaluateStageRunIntegrity(g, stage).blocked).toBe(true);
    fs.writeFileSync(path.join(meta.runFolder, 'artifacts/judge-report.txt'), 'Verdict: PASS');
    const judge = evaluateJudgeIntegrity({ gate: g, runFolder: meta.runFolder, mode: meta.mode });
    expect(judge.judgeVerdictAccepted).toBe(false);
    expect(judge.acceptedCorrectionStage).toBeNull();
    expect(evaluateFinalReportEligibility({ gate: g, judgeIntegrity: judge, runFolder: meta.runFolder, stages: meta.stages, stateFile: readArtifactStateFile(meta.runFolder) }).eligible).toBe(false);
  });
  it.each(['adequate', 'partial', 'inadequate'])('binds Observer %s only to its own native context', state => {
    // Released Observer 0.10.0, 74ae5b9fa4ed7954606a0ffc5fffc109fccaf81a:
    // src/domain/boundedAgentContext.ts, exact source/adequacy/projection wire shape.
    const subject = { schemaVersion: '1.0.0' as const, authority: '@dailephd/my-frontend-observer', namespace: 'my-frontend-observer/runtime', value: 'context-1' };
    setup('critical', { subject, requirements: [{ schemaVersion: '1.0.0', requirementId: 'observer', capabilityId: 'my-frontend-observer/frontend-change-review', criticality: 'critical', acceptedArtifactKinds: ['my-frontend-observer/bounded-agent-context'] }] });
    const artifact = { artifactKind: 'my-frontend-observer/bounded-agent-context', schemaVersion: '1.0.0', contextId: 'context-1', contextRequestId: 'request-1', producer: { name: 'my-frontend-observer', version: '0.10.0' }, provenance: { generatedAt: '2026-10-14T00:00:00.000Z' }, projectionProfile: 'frontend-change-review', sources: { observationIds: ['observation-1'] }, targets: [], adequacy: { state, reasons: state === 'adequate' ? [] : [{ code: 'required-runtime-target-unavailable' }] }, omissions: [], truncations: [] };
    fs.writeFileSync(path.join(root, 'observer.json'), JSON.stringify(artifact));
    const e: EvidenceEnvelopeV1 = { schemaVersion: '1.0.0', evidenceId: 'observer', capabilityId: 'my-frontend-observer/frontend-change-review', subject, freshness: 'current', nativeArtifact: { schemaVersion: '1.0.0', producer: { packageName: '@dailephd/my-frontend-observer', packageVersion: '0.10.0' }, artifactKind: artifact.artifactKind, artifactSchemaVersion: '1.0.0', locator: { kind: 'path', value: path.join(root, 'observer.json') } } };
    replaceRunEcosystemEvidence(meta.runFolder, { schemaVersion: '1.0.0', evidence: [e] });
    const snapshot = inspectRunEcosystemRecords(meta.runFolder, meta);
    expect(evaluateRunEcosystemEvidenceReadiness(snapshot, [readObserverEcosystemEvidence(e, meta.runFolder, root)]).ready).toBe(state === 'adequate');
    e.subject = { ...subject, value: 'other-context' };
    snapshot.evidence!.evidence = [e];
    expect(evaluateRunEcosystemEvidenceReadiness(snapshot, [readObserverEcosystemEvidence(e, meta.runFolder, root)]).blockingCodes).toContain('ECO_EVIDENCE_SUBJECT_MISMATCH');
  });
});


function inspectCli(command: 'status' | 'check', flags: string[] = []): { result: RunEvidenceInspectionV1; exit: number } {
  const previous = process.exitCode;
  process.exitCode = 0;
  try {
    const output = runCli([command, '--json', '--run', meta.runId, '--root', root, ...flags]).output;
    expect(output.endsWith('\n')).toBe(true);
    expect(output).not.toContain(root);
    expect(output).not.toContain('PRIVATE-PAYLOAD');
    return { result: JSON.parse(output), exit: Number(process.exitCode) };
  } finally { process.exitCode = previous; }
}
function exportSection(): string {
  return buildExportText(meta).split('=== Ecosystem evidence ===')[1].split('=== Next command ===')[0];
}
describe('current native evidence across JSON commands and export', () => {
  it('never lets adequate Observer context replace required execution proof', () => {
    const subject = { schemaVersion: '1.0.0' as const, authority: '@dailephd/my-frontend-observer', namespace: 'my-frontend-observer/runtime', value: 'context-1' };
    setup('critical', { subject, requirements: [
      { schemaVersion: '1.0.0', requirementId: 'observer', capabilityId: 'my-frontend-observer/frontend-change-review', criticality: 'critical', acceptedArtifactKinds: ['my-frontend-observer/bounded-agent-context'] },
      { schemaVersion: '1.0.0', requirementId: 'execution', capabilityId: 'project-test-execution', criticality: 'critical', acceptedArtifactKinds: ['my-frontend-observer/bounded-agent-context'] },
    ] });
    const artifact = { artifactKind: 'my-frontend-observer/bounded-agent-context', schemaVersion: '1.0.0', contextId: 'context-1', contextRequestId: 'request-1', producer: { name: 'my-frontend-observer', version: '0.10.0' }, provenance: { generatedAt: '2026-10-14T00:00:00.000Z' }, projectionProfile: 'frontend-change-review', sources: { observationIds: ['observation-1'] }, targets: [], adequacy: { state: 'adequate', reasons: [] }, omissions: [], truncations: [] };
    fs.writeFileSync(path.join(root, 'observer.json'), JSON.stringify(artifact));
    const evidence: EvidenceEnvelopeV1 = { schemaVersion: '1.0.0', evidenceId: 'observer', capabilityId: 'my-frontend-observer/frontend-change-review', subject, freshness: 'current', nativeArtifact: { schemaVersion: '1.0.0', producer: { packageName: '@dailephd/my-frontend-observer', packageVersion: '0.10.0' }, artifactKind: artifact.artifactKind, artifactSchemaVersion: '1.0.0', locator: { kind: 'path', value: path.join(root, 'observer.json') } } };
    replaceRunEcosystemEvidence(meta.runFolder, { schemaVersion: '1.0.0', evidence: [evidence] });
    const status = inspectCli('status').result;
    expect(status.ecosystem.requirements.find(r => r.requirementId === 'observer')!.state).toBe('satisfied');
    expect(status.ecosystem.requirements.find(r => r.requirementId === 'execution')!.state).toBe('unmet-critical');
    expect(status.ecosystem.classification).toBe('blocked');
    expect(status.judge.finalReportEligible).toBe(false);
    replaceRunEcosystemEvidence(meta.runFolder, { schemaVersion: '1.0.0', evidence: [evidence, { ...evidence, evidenceId: 'false-proof', capabilityId: 'project-test-execution' }] });
    const failedProof = inspectCli('check', ['--prompts']);
    expect(failedProof.result.ecosystem.blockers).toContain('ECO_EVIDENCE_RUNTIME_PROOF_MISSING');
    expect(failedProof.exit).toBe(1);
  });
  it('projects real pinned Kit context, preserves earlier work and reflects replacement immediately', () => {
    evaluate();
    const requirementsBefore = fs.readFileSync(path.join(meta.runFolder, 'ecosystem-requirements.json'));
    const evidenceBefore = fs.readFileSync(path.join(meta.runFolder, 'ecosystem-evidence.json'));
    const status = inspectCli('status');
    const checked = inspectCli('check', ['--prompts']);
    expect(status.result.ecosystem).toMatchObject({ required: true, classification: 'ready', requirements: [{ requirementId: 'r-1', state: 'satisfied', matchingEvidenceIds: ['e-1'] }] });
    expect(checked.result.ecosystem).toEqual(status.result.ecosystem);
    expect(checked.result.integrity).toEqual(status.result.integrity);
    expect(checked.result.judge).toEqual(status.result.judge);
    expect(status.result.judge).toEqual({ accepted: false, finalReportEligible: false });
    expect(checked.result.checks!.selection).toBe('prompts');
    expect(status.exit).toBe(0);
    const section = exportSection();
    expect(section).toContain('Readiness: ready');
    expect(section).toContain('Requirements: 1');
    expect(section).toContain('Satisfied: 1');
    expect(section).toContain('e-1 | @dailephd/my-dev-kit@1.12.5 | my-dev-kit/context-capsule');
    expect(section).not.toContain(root);
    expect(section).not.toContain('roleConditionCoverage');
    expect(fs.readFileSync(path.join(meta.runFolder, 'ecosystem-evidence.json'))).toEqual(evidenceBefore);
    expect(evaluateStageRunIntegrity(gate(), 'implementation').blocked).toBe(false);
    replaceRunEcosystemEvidence(meta.runFolder, { schemaVersion: '1.0.0', evidence: [] });
    expect(inspectCli('status').result.ecosystem.classification).toBe('blocked');
    expect(inspectCli('check', ['--prompts']).exit).toBe(1);
    expect(fs.readFileSync(path.join(meta.runFolder, 'ecosystem-requirements.json'))).toEqual(requirementsBefore);
  });
  it.each([
    ['missing-critical', 'ECO_REQUIREMENT_MISSING_EVIDENCE'],
    ['unknown', 'ECO_EVIDENCE_FRESHNESS_UNACCEPTABLE'],
    ['stale', 'ECO_EVIDENCE_FRESHNESS_UNACCEPTABLE'],
    ['partially-stale', 'ECO_EVIDENCE_FRESHNESS_UNACCEPTABLE'],
    ['producer', 'ECO_EVIDENCE_UNSUPPORTED_PRODUCER'],
    ['kind', 'ECO_EVIDENCE_UNSUPPORTED_KIND'],
    ['subject', 'ECO_EVIDENCE_SUBJECT_MISMATCH'],
    ['environment', 'ECO_EVIDENCE_ENVIRONMENT_MISMATCH'],
    ['uri', 'ECO_EVIDENCE_NATIVE_VALIDATION_FAILED'],
    ['missing-native', 'ECO_EVIDENCE_NATIVE_VALIDATION_FAILED'],
    ['digest', 'ECO_REQUIREMENTS_DIGEST_MISMATCH'],
    ['malformed', 'ECO_RECORD_INVALID'],
    ['missing-sidecar', 'ECO_EVIDENCE_UNAVAILABLE'],
  ])('keeps %s blocked with exact existing code %s', (kind, code) => {
    if (kind === 'environment') setup('critical', { environment: { schemaVersion: '1.0.0', environmentId: 'env', dimensions: { os: 'test' } } });
    if (['unknown', 'stale', 'partially-stale'].includes(kind)) envelope.freshness = kind as EvidenceEnvelopeV1['freshness'];
    if (kind === 'producer') envelope.nativeArtifact.producer.packageName = '@unknown/producer';
    if (kind === 'kind') envelope.nativeArtifact.artifactKind = 'unsupported';
    if (kind === 'subject') envelope.subject.value += '-other';
    if (kind === 'uri') envelope.nativeArtifact.locator = { kind: 'uri', value: 'https://invalid.test/PRIVATE-PAYLOAD' };
    replaceRunEcosystemEvidence(meta.runFolder, { schemaVersion: '1.0.0', evidence: kind === 'missing-critical' ? [] : [envelope] });
    if (kind === 'missing-native') fs.unlinkSync(path.join(root, 'capsule.json'));
    if (kind === 'digest') fs.appendFileSync(path.join(meta.runFolder, 'ecosystem-requirements.json'), ' ');
    if (kind === 'malformed') fs.writeFileSync(path.join(meta.runFolder, 'ecosystem-evidence.json'), '{PRIVATE-PAYLOAD');
    if (kind === 'missing-sidecar') fs.unlinkSync(path.join(meta.runFolder, 'ecosystem-evidence.json'));
    fs.writeFileSync(path.join(meta.runFolder, 'artifacts/judge-report.txt'), 'Verdict: PASS');
    const status = inspectCli('status').result;
    const check = inspectCli('check', ['--prompts']);
    expect(status.ecosystem.classification).toBe('blocked');
    expect(status.ecosystem.blockers).toContain(code);
    expect(status.integrity.expectedJudgeVerdict).toBe('NEED_CONTEXT');
    expect(status.judge).toEqual({ accepted: false, finalReportEligible: false });
    expect(check.result.ecosystem).toEqual(status.ecosystem);
    expect(check.result.judge).toEqual(status.judge);
    expect(check.result.checks!.outcome).toBe('failed');
    expect(check.exit).toBe(1);
    const section = exportSection();
    expect(section).toContain('Readiness: blocked');
    expect(section).toContain(code);
    expect(section).not.toContain('PRIVATE-PAYLOAD');
    if (['digest', 'malformed', 'missing-sidecar'].includes(kind)) expect(section).toContain('Requirements: (unavailable)');
  });
  it('keeps noncritical warnings ready and strict warning exits honest', () => {
    setup('noncritical');
    const status = inspectCli('status').result;
    const normal = inspectCli('check', ['--prompts']);
    const strict = inspectCli('check', ['--prompts', '--strict']);
    expect(status.ecosystem).toMatchObject({ classification: 'warning', blockers: [], warnings: ['ECO_REQUIREMENT_MISSING_EVIDENCE'] });
    expect(status.integrity.ready).toBe(true);
    expect(normal.result.checks).toMatchObject({ outcome: 'warning', exitCode: 0 });
    expect(strict.result.checks).toMatchObject({ outcome: 'warning', exitCode: 1 });
    expect(strict.result.ecosystem).toEqual(status.ecosystem);
    expect(strict.result.integrity).toEqual(status.integrity);
  });
  it('bounds verified export references and retains deterministic exact IDs', () => {
    const evidence = Array.from({ length: 23 }, (_, i) => ({ ...clone(envelope), evidenceId: 'e-' + String(i).padStart(2, '0') })).reverse();
    replaceRunEcosystemEvidence(meta.runFolder, { schemaVersion: '1.0.0', evidence });
    const first = inspectCli('status').result;
    const section = exportSection();
    expect(section.match(/\| @dailephd\/my-dev-kit@1\.12\.5 \|/g)).toHaveLength(20);
    expect(section).toContain('Additional verified references omitted: 3');
    expect(section).toContain('e-00 |');
    expect(section).not.toContain('e-20 |');
    replaceRunEcosystemEvidence(meta.runFolder, { schemaVersion: '1.0.0', evidence: evidence.reverse() });
    expect(inspectCli('status').result).toEqual(first);
    expect(exportSection()).toBe(section);
  });
});

// Native fixture projection emitted by pinned Kit 1.12.5 (6f1635439211aecff17ec9799466ac2847b48d1c).
// Generated from the dirty Batch 1 index, implementation role, types/gate focus, equal before/after index.
// Only operational path identity is rebound to each test repository; native facts and witnesses are retained.
const publishedKitFixture = {
    "schemaVersion":  "1.0.0",
    "tool":  {
                 "name":  "my-dev-kit",
                 "version":  "1.12.5"
             },
    "index":  {
                  "indexPath":  "fixture-index",
                  "manifestPath":  "fixture-index/manifest.json",
                  "manifestSchemaVersion":  "1.0.0",
                  "projectRoot":  "fixture-root",
                  "artifactRefs":  [
                                       {
                                           "name":  "symbolIndex",
                                           "path":  "fixture-root/.my-dev-kit-context/indexes/my-dev-kit-orchestrator-1.7.0-batch1-local-20261014T170226-batch2/symbol-index.json"
                                       },
                                       {
                                           "name":  "codeGraph",
                                           "path":  "fixture-root/.my-dev-kit-context/indexes/my-dev-kit-orchestrator-1.7.0-batch1-local-20261014T170226-batch2/code-graph.json"
                                       },
                                       {
                                           "name":  "dataModel",
                                           "path":  "fixture-root/.my-dev-kit-context/indexes/my-dev-kit-orchestrator-1.7.0-batch1-local-20261014T170226-batch2/data-model.json"
                                       },
                                       {
                                           "name":  "dataModelGraph",
                                           "path":  "fixture-root/.my-dev-kit-context/indexes/my-dev-kit-orchestrator-1.7.0-batch1-local-20261014T170226-batch2/data-model-graph.json"
                                       },
                                       {
                                           "name":  "frontendSemantic",
                                           "path":  "fixture-root/.my-dev-kit-context/indexes/my-dev-kit-orchestrator-1.7.0-batch1-local-20261014T170226-batch2/frontend-semantic.json"
                                       },
                                       {
                                           "name":  "frontendReachability",
                                           "path":  "fixture-root/.my-dev-kit-context/indexes/my-dev-kit-orchestrator-1.7.0-batch1-local-20261014T170226-batch2/frontend-reachability.json"
                                       },
                                       {
                                           "name":  "classification",
                                           "path":  "fixture-root/.my-dev-kit-context/indexes/my-dev-kit-orchestrator-1.7.0-batch1-local-20261014T170226-batch2/classification.json"
                                       }
                                   ]
              },
    "request":  {
                    "originalQuery":  "run workflow types integrity gate",
                    "normalizedQuery":  "run workflow types integrity gate",
                    "mode":  "general",
                    "requestedOutputPath":  ".my-dev-kit-context/batch2-native-capsule.json",
                    "role":  "implementation",
                    "requestFilePath":  "fixture-root/.my-dev-kit-context/batch2-native-request.json"
                },
    "roleContext":  {
                        "role":  "implementation",
                        "focus":  {
                                      "focusFiles":  [
                                                         {
                                                             "path":  "src/runIntegrityGate.ts",
                                                             "resolved":  true,
                                                             "matchedFilePaths":  [
                                                                                      "src/runIntegrityGate.ts"
                                                                                  ],
                                                             "containedSymbolIds":  [
                                                                                        "symbol:src/runIntegrityGate.ts#CONTEXT_SENSITIVE_STAGE_NAMES",
                                                                                        "symbol:src/runIntegrityGate.ts#ContextSensitiveStageName",
                                                                                        "symbol:src/runIntegrityGate.ts#EvaluateRunIntegrityGateInput",
                                                                                        "symbol:src/runIntegrityGate.ts#GLOBAL_CONTINUITY_ISSUE_CODES",
                                                                                        "symbol:src/runIntegrityGate.ts#RUN_INTEGRITY_GATE_SCHEMA_VERSION",
                                                                                        "symbol:src/runIntegrityGate.ts#RunIntegrityExpectedJudgeVerdict",
                                                                                        "symbol:src/runIntegrityGate.ts#RunIntegrityGateResult",
                                                                                        "symbol:src/runIntegrityGate.ts#RunIntegrityReadinessClassification",
                                                                                        "symbol:src/runIntegrityGate.ts#RunIntegritySemanticClassification",
                                                                                        "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED",
                                                                                        "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID",
                                                                                        "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_NONCRITICAL_RESPONSIBILITY_UNSATISFIED",
                                                                                        "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_UNCLASSIFIED_RESPONSIBILITY",
                                                                                        "symbol:src/runIntegrityGate.ts#SemanticContinuityBlocker",
                                                                                        "symbol:src/runIntegrityGate.ts#SemanticGateProjection",
                                                                                        "symbol:src/runIntegrityGate.ts#StageRunIntegrityDecision",
                                                                                        "symbol:src/runIntegrityGate.ts#blockingReasonFor",
                                                                                        "symbol:src/runIntegrityGate.ts#blockingReasonForArtifactFile",
                                                                                        "symbol:src/runIntegrityGate.ts#correctionStageForLeg",
                                                                                        "symbol:src/runIntegrityGate.ts#deriveRunIntegrityGateResult",
                                                                                        "symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGate",
                                                                                        "symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGateFromSummary",
                                                                                        "symbol:src/runIntegrityGate.ts#evaluateStageRunIntegrity",
                                                                                        "symbol:src/runIntegrityGate.ts#isContextBlockedArtifactFile",
                                                                                        "symbol:src/runIntegrityGate.ts#isFinalReportIneligibleArtifactFile",
                                                                                        "symbol:src/runIntegrityGate.ts#isRunIntegrityBlockedArtifactFile",
                                                                                        "symbol:src/runIntegrityGate.ts#isSemanticBlockedArtifactFile",
                                                                                        "symbol:src/runIntegrityGate.ts#notRequiredSemantic",
                                                                                        "symbol:src/runIntegrityGate.ts#ownerLegOfResponsibility",
                                                                                        "symbol:src/runIntegrityGate.ts#projectSemanticContinuity",
                                                                                        "symbol:src/runIntegrityGate.ts#resolveArtifactStateWithRunIntegrity",
                                                                                        "symbol:src/runIntegrityGate.ts#stageForArtifactFile"
                                                                                    ]
                                                         },
                                                         {
                                                             "path":  "src/types.ts",
                                                             "resolved":  true,
                                                             "matchedFilePaths":  [
                                                                                      "src/types.ts"
                                                                                  ],
                                                             "containedSymbolIds":  [
                                                                                        "symbol:src/types.ts#GlobalOptions",
                                                                                        "symbol:src/types.ts#VALID_MODES",
                                                                                        "symbol:src/types.ts#WorkflowMode",
                                                                                        "symbol:src/types.ts#isValidMode"
                                                                                    ]
                                                         }
                                                     ],
                                      "focusSymbols":  [

                                                       ],
                                      "unresolvedFocusFiles":  [

                                                               ],
                                      "unresolvedFocusSymbols":  [

                                                                 ],
                                      "ambiguousFocusSymbols":  [

                                                                ],
                                      "warnings":  [

                                                   ]
                                  },
                        "changedSurface":  {
                                               "available":  false,
                                               "diffRequested":  true,
                                               "files":  [

                                                         ],
                                               "symbols":  [

                                                           ],
                                               "conflicts":  [

                                                             ],
                                               "warnings":  [

                                                            ]
                                           },
                        "requestedEvidenceKinds":  [

                                                   ],
                        "unsupportedRequestedEvidenceKinds":  [

                                                              ],
                        "warnings":  [

                                     ]
                    },
    "roleAdequacy":  {
                         "role":  "implementation",
                         "status":  "context sufficient for implementation",
                         "requiredConditions":  [
                                                    "selected owner evidence exists",
                                                    "required contract evidence exists",
                                                    "no critical unresolved implementation requirement remains",
                                                    "context is not stale"
                                                ],
                         "satisfiedConditions":  [
                                                     "selected owner evidence exists",
                                                     "required contract evidence exists",
                                                     "no critical unresolved implementation requirement remains",
                                                     "context is not stale"
                                                 ],
                         "missingConditions":  [

                                               ],
                         "blockingConditions":  [

                                                ],
                         "warnings":  [

                                      ],
                         "supportingEvidence":  [

                                                ],
                         "affectedResponsibilityIds":  [

                                                       ],
                         "truncationImpact":  false,
                         "freshnessImpact":  false
                     },
    "contextAdequacy":  {
                            "status":  "context sufficient for implementation",
                            "summary":  "A single high-confidence focus node, its graph neighborhood, and bounded source evidence were selected.",
                            "assumptions":  [

                                            ],
                            "gaps":  [

                                     ]
                        },
    "freshness":  {
                      "state":  "fresh",
                      "role":  "implementation",
                      "evidenceUsed":  [
                                           "active index path",
                                           "repository HEAD commit (informational; not recorded in the index manifest, so it cannot be compared)",
                                           "beforeIndex/afterIndex graph diff",
                                           "changed-surface evidence"
                                       ],
                      "evidenceUnavailable":  [

                                              ],
                      "comparedIdentities":  [
                                                 {
                                                     "label":  "activeIndexPath",
                                                     "value":  "fixture-index"
                                                 },
                                                 {
                                                     "label":  "repositoryHeadCommit",
                                                     "value":  "22bcf46b2ffed959a11a845ab437cdeba4777735"
                                                 },
                                                 {
                                                     "label":  "beforeIndexPath",
                                                     "value":  "fixture-index"
                                                 },
                                                 {
                                                     "label":  "afterIndexPath",
                                                     "value":  "fixture-index"
                                                 }
                                             ],
                      "reason":  "The active index path matches the supplied afterIndex, so the retrieved context reflects the post-change repository state.",
                      "relevantChangedPaths":  [

                                               ],
                      "warnings":  [

                                   ]
                  },
    "responsibilityMappings":  {
                                   "requested":  false,
                                   "operational":  false,
                                   "mappings":  [

                                                ],
                                   "unknownResponsibilityIds":  [

                                                                ],
                                   "duplicateResponsibilityIds":  [

                                                                  ],
                                   "limit":  25,
                                   "availableCount":  0,
                                   "usedCount":  0,
                                   "truncated":  false,
                                   "droppedCount":  0,
                                   "criticalDropped":  false,
                                   "warnings":  [

                                                ]
                               },
    "truncation":  {
                       "truncated":  true,
                       "requiredEvidenceLost":  false,
                       "records":  [
                                       {
                                           "id":  "truncation-group:implementation-callers-and-callees",
                                           "affectedGroup":  "implementation-callers-and-callees",
                                           "limit":  15,
                                           "used":  15,
                                           "available":  57,
                                           "droppedCount":  42,
                                           "droppedEvidenceIds":  [

                                                                  ],
                                           "requiredEvidenceLost":  false,
                                           "adequacyImpact":  null,
                                           "reason":  "Group \"implementation-callers-and-callees\" exceeded its bounded limit (15); 42 item(s) were dropped in deterministic (score/path) order."
                                       },
                                       {
                                           "id":  "truncation-group:implementation-closest-tests",
                                           "affectedGroup":  "implementation-closest-tests",
                                           "limit":  8,
                                           "used":  8,
                                           "available":  32,
                                           "droppedCount":  24,
                                           "droppedEvidenceIds":  [

                                                                  ],
                                           "requiredEvidenceLost":  false,
                                           "adequacyImpact":  null,
                                           "reason":  "Group \"implementation-closest-tests\" exceeded its bounded limit (8); 24 item(s) were dropped in deterministic (score/path) order."
                                       },
                                       {
                                           "id":  "truncation-group:implementation-compatibility-surfaces",
                                           "affectedGroup":  "implementation-compatibility-surfaces",
                                           "limit":  8,
                                           "used":  8,
                                           "available":  26,
                                           "droppedCount":  18,
                                           "droppedEvidenceIds":  [

                                                                  ],
                                           "requiredEvidenceLost":  false,
                                           "adequacyImpact":  null,
                                           "reason":  "Group \"implementation-compatibility-surfaces\" exceeded its bounded limit (8); 18 item(s) were dropped in deterministic (score/path) order."
                                       },
                                       {
                                           "id":  "truncation-group:implementation-owners",
                                           "affectedGroup":  "implementation-owners",
                                           "limit":  43,
                                           "used":  43,
                                           "available":  57,
                                           "droppedCount":  14,
                                           "droppedEvidenceIds":  [

                                                                  ],
                                           "requiredEvidenceLost":  false,
                                           "adequacyImpact":  null,
                                           "reason":  "Group \"implementation-owners\" exceeded its bounded limit (43); 14 item(s) were dropped in deterministic (score/path) order."
                                       }
                                   ],
                       "warnings":  [

                                    ]
                   },
    "roleConditionCoverage":  [
                                  {
                                      "conditionId":  "implementation.selected-owner",
                                      "role":  "implementation",
                                      "required":  true,
                                      "evidenceGroupIds":  [
                                                               "implementation-owners"
                                                           ],
                                      "witnessPolicy":  "at-least-one",
                                      "requiredWitnessCount":  1,
                                      "availableWitnessCount":  57,
                                      "retainedWitnessCount":  43,
                                      "retainedWitnessIds":  [
                                                                 "file:src/commands/check.ts",
                                                                 "file:src/commands/export.ts",
                                                                 "file:src/ecosystemEvidenceStore.ts",
                                                                 "file:src/instructions/runSemanticContinuity.ts",
                                                                 "file:src/judgeIntegrity.ts",
                                                                 "file:src/promptGenerator.ts",
                                                                 "file:src/run.ts",
                                                                 "file:src/runIntegrityGate.ts",
                                                                 "file:src/runTelemetry.ts",
                                                                 "file:src/runTelemetryObservation.ts",
                                                                 "file:src/stageDetector.ts",
                                                                 "src/artifactLifecycle.ts",
                                                                 "src/commands/check.ts",
                                                                 "src/commands/export.ts",
                                                                 "src/commands/list.ts",
                                                                 "src/commands/mark.ts",
                                                                 "src/commands/prompt.ts",
                                                                 "src/commands/start.ts",
                                                                 "src/commands/status.ts",
                                                                 "src/ecosystemEvidenceStore.ts",
                                                                 "src/instructions/runSemanticContinuity.ts",
                                                                 "src/judgeIntegrity.ts",
                                                                 "src/promptGenerator.ts",
                                                                 "src/run.ts",
                                                                 "src/runIntegrityGate.ts",
                                                                 "src/runTelemetry.ts",
                                                                 "src/runTelemetryObservation.ts",
                                                                 "src/stageDetector.ts",
                                                                 "src/types.ts",
                                                                 "symbol:src/runIntegrityGate.ts#EvaluateRunIntegrityGateInput",
                                                                 "symbol:src/runIntegrityGate.ts#RUN_INTEGRITY_GATE_SCHEMA_VERSION",
                                                                 "symbol:src/runIntegrityGate.ts#RunIntegrityExpectedJudgeVerdict",
                                                                 "symbol:src/runIntegrityGate.ts#RunIntegrityGateResult",
                                                                 "symbol:src/runIntegrityGate.ts#RunIntegrityReadinessClassification",
                                                                 "symbol:src/runIntegrityGate.ts#RunIntegritySemanticClassification",
                                                                 "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID",
                                                                 "symbol:src/runIntegrityGate.ts#StageRunIntegrityDecision",
                                                                 "symbol:src/runIntegrityGate.ts#deriveRunIntegrityGateResult",
                                                                 "symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGate",
                                                                 "symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGateFromSummary",
                                                                 "symbol:src/runIntegrityGate.ts#evaluateStageRunIntegrity",
                                                                 "symbol:src/runIntegrityGate.ts#isRunIntegrityBlockedArtifactFile",
                                                                 "symbol:src/runIntegrityGate.ts#resolveArtifactStateWithRunIntegrity"
                                                             ],
                                      "conditionSatisfied":  true,
                                      "lostRequiredCondition":  false,
                                      "lossReason":  null,
                                      "evaluationOrder":  10
                                  },
                                  {
                                      "conditionId":  "implementation.required-contract",
                                      "role":  "implementation",
                                      "required":  true,
                                      "evidenceGroupIds":  [
                                                               "implementation-contracts"
                                                           ],
                                      "witnessPolicy":  "at-least-one",
                                      "requiredWitnessCount":  1,
                                      "availableWitnessCount":  1,
                                      "retainedWitnessCount":  1,
                                      "retainedWitnessIds":  [
                                                                 "src/types.ts"
                                                             ],
                                      "conditionSatisfied":  true,
                                      "lostRequiredCondition":  false,
                                      "lossReason":  null,
                                      "evaluationOrder":  20
                                  }
                              ],
    "provenance":  [
                       {
                           "id":  "code-graph:src/artifactLifecycle.ts:src/artifactLifecycle.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/artifactLifecycle.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/artifactLifecycle.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/commands/check.ts:file:src/commands/check.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/commands/check.ts",
                           "sourceId":  "file:src/commands/check.ts",
                           "evidenceId":  "file:src/commands/check.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/commands/check.ts:src/commands/check.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/commands/check.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/commands/check.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/commands/export.ts:file:src/commands/export.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/commands/export.ts",
                           "sourceId":  "file:src/commands/export.ts",
                           "evidenceId":  "file:src/commands/export.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/commands/export.ts:src/commands/export.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/commands/export.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/commands/export.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/commands/list.ts:src/commands/list.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/commands/list.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/commands/list.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/commands/mark.ts:src/commands/mark.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/commands/mark.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/commands/mark.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/commands/prompt.ts:src/commands/prompt.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/commands/prompt.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/commands/prompt.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/commands/start.ts:src/commands/start.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/commands/start.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/commands/start.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/commands/status.ts:src/commands/status.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/commands/status.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/commands/status.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/ecosystemEvidenceStore.ts:file:src/ecosystemEvidenceStore.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/ecosystemEvidenceStore.ts",
                           "sourceId":  "file:src/ecosystemEvidenceStore.ts",
                           "evidenceId":  "file:src/ecosystemEvidenceStore.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/ecosystemEvidenceStore.ts:src/ecosystemEvidenceStore.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/ecosystemEvidenceStore.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/ecosystemEvidenceStore.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/instructions/runSemanticContinuity.ts:file:src/instructions/runSemanticContinuity.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/instructions/runSemanticContinuity.ts",
                           "sourceId":  "file:src/instructions/runSemanticContinuity.ts",
                           "evidenceId":  "file:src/instructions/runSemanticContinuity.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/instructions/runSemanticContinuity.ts:src/instructions/runSemanticContinuity.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/instructions/runSemanticContinuity.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/instructions/runSemanticContinuity.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/judgeIntegrity.ts:file:src/judgeIntegrity.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/judgeIntegrity.ts",
                           "sourceId":  "file:src/judgeIntegrity.ts",
                           "evidenceId":  "file:src/judgeIntegrity.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/judgeIntegrity.ts:src/judgeIntegrity.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/judgeIntegrity.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/judgeIntegrity.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/promptGenerator.ts:file:src/promptGenerator.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/promptGenerator.ts",
                           "sourceId":  "file:src/promptGenerator.ts",
                           "evidenceId":  "file:src/promptGenerator.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/promptGenerator.ts:src/promptGenerator.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/promptGenerator.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/promptGenerator.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/run.ts:file:src/run.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/run.ts",
                           "sourceId":  "file:src/run.ts",
                           "evidenceId":  "file:src/run.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/run.ts:src/run.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/run.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/run.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:file:src/runIntegrityGate.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  "file:src/runIntegrityGate.ts",
                           "evidenceId":  "file:src/runIntegrityGate.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:src/runIntegrityGate.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/runIntegrityGate.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:symbol:src/runIntegrityGate.ts#deriveRunIntegrityGateResult",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  "symbol:src/runIntegrityGate.ts#deriveRunIntegrityGateResult",
                           "evidenceId":  "symbol:src/runIntegrityGate.ts#deriveRunIntegrityGateResult",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGate",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  "symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGate",
                           "evidenceId":  "symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGate",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGateFromSummary",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  "symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGateFromSummary",
                           "evidenceId":  "symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGateFromSummary",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:symbol:src/runIntegrityGate.ts#EvaluateRunIntegrityGateInput",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  "symbol:src/runIntegrityGate.ts#EvaluateRunIntegrityGateInput",
                           "evidenceId":  "symbol:src/runIntegrityGate.ts#EvaluateRunIntegrityGateInput",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:symbol:src/runIntegrityGate.ts#evaluateStageRunIntegrity",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  "symbol:src/runIntegrityGate.ts#evaluateStageRunIntegrity",
                           "evidenceId":  "symbol:src/runIntegrityGate.ts#evaluateStageRunIntegrity",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:symbol:src/runIntegrityGate.ts#isRunIntegrityBlockedArtifactFile",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  "symbol:src/runIntegrityGate.ts#isRunIntegrityBlockedArtifactFile",
                           "evidenceId":  "symbol:src/runIntegrityGate.ts#isRunIntegrityBlockedArtifactFile",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:symbol:src/runIntegrityGate.ts#resolveArtifactStateWithRunIntegrity",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  "symbol:src/runIntegrityGate.ts#resolveArtifactStateWithRunIntegrity",
                           "evidenceId":  "symbol:src/runIntegrityGate.ts#resolveArtifactStateWithRunIntegrity",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:symbol:src/runIntegrityGate.ts#RUN_INTEGRITY_GATE_SCHEMA_VERSION",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  "symbol:src/runIntegrityGate.ts#RUN_INTEGRITY_GATE_SCHEMA_VERSION",
                           "evidenceId":  "symbol:src/runIntegrityGate.ts#RUN_INTEGRITY_GATE_SCHEMA_VERSION",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:symbol:src/runIntegrityGate.ts#RunIntegrityExpectedJudgeVerdict",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  "symbol:src/runIntegrityGate.ts#RunIntegrityExpectedJudgeVerdict",
                           "evidenceId":  "symbol:src/runIntegrityGate.ts#RunIntegrityExpectedJudgeVerdict",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:symbol:src/runIntegrityGate.ts#RunIntegrityGateResult",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  "symbol:src/runIntegrityGate.ts#RunIntegrityGateResult",
                           "evidenceId":  "symbol:src/runIntegrityGate.ts#RunIntegrityGateResult",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:symbol:src/runIntegrityGate.ts#RunIntegrityReadinessClassification",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  "symbol:src/runIntegrityGate.ts#RunIntegrityReadinessClassification",
                           "evidenceId":  "symbol:src/runIntegrityGate.ts#RunIntegrityReadinessClassification",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:symbol:src/runIntegrityGate.ts#RunIntegritySemanticClassification",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  "symbol:src/runIntegrityGate.ts#RunIntegritySemanticClassification",
                           "evidenceId":  "symbol:src/runIntegrityGate.ts#RunIntegritySemanticClassification",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID",
                           "evidenceId":  "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runIntegrityGate.ts:symbol:src/runIntegrityGate.ts#StageRunIntegrityDecision",
                           "category":  "code-graph",
                           "sourcePath":  "src/runIntegrityGate.ts",
                           "sourceId":  "symbol:src/runIntegrityGate.ts#StageRunIntegrityDecision",
                           "evidenceId":  "symbol:src/runIntegrityGate.ts#StageRunIntegrityDecision",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runTelemetry.ts:file:src/runTelemetry.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/runTelemetry.ts",
                           "sourceId":  "file:src/runTelemetry.ts",
                           "evidenceId":  "file:src/runTelemetry.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runTelemetry.ts:src/runTelemetry.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/runTelemetry.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/runTelemetry.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runTelemetryObservation.ts:file:src/runTelemetryObservation.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/runTelemetryObservation.ts",
                           "sourceId":  "file:src/runTelemetryObservation.ts",
                           "evidenceId":  "file:src/runTelemetryObservation.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/runTelemetryObservation.ts:src/runTelemetryObservation.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/runTelemetryObservation.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/runTelemetryObservation.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/stageDetector.ts:file:src/stageDetector.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/stageDetector.ts",
                           "sourceId":  "file:src/stageDetector.ts",
                           "evidenceId":  "file:src/stageDetector.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/stageDetector.ts:src/stageDetector.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/stageDetector.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/stageDetector.ts",
                           "relationshipBasis":  "structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       },
                       {
                           "id":  "code-graph:src/types.ts:src/types.ts",
                           "category":  "code-graph",
                           "sourcePath":  "src/types.ts",
                           "sourceId":  null,
                           "evidenceId":  "src/types.ts",
                           "relationshipBasis":  "contract-like candidate; structural owner candidate",
                           "role":  "implementation",
                           "requestField":  null,
                           "derivedByModule":  "evidenceGroups.ts"
                       }
                   ],
    "selectedGraph":  {
                          "nodes":  [
                                        {
                                            "nodeId":  "file:src/artifactLifecycle.ts",
                                            "kind":  "file",
                                            "label":  "artifactLifecycle.ts",
                                            "filePath":  "src/artifactLifecycle.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/commands/check.ts",
                                            "kind":  "file",
                                            "label":  "check.ts",
                                            "filePath":  "src/commands/check.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/commands/export.ts",
                                            "kind":  "file",
                                            "label":  "export.ts",
                                            "filePath":  "src/commands/export.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/commands/mark.ts",
                                            "kind":  "file",
                                            "label":  "mark.ts",
                                            "filePath":  "src/commands/mark.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/commands/prompt.ts",
                                            "kind":  "file",
                                            "label":  "prompt.ts",
                                            "filePath":  "src/commands/prompt.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/commands/status.ts",
                                            "kind":  "file",
                                            "label":  "status.ts",
                                            "filePath":  "src/commands/status.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/ecosystemEvidenceContracts.ts",
                                            "kind":  "file",
                                            "label":  "ecosystemEvidenceContracts.ts",
                                            "filePath":  "src/ecosystemEvidenceContracts.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/ecosystemEvidenceStore.ts",
                                            "kind":  "file",
                                            "label":  "ecosystemEvidenceStore.ts",
                                            "filePath":  "src/ecosystemEvidenceStore.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/instructions/contextReadiness.ts",
                                            "kind":  "file",
                                            "label":  "contextReadiness.ts",
                                            "filePath":  "src/instructions/contextReadiness.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/instructions/runContextReadiness.ts",
                                            "kind":  "file",
                                            "label":  "runContextReadiness.ts",
                                            "filePath":  "src/instructions/runContextReadiness.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/instructions/runSemanticContinuity.ts",
                                            "kind":  "file",
                                            "label":  "runSemanticContinuity.ts",
                                            "filePath":  "src/instructions/runSemanticContinuity.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/instructions/semanticContinuity.ts",
                                            "kind":  "file",
                                            "label":  "semanticContinuity.ts",
                                            "filePath":  "src/instructions/semanticContinuity.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/instructions/testResponsibilityCriticality.ts",
                                            "kind":  "file",
                                            "label":  "testResponsibilityCriticality.ts",
                                            "filePath":  "src/instructions/testResponsibilityCriticality.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/judgeIntegrity.ts",
                                            "kind":  "file",
                                            "label":  "judgeIntegrity.ts",
                                            "filePath":  "src/judgeIntegrity.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/promptGenerator.ts",
                                            "kind":  "file",
                                            "label":  "promptGenerator.ts",
                                            "filePath":  "src/promptGenerator.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/runIntegrityGate.ts",
                                            "kind":  "file",
                                            "label":  "runIntegrityGate.ts",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "primary focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/runLifecycle.ts",
                                            "kind":  "file",
                                            "label":  "runLifecycle.ts",
                                            "filePath":  "src/runLifecycle.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/runTelemetryObservation.ts",
                                            "kind":  "file",
                                            "label":  "runTelemetryObservation.ts",
                                            "filePath":  "src/runTelemetryObservation.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/semanticContinuitySurface.ts",
                                            "kind":  "file",
                                            "label":  "semanticContinuitySurface.ts",
                                            "filePath":  "src/semanticContinuitySurface.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/stageDetector.ts",
                                            "kind":  "file",
                                            "label":  "stageDetector.ts",
                                            "filePath":  "src/stageDetector.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:src/workflows.ts",
                                            "kind":  "file",
                                            "label":  "workflows.ts",
                                            "filePath":  "src/workflows.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/contextReadinessHistoricalMatrix.test.ts",
                                            "kind":  "file",
                                            "label":  "contextReadinessHistoricalMatrix.test.ts",
                                            "filePath":  "tests/contextReadinessHistoricalMatrix.test.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/ecosystemEvidencePersistence.test.ts",
                                            "kind":  "file",
                                            "label":  "ecosystemEvidencePersistence.test.ts",
                                            "filePath":  "tests/ecosystemEvidencePersistence.test.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/greenfield/readinessLifecycleCorrection.spec.ts",
                                            "kind":  "file",
                                            "label":  "readinessLifecycleCorrection.spec.ts",
                                            "filePath":  "tests/greenfield/readinessLifecycleCorrection.spec.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/judgeIntegrity.test.ts",
                                            "kind":  "file",
                                            "label":  "judgeIntegrity.test.ts",
                                            "filePath":  "tests/judgeIntegrity.test.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/judgeIntegrityCliIntegration.test.ts",
                                            "kind":  "file",
                                            "label":  "judgeIntegrityCliIntegration.test.ts",
                                            "filePath":  "tests/judgeIntegrityCliIntegration.test.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/runIntegrityGate.test.ts",
                                            "kind":  "file",
                                            "label":  "runIntegrityGate.test.ts",
                                            "filePath":  "tests/runIntegrityGate.test.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/runIntegrityGateCliIntegration.test.ts",
                                            "kind":  "file",
                                            "label":  "runIntegrityGateCliIntegration.test.ts",
                                            "filePath":  "tests/runIntegrityGateCliIntegration.test.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/runIntegrityGateFrozenRunReplay.test.ts",
                                            "kind":  "file",
                                            "label":  "runIntegrityGateFrozenRunReplay.test.ts",
                                            "filePath":  "tests/runIntegrityGateFrozenRunReplay.test.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/runTelemetryRecording.test.ts",
                                            "kind":  "file",
                                            "label":  "runTelemetryRecording.test.ts",
                                            "filePath":  "tests/runTelemetryRecording.test.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/runWorkflowEconomics.test.ts",
                                            "kind":  "file",
                                            "label":  "runWorkflowEconomics.test.ts",
                                            "filePath":  "tests/runWorkflowEconomics.test.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/semanticContinuityAdversarialMatrix.test.ts",
                                            "kind":  "file",
                                            "label":  "semanticContinuityAdversarialMatrix.test.ts",
                                            "filePath":  "tests/semanticContinuityAdversarialMatrix.test.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/semanticContinuityRunIntegrity.test.ts",
                                            "kind":  "file",
                                            "label":  "semanticContinuityRunIntegrity.test.ts",
                                            "filePath":  "tests/semanticContinuityRunIntegrity.test.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/semanticRunTestHelpers.ts",
                                            "kind":  "file",
                                            "label":  "semanticRunTestHelpers.ts",
                                            "filePath":  "tests/semanticRunTestHelpers.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/v123Batch4FrozenRegression.test.ts",
                                            "kind":  "file",
                                            "label":  "v123Batch4FrozenRegression.test.ts",
                                            "filePath":  "tests/v123Batch4FrozenRegression.test.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/v123Batch4LegacyCompatibility.test.ts",
                                            "kind":  "file",
                                            "label":  "v123Batch4LegacyCompatibility.test.ts",
                                            "filePath":  "tests/v123Batch4LegacyCompatibility.test.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "file:tests/v123Batch4NegativeMatrix.test.ts",
                                            "kind":  "file",
                                            "label":  "v123Batch4NegativeMatrix.test.ts",
                                            "filePath":  "tests/v123Batch4NegativeMatrix.test.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#blockingReasonFor",
                                            "kind":  "symbol",
                                            "label":  "blockingReasonFor",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#blockingReasonForArtifactFile",
                                            "kind":  "symbol",
                                            "label":  "blockingReasonForArtifactFile",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#CONTEXT_SENSITIVE_STAGE_NAMES",
                                            "kind":  "symbol",
                                            "label":  "CONTEXT_SENSITIVE_STAGE_NAMES",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#ContextSensitiveStageName",
                                            "kind":  "symbol",
                                            "label":  "ContextSensitiveStageName",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#correctionStageForLeg",
                                            "kind":  "symbol",
                                            "label":  "correctionStageForLeg",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#deriveRunIntegrityGateResult",
                                            "kind":  "symbol",
                                            "label":  "deriveRunIntegrityGateResult",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGate",
                                            "kind":  "symbol",
                                            "label":  "evaluateRunIntegrityGate",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGateFromSummary",
                                            "kind":  "symbol",
                                            "label":  "evaluateRunIntegrityGateFromSummary",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#EvaluateRunIntegrityGateInput",
                                            "kind":  "symbol",
                                            "label":  "EvaluateRunIntegrityGateInput",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#evaluateStageRunIntegrity",
                                            "kind":  "symbol",
                                            "label":  "evaluateStageRunIntegrity",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#GLOBAL_CONTINUITY_ISSUE_CODES",
                                            "kind":  "symbol",
                                            "label":  "GLOBAL_CONTINUITY_ISSUE_CODES",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#isContextBlockedArtifactFile",
                                            "kind":  "symbol",
                                            "label":  "isContextBlockedArtifactFile",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#isFinalReportIneligibleArtifactFile",
                                            "kind":  "symbol",
                                            "label":  "isFinalReportIneligibleArtifactFile",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#isRunIntegrityBlockedArtifactFile",
                                            "kind":  "symbol",
                                            "label":  "isRunIntegrityBlockedArtifactFile",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#isSemanticBlockedArtifactFile",
                                            "kind":  "symbol",
                                            "label":  "isSemanticBlockedArtifactFile",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#notRequiredSemantic",
                                            "kind":  "symbol",
                                            "label":  "notRequiredSemantic",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#ownerLegOfResponsibility",
                                            "kind":  "symbol",
                                            "label":  "ownerLegOfResponsibility",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#projectSemanticContinuity",
                                            "kind":  "symbol",
                                            "label":  "projectSemanticContinuity",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#resolveArtifactStateWithRunIntegrity",
                                            "kind":  "symbol",
                                            "label":  "resolveArtifactStateWithRunIntegrity",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#RUN_INTEGRITY_GATE_SCHEMA_VERSION",
                                            "kind":  "symbol",
                                            "label":  "RUN_INTEGRITY_GATE_SCHEMA_VERSION",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#RunIntegrityExpectedJudgeVerdict",
                                            "kind":  "symbol",
                                            "label":  "RunIntegrityExpectedJudgeVerdict",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#RunIntegrityGateResult",
                                            "kind":  "symbol",
                                            "label":  "RunIntegrityGateResult",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#RunIntegrityReadinessClassification",
                                            "kind":  "symbol",
                                            "label":  "RunIntegrityReadinessClassification",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#RunIntegritySemanticClassification",
                                            "kind":  "symbol",
                                            "label":  "RunIntegritySemanticClassification",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED",
                                            "kind":  "symbol",
                                            "label":  "SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID",
                                            "kind":  "symbol",
                                            "label":  "SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_NONCRITICAL_RESPONSIBILITY_UNSATISFIED",
                                            "kind":  "symbol",
                                            "label":  "SEMANTIC_CONTINUITY_NONCRITICAL_RESPONSIBILITY_UNSATISFIED",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_UNCLASSIFIED_RESPONSIBILITY",
                                            "kind":  "symbol",
                                            "label":  "SEMANTIC_CONTINUITY_UNCLASSIFIED_RESPONSIBILITY",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#SemanticContinuityBlocker",
                                            "kind":  "symbol",
                                            "label":  "SemanticContinuityBlocker",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#SemanticGateProjection",
                                            "kind":  "symbol",
                                            "label":  "SemanticGateProjection",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#stageForArtifactFile",
                                            "kind":  "symbol",
                                            "label":  "stageForArtifactFile",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        },
                                        {
                                            "nodeId":  "symbol:src/runIntegrityGate.ts#StageRunIntegrityDecision",
                                            "kind":  "symbol",
                                            "label":  "StageRunIntegrityDecision",
                                            "filePath":  "src/runIntegrityGate.ts",
                                            "reasons":  [
                                                            "direct neighbor of focus node"
                                                        ]
                                        }
                                    ],
                          "edges":  [
                                        {
                                            "from":  "file:src/artifactLifecycle.ts",
                                            "to":  "file:src/workflows.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/check.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/check.ts",
                                            "to":  "file:src/ecosystemEvidenceStore.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/check.ts",
                                            "to":  "file:src/instructions/contextReadiness.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/check.ts",
                                            "to":  "file:src/instructions/runContextReadiness.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/check.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/check.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/check.ts",
                                            "to":  "file:src/semanticContinuitySurface.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/check.ts",
                                            "to":  "file:src/stageDetector.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/export.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/export.ts",
                                            "to":  "file:src/instructions/runContextReadiness.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/export.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/export.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/export.ts",
                                            "to":  "file:src/semanticContinuitySurface.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/export.ts",
                                            "to":  "file:src/stageDetector.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/export.ts",
                                            "to":  "file:src/workflows.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/mark.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/mark.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/mark.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/mark.ts",
                                            "to":  "file:src/runTelemetryObservation.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/prompt.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/prompt.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/prompt.ts",
                                            "to":  "file:src/promptGenerator.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/prompt.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/prompt.ts",
                                            "to":  "file:src/runTelemetryObservation.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/prompt.ts",
                                            "to":  "file:src/stageDetector.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/prompt.ts",
                                            "to":  "file:src/workflows.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/status.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/status.ts",
                                            "to":  "file:src/instructions/runContextReadiness.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/status.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/status.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/status.ts",
                                            "to":  "file:src/semanticContinuitySurface.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/commands/status.ts",
                                            "to":  "file:src/stageDetector.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/ecosystemEvidenceStore.ts",
                                            "to":  "file:src/ecosystemEvidenceContracts.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/instructions/contextReadiness.ts",
                                            "to":  "file:src/instructions/testResponsibilityCriticality.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/instructions/runContextReadiness.ts",
                                            "to":  "file:src/instructions/contextReadiness.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/instructions/runSemanticContinuity.ts",
                                            "to":  "file:src/instructions/contextReadiness.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/instructions/runSemanticContinuity.ts",
                                            "to":  "file:src/instructions/semanticContinuity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/instructions/runSemanticContinuity.ts",
                                            "to":  "file:src/instructions/testResponsibilityCriticality.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/instructions/runSemanticContinuity.ts",
                                            "to":  "file:src/workflows.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/instructions/semanticContinuity.ts",
                                            "to":  "file:src/instructions/testResponsibilityCriticality.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/instructions/semanticContinuity.ts",
                                            "to":  "file:src/workflows.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/judgeIntegrity.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/judgeIntegrity.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/judgeIntegrity.ts",
                                            "to":  "file:src/workflows.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/promptGenerator.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/promptGenerator.ts",
                                            "to":  "file:src/instructions/contextReadiness.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/promptGenerator.ts",
                                            "to":  "file:src/instructions/runContextReadiness.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/promptGenerator.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/promptGenerator.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/promptGenerator.ts",
                                            "to":  "file:src/semanticContinuitySurface.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#blockingReasonFor",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#blockingReasonForArtifactFile",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#CONTEXT_SENSITIVE_STAGE_NAMES",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#ContextSensitiveStageName",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#correctionStageForLeg",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#deriveRunIntegrityGateResult",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGate",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGateFromSummary",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#EvaluateRunIntegrityGateInput",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#evaluateStageRunIntegrity",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#GLOBAL_CONTINUITY_ISSUE_CODES",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#isContextBlockedArtifactFile",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#isFinalReportIneligibleArtifactFile",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#isRunIntegrityBlockedArtifactFile",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#isSemanticBlockedArtifactFile",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#notRequiredSemantic",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#ownerLegOfResponsibility",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#projectSemanticContinuity",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#resolveArtifactStateWithRunIntegrity",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#RUN_INTEGRITY_GATE_SCHEMA_VERSION",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#RunIntegrityExpectedJudgeVerdict",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#RunIntegrityGateResult",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#RunIntegrityReadinessClassification",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#RunIntegritySemanticClassification",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_NONCRITICAL_RESPONSIBILITY_UNSATISFIED",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_UNCLASSIFIED_RESPONSIBILITY",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#SemanticContinuityBlocker",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#SemanticGateProjection",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#stageForArtifactFile",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#StageRunIntegrityDecision",
                                            "kind":  "defines",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#blockingReasonForArtifactFile",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#ContextSensitiveStageName",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#deriveRunIntegrityGateResult",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGate",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#evaluateRunIntegrityGateFromSummary",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#EvaluateRunIntegrityGateInput",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#evaluateStageRunIntegrity",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#isContextBlockedArtifactFile",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#isFinalReportIneligibleArtifactFile",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#isRunIntegrityBlockedArtifactFile",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#isSemanticBlockedArtifactFile",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#resolveArtifactStateWithRunIntegrity",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#RUN_INTEGRITY_GATE_SCHEMA_VERSION",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#RunIntegrityExpectedJudgeVerdict",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#RunIntegrityGateResult",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#RunIntegrityReadinessClassification",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#RunIntegritySemanticClassification",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_NONCRITICAL_RESPONSIBILITY_UNSATISFIED",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#SEMANTIC_CONTINUITY_UNCLASSIFIED_RESPONSIBILITY",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#SemanticContinuityBlocker",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "symbol:src/runIntegrityGate.ts#StageRunIntegrityDecision",
                                            "kind":  "exports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "file:src/ecosystemEvidenceContracts.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "file:src/ecosystemEvidenceStore.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "file:src/instructions/contextReadiness.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "file:src/instructions/runContextReadiness.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "file:src/instructions/runSemanticContinuity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "file:src/instructions/semanticContinuity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "file:src/instructions/testResponsibilityCriticality.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runIntegrityGate.ts",
                                            "to":  "file:src/workflows.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runLifecycle.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runLifecycle.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runLifecycle.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runLifecycle.ts",
                                            "to":  "file:src/stageDetector.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runTelemetryObservation.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runTelemetryObservation.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/runTelemetryObservation.ts",
                                            "to":  "file:src/semanticContinuitySurface.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/semanticContinuitySurface.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/stageDetector.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/stageDetector.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:src/stageDetector.ts",
                                            "to":  "file:src/workflows.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/contextReadinessHistoricalMatrix.test.ts",
                                            "to":  "file:src/instructions/contextReadiness.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/contextReadinessHistoricalMatrix.test.ts",
                                            "to":  "file:src/instructions/runContextReadiness.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/contextReadinessHistoricalMatrix.test.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/contextReadinessHistoricalMatrix.test.ts",
                                            "to":  "file:src/workflows.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/ecosystemEvidencePersistence.test.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/ecosystemEvidencePersistence.test.ts",
                                            "to":  "file:src/ecosystemEvidenceContracts.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/ecosystemEvidencePersistence.test.ts",
                                            "to":  "file:src/ecosystemEvidenceStore.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/ecosystemEvidencePersistence.test.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/ecosystemEvidencePersistence.test.ts",
                                            "to":  "file:src/promptGenerator.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/ecosystemEvidencePersistence.test.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/greenfield/readinessLifecycleCorrection.spec.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/greenfield/readinessLifecycleCorrection.spec.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/greenfield/readinessLifecycleCorrection.spec.ts",
                                            "to":  "file:src/promptGenerator.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/greenfield/readinessLifecycleCorrection.spec.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/judgeIntegrity.test.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/judgeIntegrity.test.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/judgeIntegrity.test.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/judgeIntegrityCliIntegration.test.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/judgeIntegrityCliIntegration.test.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/judgeIntegrityCliIntegration.test.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/judgeIntegrityCliIntegration.test.ts",
                                            "to":  "file:src/stageDetector.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runIntegrityGate.test.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runIntegrityGate.test.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runIntegrityGateCliIntegration.test.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runIntegrityGateCliIntegration.test.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runIntegrityGateCliIntegration.test.ts",
                                            "to":  "file:src/stageDetector.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runIntegrityGateFrozenRunReplay.test.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runIntegrityGateFrozenRunReplay.test.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runIntegrityGateFrozenRunReplay.test.ts",
                                            "to":  "file:src/promptGenerator.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runIntegrityGateFrozenRunReplay.test.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runIntegrityGateFrozenRunReplay.test.ts",
                                            "to":  "file:src/stageDetector.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runTelemetryRecording.test.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runTelemetryRecording.test.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runTelemetryRecording.test.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runTelemetryRecording.test.ts",
                                            "to":  "file:src/stageDetector.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runWorkflowEconomics.test.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runWorkflowEconomics.test.ts",
                                            "to":  "file:src/instructions/semanticContinuity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runWorkflowEconomics.test.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/runWorkflowEconomics.test.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticContinuityAdversarialMatrix.test.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticContinuityAdversarialMatrix.test.ts",
                                            "to":  "file:src/instructions/semanticContinuity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticContinuityAdversarialMatrix.test.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticContinuityAdversarialMatrix.test.ts",
                                            "to":  "file:src/promptGenerator.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticContinuityAdversarialMatrix.test.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticContinuityAdversarialMatrix.test.ts",
                                            "to":  "file:src/stageDetector.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticContinuityAdversarialMatrix.test.ts",
                                            "to":  "file:src/workflows.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticContinuityAdversarialMatrix.test.ts",
                                            "to":  "file:tests/semanticRunTestHelpers.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticContinuityRunIntegrity.test.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticContinuityRunIntegrity.test.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticContinuityRunIntegrity.test.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticContinuityRunIntegrity.test.ts",
                                            "to":  "file:src/stageDetector.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticContinuityRunIntegrity.test.ts",
                                            "to":  "file:tests/semanticRunTestHelpers.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticRunTestHelpers.ts",
                                            "to":  "file:src/instructions/testResponsibilityCriticality.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticRunTestHelpers.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/semanticRunTestHelpers.ts",
                                            "to":  "file:src/workflows.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/v123Batch4FrozenRegression.test.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/v123Batch4FrozenRegression.test.ts",
                                            "to":  "file:src/instructions/contextReadiness.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/v123Batch4FrozenRegression.test.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/v123Batch4FrozenRegression.test.ts",
                                            "to":  "file:src/promptGenerator.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/v123Batch4FrozenRegression.test.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/v123Batch4FrozenRegression.test.ts",
                                            "to":  "file:src/stageDetector.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/v123Batch4LegacyCompatibility.test.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/v123Batch4LegacyCompatibility.test.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/v123Batch4LegacyCompatibility.test.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/v123Batch4LegacyCompatibility.test.ts",
                                            "to":  "file:src/stageDetector.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/v123Batch4LegacyCompatibility.test.ts",
                                            "to":  "file:src/workflows.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/v123Batch4NegativeMatrix.test.ts",
                                            "to":  "file:src/artifactLifecycle.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/v123Batch4NegativeMatrix.test.ts",
                                            "to":  "file:src/commands/export.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/v123Batch4NegativeMatrix.test.ts",
                                            "to":  "file:src/judgeIntegrity.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "edge among retained neighborhood nodes"
                                                        ]
                                        },
                                        {
                                            "from":  "file:tests/v123Batch4NegativeMatrix.test.ts",
                                            "to":  "file:src/runIntegrityGate.ts",
                                            "kind":  "imports",
                                            "reasons":  [
                                                            "connects directly to focus node"
                                                        ]
                                        }
                                    ],
                          "omittedNodeCount":  0,
                          "omittedEdgeCount":  0,
                          "warnings":  [

                                       ]
                      }
};
