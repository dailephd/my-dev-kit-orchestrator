import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { createRun, loadRun, RunMetadata } from '../src/run';
import { initWorkspace, getRunsDir } from '../src/workspace';
import { assertEcosystemPathSafety, inspectRunEcosystemRecords, replaceRunEcosystemEvidence } from '../src/ecosystemEvidenceStore';
import { replaceRunEcosystemEvidence as publicReplacement } from '../src/index';
import { RunEcosystemRequirementsDocumentV1, RunEcosystemEvidenceDocumentV1 } from '../src/ecosystemEvidenceContracts';
import { evaluateRunIntegrityGate, evaluateStageRunIntegrity, resolveArtifactStateWithRunIntegrity } from '../src/runIntegrityGate';
import { evaluateJudgeIntegrity, evaluateFinalReportEligibility } from '../src/judgeIntegrity';
import { readArtifactStateFile } from '../src/artifactLifecycle';
import { generateLiveStagePrompt } from '../src/promptGenerator';
import * as promptGenerator from '../src/promptGenerator';
import { runCli } from './cliTestHelpers';
import { makeReadyRunFolder } from './readyContextTestHelpers';

const requirements: RunEcosystemRequirementsDocumentV1 = {
  schemaVersion: '1.0.0',
  subject: { schemaVersion: '1.0.0', authority: 'fixture', namespace: 'fixture/repository', value: 'subject with spaces' },
  environment: { schemaVersion: '1.0.0', environmentId: 'test', dimensions: { node: '24' } },
  requirements: [{ schemaVersion: '1.0.0', requirementId: 'req-1', capabilityId: 'cap-1', criticality: 'critical', acceptedArtifactKinds: ['native-kind'] }],
};
const evidence: RunEcosystemEvidenceDocumentV1 = {
  schemaVersion: '1.0.0', evidence: [{
    schemaVersion: '1.0.0', evidenceId: 'ev-1', capabilityId: 'cap-1', subject: requirements.subject,
    freshness: 'current', nativeArtifact: {
      schemaVersion: '1.0.0', producer: { packageName: 'fixture-producer', packageVersion: '0.0.1' },
      artifactKind: 'native-kind', artifactSchemaVersion: 'unverified-native-version',
      locator: { kind: 'uri', value: 'https://invalid.test/private?secret=never-fetch' }, integrity: { sha256: 'b'.repeat(64) },
    },
  }],
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const nativeFs = require('fs') as typeof fs;
let root: string;
beforeEach(() => {
  const temporaryRoot = path.resolve('.my-dev-kit-workflow/tmp');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  root = fs.mkdtempSync(path.join(temporaryRoot, 'ecosystem batch 1 '));
  initWorkspace(root);
});
afterEach(() => {
  jest.restoreAllMocks();
  const allowed = path.resolve('.my-dev-kit-workflow/tmp') + path.sep;
  if (!root.startsWith(allowed)) throw new Error('test cleanup containment failure');
  fs.rmSync(root, { recursive: true, force: true });
});
const requirementsPath = (meta: RunMetadata): string => path.join(meta.runFolder, 'ecosystem-requirements.json');
const evidencePath = (meta: RunMetadata): string => path.join(meta.runFolder, 'ecosystem-evidence.json');
const newRun = (name = 'eco', mode: RunMetadata['mode'] = 'greenfield'): RunMetadata => createRun({ request: 'eco storage', name, mode, projectRoot: root, ecosystemRequirementsDocument: clone(requirements) });
const gateFor = (meta: RunMetadata, currentStage = meta.currentStage) => evaluateRunIntegrityGate({
  mode: meta.mode, runFolder: meta.runFolder, workflowStageNames: meta.stages.map((stage) => stage.name),
  currentStage, projectRoot: meta.projectRoot, semanticContinuityVersion: meta.semanticContinuityVersion,
  ecosystemEvidenceVersion: meta.ecosystemEvidenceVersion, ecosystemRequirementsSha256: meta.ecosystemRequirementsSha256,
});

describe('explicit activation and immutable requirements', () => {
  it('keeps exact historical programmatic keys and ignores stray legacy sidecars', () => {
    const meta = createRun({ request: 'legacy', mode: 'greenfield', projectRoot: root });
    expect(Object.keys(meta).sort()).toEqual(['runId', 'mode', 'request', 'projectRoot', 'runFolder', 'createdAt', 'currentStage', 'stages', 'status', 'proofOnly'].sort());
    expect(fs.existsSync(requirementsPath(meta))).toBe(false);
    expect(fs.existsSync(evidencePath(meta))).toBe(false);
    fs.writeFileSync(requirementsPath(meta), 'invalid');
    fs.writeFileSync(evidencePath(meta), 'invalid');
    const loaded = loadRun(meta.runFolder);
    expect(loaded.ecosystemEvidenceVersion).toBeUndefined();
    expect(inspectRunEcosystemRecords(meta.runFolder, loaded)).toEqual({ activated: false, issues: [] });
    expect(gateFor(loaded).expectedJudgeVerdict).toBe('PASS');
    expect(() => replaceRunEcosystemEvidence(meta.runFolder, evidence)).toThrow('ECO_RECORD_INVALID');
  });
  it('preserves unrelated programmatic options', () => {
    const meta = createRun({ request: 'legacy options', mode: 'feature', projectRoot: root, proofOnly: true, verificationResponsibility: 'proof/result.txt', semanticContinuityVersion: '1.0.0', runTelemetryVersion: '1.0.0', sourceRepoRoot: root, targetRepoRoot: root });
    expect(meta.proofOnly).toBe(true);
    expect(meta.verificationResponsibility).toBe('proof/result.txt');
    expect(meta.runTelemetryVersion).toBe('1.0.0');
    expect(meta.sourceRepoRoot).toBe(root);
    expect(meta.ecosystemEvidenceVersion).toBeUndefined();
  });
  it.each([null, {}, { ...requirements, schemaVersion: '2.0.0' }, { ...requirements, requirements: [] }, { ...requirements, requirements: [requirements.requirements[0], requirements.requirements[0]] }, { ...requirements, extra: 'secret' }])('rejects runtime requirements %p before creation', (document) => {
    const before = fs.readdirSync(getRunsDir(root));
    expect(() => createRun({ request: 'invalid', mode: 'greenfield', projectRoot: root, ecosystemRequirementsDocument: document as RunEcosystemRequirementsDocumentV1 })).toThrow(/ECO_/);
    expect(fs.readdirSync(getRunsDir(root))).toEqual(before);
  });
  it.each([{ ecosystemEvidenceVersion: '1.0.0' }, { ecosystemRequirementsSha256: 'a'.repeat(64) }, { ecosystemEvidenceVersion: '1.0.0', ecosystemRequirementsSha256: 'a'.repeat(64) }])('rejects forged caller metadata %p', (forged) => {
    const before = fs.readdirSync(getRunsDir(root));
    expect(() => createRun({ request: 'forged', mode: 'greenfield', projectRoot: root, ...forged } as Parameters<typeof createRun>[0])).toThrow('ECO_RECORD_INVALID');
    expect(fs.readdirSync(getRunsDir(root))).toEqual(before);
  });
  it('derives metadata from the actual stored bytes and reloads without rewriting requirements', () => {
    const meta = newRun();
    const bytes = fs.readFileSync(requirementsPath(meta));
    expect(meta.ecosystemEvidenceVersion).toBe('1.0.0');
    expect(meta.ecosystemRequirementsSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(JSON.parse(fs.readFileSync(evidencePath(meta), 'utf8'))).toEqual({ schemaVersion: '1.0.0', evidence: [] });
    expect(JSON.parse(fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8'))).not.toHaveProperty('ecosystemRequirementsDocument');
    const mtime = fs.statSync(requirementsPath(meta)).mtimeMs;
    expect(loadRun(meta.runFolder).ecosystemRequirementsSha256).toBe(meta.ecosystemRequirementsSha256);
    loadRun(meta.runFolder);
    expect(fs.statSync(requirementsPath(meta)).mtimeMs).toBe(mtime);
    expect(fs.readFileSync(requirementsPath(meta))).toEqual(bytes);
    expect(fs.existsSync(path.join(meta.runFolder, 'artifact-state.json'))).toBe(false);
  });
  it('spread-preserves ECO fields through a lifecycle stage/status rewrite', () => {
    const meta = newRun();
    const disk = { ...meta, currentStage: '(complete)', status: 'completed' };
    fs.writeFileSync(path.join(meta.runFolder, 'run.json'), JSON.stringify(disk));
    const loaded = loadRun(meta.runFolder);
    expect(loaded.status).not.toBe('completed');
    expect(loaded.ecosystemEvidenceVersion).toBe('1.0.0');
    expect(loaded.ecosystemRequirementsSha256).toBe(meta.ecosystemRequirementsSha256);
    expect(JSON.parse(fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8')).ecosystemRequirementsSha256).toBe(meta.ecosystemRequirementsSha256);
  });
  it.each([
    ['ecosystem-requirements.json', null, 'ECO_REQUIREMENTS_UNAVAILABLE'],
    ['ecosystem-requirements.json', '{invalid', 'ECO_REQUIREMENTS_DIGEST_MISMATCH'],
    ['ecosystem-requirements.json', JSON.stringify({ ...requirements, schemaVersion: '2.0.0' }), 'ECO_SCHEMA_UNSUPPORTED'],
    ['ecosystem-evidence.json', null, 'ECO_EVIDENCE_UNAVAILABLE'],
    ['ecosystem-evidence.json', '{invalid', 'ECO_RECORD_INVALID'],
    ['ecosystem-evidence.json', JSON.stringify({ schemaVersion: '2.0.0', evidence: [] }), 'ECO_SCHEMA_UNSUPPORTED'],
  ])('fails closed on changed or missing %s', (file, content, code) => {
    const meta = newRun();
    const target = path.join(meta.runFolder, file!);
    if (content === null) fs.unlinkSync(target); else fs.writeFileSync(target, content!);
    const loaded = loadRun(meta.runFolder);
    const gate = gateFor(loaded);
    expect(gate.runIntegrityReady).toBe(false);
    expect(gate.ecosystemEvidenceBlockingCodes).toContain(code);
    expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
    expect(() => replaceRunEcosystemEvidence(meta.runFolder, evidence)).toThrow(/ECO_/);
    expect(fs.existsSync(target)).toBe(content !== null);
  });
  it.each([
    { ecosystemEvidenceVersion: '1.0.0' }, { ecosystemRequirementsSha256: 'a'.repeat(64) },
    { ecosystemEvidenceVersion: '2.0.0', ecosystemRequirementsSha256: 'a'.repeat(64) },
    { ecosystemEvidenceVersion: null, ecosystemRequirementsSha256: 'a'.repeat(64) },
    { ecosystemEvidenceVersion: '', ecosystemRequirementsSha256: 'a'.repeat(64) },
    { ecosystemEvidenceVersion: '1.0.0', ecosystemRequirementsSha256: 'A'.repeat(64) },
    { ecosystemEvidenceVersion: '1.0.0', ecosystemRequirementsSha256: 'a'.repeat(63) },
  ])('never downgrades malformed activation %p to legacy', (activation) => {
    const meta = newRun();
    const { ecosystemEvidenceVersion: _version, ecosystemRequirementsSha256: _digest, ...legacy } = meta;
    fs.writeFileSync(path.join(meta.runFolder, 'run.json'), JSON.stringify({ ...legacy, ...activation }));
    const loaded = loadRun(meta.runFolder);
    expect(gateFor(loaded).runIntegrityReady).toBe(false);
    expect(gateFor(loaded).expectedJudgeVerdict).toBe('NEED_CONTEXT');
    expect(() => replaceRunEcosystemEvidence(meta.runFolder, evidence)).toThrow(/ECO_/);
  });
});

describe('atomic complete replacement and path/data safety', () => {
  it('exports exactly the authorized replacement function and preserves native state', () => {
    expect(publicReplacement).toBe(replaceRunEcosystemEvidence);
    const meta = newRun();
    const immutable = fs.readFileSync(requirementsPath(meta));
    const statePath = path.join(meta.runFolder, 'artifact-state.json');
    fs.writeFileSync(statePath, JSON.stringify({ version: '1', artifacts: {} }));
    const state = fs.readFileSync(statePath);
    const rename = jest.spyOn(nativeFs, 'renameSync');
    replaceRunEcosystemEvidence(meta.runFolder, evidence);
    expect(rename).toHaveBeenCalledTimes(1);
    const [temporary, destination] = rename.mock.calls[0];
    expect(path.dirname(temporary as string)).toBe(meta.runFolder);
    expect(destination).toBe(evidencePath(meta));
    expect(fs.existsSync(temporary)).toBe(false);
    expect(JSON.parse(fs.readFileSync(evidencePath(meta), 'utf8'))).toEqual(evidence);
    expect(fs.readFileSync(requirementsPath(meta))).toEqual(immutable);
    expect(fs.readFileSync(statePath)).toEqual(state);
    expect(fs.readdirSync(meta.runFolder).filter((name) => name.includes('.tmp'))).toEqual([]);
    expect(gateFor(meta).ecosystemEvidenceBlockingCodes).toEqual(['ECO_REQUIREMENT_MISSING_EVIDENCE', 'ECO_EVIDENCE_UNSUPPORTED_PRODUCER', 'ECO_EVIDENCE_SUBJECT_MISMATCH', 'ECO_EVIDENCE_ENVIRONMENT_MISMATCH', 'ECO_COMPATIBILITY_UNVERIFIED']);
  });
  it.each([null, {}, { ...evidence, extra: 'secret' }, { ...evidence, schemaVersion: '2' }, { ...evidence, evidence: [evidence.evidence[0], evidence.evidence[0]] }, { ...evidence, evidence: [{ ...evidence.evidence[0], nativeArtifact: false }] }])('rejects invalid replacements %p without writing', (document) => {
    const meta = newRun();
    const original = fs.readFileSync(evidencePath(meta));
    const names = fs.readdirSync(meta.runFolder);
    expect(() => replaceRunEcosystemEvidence(meta.runFolder, document as RunEcosystemEvidenceDocumentV1)).toThrow(/ECO_/);
    expect(fs.readFileSync(evidencePath(meta))).toEqual(original);
    expect(fs.readdirSync(meta.runFolder)).toEqual(names);
  });
  it('leaves the original snapshot and removes only its own temp file on rename failure', () => {
    const meta = newRun();
    const original = fs.readFileSync(evidencePath(meta));
    const unrelated = path.join(meta.runFolder, '.unrelated.tmp'); fs.writeFileSync(unrelated, 'keep');
    jest.spyOn(nativeFs, 'renameSync').mockImplementation(() => { throw new Error('secret I/O error'); });
    expect(() => replaceRunEcosystemEvidence(meta.runFolder, evidence)).toThrow('ECO_RECORD_INVALID');
    expect(fs.readFileSync(evidencePath(meta))).toEqual(original);
    expect(fs.readFileSync(unrelated, 'utf8')).toBe('keep');
    expect(fs.readdirSync(meta.runFolder).filter((name) => name.startsWith('.ecosystem-evidence-'))).toEqual([]);
  });
  it('rejects tampered immutable bytes even when JSON is semantically equivalent', () => {
    const meta = newRun();
    fs.appendFileSync(requirementsPath(meta), '\n');
    expect(() => replaceRunEcosystemEvidence(meta.runFolder, evidence)).toThrow('ECO_REQUIREMENTS_DIGEST_MISMATCH');
  });
  it.each(['../../outside', '..\\outside', 'https://invalid.test/run', '\\\\server\\share\\run'])('rejects unsafe runFolder %s', (folder) => {
    expect(() => replaceRunEcosystemEvidence(folder, evidence)).toThrow('ECO_RECORD_INVALID');
  });
  it('rejects a runFolder redirected through a directory junction/symlink', () => {
    const meta = newRun();
    const link = path.join(root, 'run link');
    fs.symlinkSync(meta.runFolder, link, 'junction');
    try { expect(() => replaceRunEcosystemEvidence(link, evidence)).toThrow('ECO_RECORD_INVALID'); }
    finally { fs.unlinkSync(link); }
  });
  it('rejects a symlink below the trusted project boundary while allowing the OS temp ancestor', () => {
    const meta = newRun();
    const outside = fs.mkdtempSync(path.join(path.dirname(root), 'outside ecosystem '));
    const link = path.join(meta.runFolder, 'artifact-link');
    fs.symlinkSync(outside, link, 'junction');
    try {
      expect(() => assertEcosystemPathSafety(path.join(link, 'artifact.json'), false, true, root)).toThrow('ECO_RECORD_INVALID');
      expect(() => assertEcosystemPathSafety(meta.runFolder, true, false, root)).not.toThrow();
    } finally {
      fs.unlinkSync(link);
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
  it('accepts an activated run when a system-level ancestor aliases the trusted project path', () => {
    const target = fs.mkdtempSync(path.join(path.dirname(root), 'real ecosystem parent '));
    const alias = `${target} alias`;
    const project = path.join(alias, 'project');
    fs.symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      fs.mkdirSync(project);
      initWorkspace(project);
      const meta = createRun({ request: 'aliased temp ancestor', mode: 'greenfield', projectRoot: project, ecosystemRequirementsDocument: clone(requirements) });
      expect(loadRun(meta.runFolder).ecosystemEvidenceVersion).toBe('1.0.0');
      expect(inspectRunEcosystemRecords(meta.runFolder, meta).issues).toEqual([]);
    } finally {
      fs.rmSync(alias, { recursive: true, force: true });
      fs.rmSync(target, { recursive: true, force: true });
    }
  });
  it('accepts filesystem-equivalent path variants while preserving evidence identities', () => {
    const meta = newRun();
    const variant = process.platform === 'win32' ? meta.runFolder.toUpperCase() : meta.runFolder + path.sep + '.';
    const loaded = loadRun(variant);
    expect(loaded.ecosystemRequirementsSha256).toBe(meta.ecosystemRequirementsSha256);
    replaceRunEcosystemEvidence(variant, evidence);
    expect(JSON.parse(fs.readFileSync(evidencePath(meta), 'utf8'))).toEqual(evidence);
    expect(gateFor(loaded).runIntegrityReady).toBe(false);
  });
  it.each(['path', 'uri', 'opaque-id'] as const)('never resolves or executes %s locator data', (kind) => {
    const meta = newRun();
    const document = clone(evidence);
    document.evidence[0].nativeArtifact.locator = { kind, value: 'C:\\private\\not present; ../../outside; https://invalid.test/$(execute)' };
    const open = jest.spyOn(nativeFs, 'openSync');
    const request = jest.spyOn(require('http'), 'request');
    const exec = jest.spyOn(require('child_process'), 'exec');
    replaceRunEcosystemEvidence(meta.runFolder, document);
    expect(open.mock.calls.every(([file]) => typeof file === 'string' && path.dirname(file) === meta.runFolder)).toBe(true);
    expect(request).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(evidencePath(meta), 'utf8'))).toEqual(document);
  });
  it('never returns success when initialization fails and leaves a blocked declared run', () => {
    const write = nativeFs.writeFileSync;
    jest.spyOn(nativeFs, 'writeFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      if (typeof file === 'string' && file.endsWith('ecosystem-evidence.json')) throw new Error('private failure');
      return (write as Function)(file, ...args);
    }) as typeof fs.writeFileSync);
    expect(() => newRun()).toThrow('ECO_RECORD_INVALID');
    const folder = path.join(getRunsDir(root), fs.readdirSync(getRunsDir(root))[0]);
    const loaded = loadRun(folder);
    expect(loaded.ecosystemEvidenceVersion).toBe('1.0.0');
    expect(loaded.ecosystemRequirementsSha256).toBeUndefined();
    expect(gateFor(loaded).runIntegrityReady).toBe(false);
    expect(gateFor(loaded).ecosystemEvidenceBlockingCodes).toContain('ECO_EVIDENCE_UNAVAILABLE');
  });
  it('never returns success after prompt generation fails and preserves explicit activation', () => {
    jest.spyOn(promptGenerator, 'writeStagePrompts').mockImplementation(() => { throw new Error('private prompt failure'); });
    expect(() => newRun()).toThrow('ECO_RECORD_INVALID');
    const folder = path.join(getRunsDir(root), fs.readdirSync(getRunsDir(root))[0]);
    const loaded = loadRun(folder);
    expect(loaded.ecosystemRequirementsSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(gateFor(loaded).runIntegrityReady).toBe(false);
  });
  it('verifies the actual stored run metadata before returning activation success', () => {
    const write = nativeFs.writeFileSync;
    jest.spyOn(nativeFs, 'writeFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, data: unknown, ...args: unknown[]) => {
      if (typeof file === 'string' && file.endsWith('run.json') && typeof data === 'string' && data.includes('ecosystemRequirementsSha256')) {
        data = JSON.stringify({ ...JSON.parse(data), ecosystemRequirementsSha256: '0'.repeat(64) });
      }
      return (write as Function)(file, data, ...args);
    }) as typeof fs.writeFileSync);
    expect(() => newRun()).toThrow('ECO_RECORD_INVALID');
  });
  it('does not echo native creation I/O errors through activated creation', () => {
    const write = nativeFs.writeFileSync;
    jest.spyOn(nativeFs, 'writeFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      if (typeof file === 'string' && file.endsWith('00-request.txt')) throw new Error('private filesystem content');
      return (write as Function)(file, ...args);
    }) as typeof fs.writeFileSync);
    expect(() => newRun()).toThrow('ECO_RECORD_INVALID');
  });
});

describe('CLI activation and canonical guard agreement', () => {
  it('matches programmatic bytes/digest for equivalent input with a filename containing spaces', () => {
    const input = path.join(root, 'requirements input.json');
    fs.writeFileSync(input, JSON.stringify(Object.fromEntries(Object.entries(requirements).reverse())));
    const programmatic = newRun('programmatic');
    const result = runCli(['start', 'eco cli', '--mode', 'greenfield', '--root', root, '--name', 'cli', '--ecosystem-requirements', input]);
    expect(result.exitCode ?? 0).toBe(0);
    expect(result.output).toContain('Created workflow run');
    const folder = fs.readdirSync(getRunsDir(root)).find((name) => name !== programmatic.runId)!;
    const cli = loadRun(path.join(getRunsDir(root), folder));
    expect(fs.readFileSync(requirementsPath(cli))).toEqual(fs.readFileSync(requirementsPath(programmatic)));
    expect(fs.readFileSync(evidencePath(cli))).toEqual(fs.readFileSync(evidencePath(programmatic)));
    expect(cli.ecosystemRequirementsSha256).toBe(programmatic.ecosystemRequirementsSha256);
    expect(Object.keys(cli).filter((key) => key.startsWith('ecosystem')).sort()).toEqual(['ecosystemEvidenceVersion', 'ecosystemRequirementsSha256']);
  });
  it('keeps historical CLI activation choices when the ECO flag is absent', () => {
    const result = runCli(['start', 'legacy cli', '--root', root]);
    expect(result.exitCode ?? 0).toBe(0);
    const folder = path.join(getRunsDir(root), fs.readdirSync(getRunsDir(root))[0]);
    const meta = loadRun(folder);
    expect(meta.semanticContinuityVersion).toBe('1.0.0');
    expect(meta.runTelemetryVersion).toBe('1.0.0');
    expect(meta.ecosystemEvidenceVersion).toBeUndefined();
    expect(Object.keys(meta).sort()).toEqual(['runId', 'mode', 'request', 'projectRoot', 'runFolder', 'createdAt', 'currentStage', 'stages', 'status', 'proofOnly', 'semanticContinuityVersion', 'runTelemetryVersion'].sort());
    expect(fs.existsSync(evidencePath(meta))).toBe(false);
    expect(result.output).not.toContain('ECO_');
  });
  it.each(['missing', 'malformed', 'invalid', 'unsupported', 'directory', 'traversal', 'junction'])('rejects %s CLI input without creating a run', (kind) => {
    let input = path.join(root, 'input.json');
    let link: string | undefined;
    if (kind === 'malformed') fs.writeFileSync(input, '{private-secret');
    if (kind === 'invalid') fs.writeFileSync(input, JSON.stringify({ ...requirements, requirements: [] }));
    if (kind === 'unsupported') fs.writeFileSync(input, JSON.stringify({ ...requirements, schemaVersion: '9' }));
    if (kind === 'directory') input = root;
    if (kind === 'traversal') input = path.join(root, 'nested') + '/../../outside.json';
    if (kind === 'junction') { link = path.join(root, 'input link'); fs.symlinkSync(root, link, 'junction'); input = path.join(link, 'input.json'); fs.writeFileSync(path.join(root, 'input.json'), JSON.stringify(requirements)); }
    try {
      const before = fs.readdirSync(getRunsDir(root));
      const result = runCli(['start', 'bad input', '--root', root, '--ecosystem-requirements', input]);
      expect(result.exitCode).toBe(1);
      expect(result.output).not.toContain('Created workflow run');
      expect(result.output).not.toContain('private-secret');
      expect(fs.readdirSync(getRunsDir(root))).toEqual(before);
    } finally { if (link) fs.unlinkSync(link); }
  });
  it.each([false, true])('blocks terminal stage projections and command surfaces with imported=%s', (imported) => {
    const meta = newRun('gate', 'feature');
    makeReadyRunFolder(meta.runFolder, 'feature');
    if (imported) replaceRunEcosystemEvidence(meta.runFolder, evidence);
    const gate = gateFor(meta);
    expect(gate.contextReady).toBe(true);
    expect(gate.semanticContinuityReady).toBe(true);
    expect(gate.runIntegrityReady).toBe(false);
    expect(gate.ecosystemEvidenceBlockingCodes).toEqual(imported ? ['ECO_REQUIREMENT_MISSING_EVIDENCE', 'ECO_EVIDENCE_UNSUPPORTED_PRODUCER', 'ECO_EVIDENCE_SUBJECT_MISMATCH', 'ECO_EVIDENCE_ENVIRONMENT_MISMATCH', 'ECO_COMPATIBILITY_UNVERIFIED'] : ['ECO_REQUIREMENT_MISSING_EVIDENCE', 'ECO_COMPATIBILITY_UNVERIFIED']);
    const state = readArtifactStateFile(meta.runFolder);
    for (const stage of meta.stages) {
      const decision = evaluateStageRunIntegrity(gate, stage.name);
      const terminal = stage.name === 'judge' || stage.name === 'final-report';
      expect(decision.stageMayRenderNormalPrompt).toBe(!terminal);
      expect(decision.stageMayMarkComplete).toBe(!terminal);
      expect(decision.stageMayAdvance).toBe(!terminal);
      if (terminal) {
        expect(resolveArtifactStateWithRunIntegrity(meta.runFolder, stage.artifactFile, meta.stages, state, gate)).toBe('blocked');
        expect(generateLiveStagePrompt(meta, stage.name, gate)).toContain('ECO_REQUIREMENT_MISSING_EVIDENCE');
      } else {
        expect(resolveArtifactStateWithRunIntegrity(meta.runFolder, stage.artifactFile, meta.stages, state, gate)).not.toBe('blocked');
      }
    }
    for (const args of [['status'], ['check'], ['check', '--all'], ['check', '--artifacts'], ['check', '--prompts'], ['prompt', 'judge'], ['export'], ['mark', 'judge-report.txt', '--state', 'complete']]) {
      const result = runCli([...args, '--root', root, '--run', meta.runId]);
      expect(result.output).toContain('ECO_REQUIREMENT_MISSING_EVIDENCE');
      if (args[0] === 'check' || args[0] === 'mark') expect(result.exitCode).toBe(1);
      if (args[0] === 'prompt') expect(result.output).toContain('Refresh producer-native evidence');
    }
    expect(fs.existsSync(path.join(meta.runFolder, 'artifact-state.json'))).toBe(false);
  });
  it('rejects authored PASS and completed native artifacts under the same gate', () => {
    const meta = newRun('judge', 'feature'); makeReadyRunFolder(meta.runFolder, 'feature');
    for (const stage of meta.stages) fs.writeFileSync(path.join(meta.runFolder, stage.artifactFile), 'done');
    fs.writeFileSync(path.join(meta.runFolder, 'artifacts/judge-report.txt'), 'Verdict: PASS');
    const gate = gateFor(meta, '(complete)');
    const judge = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
    expect(judge.expectedJudgeVerdict).toBe('NEED_CONTEXT');
    expect(judge.judgeVerdictAccepted).toBe(false);
    expect(judge.blockingCodes).toContain('JUDGE_VERDICT_CONTRADICTS_RUN_INTEGRITY');
    expect(evaluateFinalReportEligibility({ gate, judgeIntegrity: judge, runFolder: meta.runFolder, stages: meta.stages, stateFile: readArtifactStateFile(meta.runFolder) }).eligible).toBe(false);
    expect(loadRun(meta.runFolder).status).not.toBe('completed');
    const finalMark = runCli(['mark', 'final-report.txt', '--state', 'complete', '--root', root, '--run', meta.runId]);
    expect(finalMark.exitCode).toBe(1);
    expect(finalMark.output).toContain('ECO_REQUIREMENT_MISSING_EVIDENCE');
    expect(runCli(['prompt', '--root', root, '--run', meta.runId]).output).not.toContain('is complete -');
  });
  it('retains original context and semantic primary precedence', () => {
    const meta = newRun('precedence', 'feature');
    const contextBlocked = gateFor(meta, 'implementation');
    expect(contextBlocked.primaryBlockingCode).not.toMatch(/^ECO_/);
    expect(contextBlocked.blockingCodes).toContain('ECO_REQUIREMENT_MISSING_EVIDENCE');
    makeReadyRunFolder(meta.runFolder, 'feature');
    const semantic = gateFor({ ...meta, semanticContinuityVersion: 'unsupported' });
    expect(semantic.primaryBlockingCode).toBe('SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED');
    expect(semantic.ecosystemEvidenceBlockingCodes).toEqual(['ECO_REQUIREMENT_MISSING_EVIDENCE', 'ECO_COMPATIBILITY_UNVERIFIED']);
  });
  it('does not accept fabricated judge eligibility with an empty prior-stage list', () => {
    const meta = newRun();
    const gate = gateFor(meta);
    const judge = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
    const eligibility = evaluateFinalReportEligibility({ gate, judgeIntegrity: { ...judge, finalReportEligible: true }, runFolder: meta.runFolder, stages: [], stateFile: readArtifactStateFile(meta.runFolder) });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockingCodes).toContain('ECO_REQUIREMENT_MISSING_EVIDENCE');
  });
  it.each(['ecosystem-requirements.json', 'ecosystem-evidence.json'])('does not register %s as a native mark target', (sidecar) => {
    const meta = newRun();
    const result = runCli(['mark', sidecar, '--state', 'complete', '--root', root, '--run', meta.runId]);
    expect(result.exitCode).toBe(1);
    expect(fs.existsSync(path.join(meta.runFolder, 'artifact-state.json'))).toBe(false);
  });
});
