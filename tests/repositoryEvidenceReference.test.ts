import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { buildRepositoryEvidenceReference } from '../src/instructions/repositoryEvidenceReference';
import { STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from '../src/instructions/stageRepositoryEvidenceRequirements';
import { writeSupplementalContextTemplates } from '../src/instructions/supplementalContextTemplates';
import { fillRequiredSections } from './readyContextTestHelpers';

function makeRunFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-batch4-ref-'));
  fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
  return dir;
}

const implRequirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === 'stage.feature.implementation')!;
const testRequirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find(
  (r) => r.stageId === 'stage.feature.test-implementation',
)!;

function paths(runFolder: string) {
  return {
    packetPath: path.join(runFolder, 'artifacts', 'implementation-context-packet.txt'),
    reportPath: path.join(runFolder, 'reports', 'implementation-context-retrieval-report.txt'),
  };
}

describe('buildRepositoryEvidenceReference', () => {
  it('reports missing when neither file exists', () => {
    const runFolder = makeRunFolder();
    const ref = buildRepositoryEvidenceReference(implRequirement, paths(runFolder));
    expect(ref.status).toBe('missing');
    expect(ref.packetStatus).toBe('missing');
    expect(ref.reportStatus).toBe('missing');
    expect(ref.enforcement).toBe('informational');
    expect(ref.requiredForStage).toBe(true);
  });

  it('reports template when both files are starter templates', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('feature', runFolder);
    const ref = buildRepositoryEvidenceReference(implRequirement, paths(runFolder));
    expect(ref.status).toBe('template');
    expect(ref.packetStatus).toBe('template');
    expect(ref.reportStatus).toBe('template');
  });

  it('reports partial when only one file is present', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('feature', runFolder);
    fs.unlinkSync(path.join(runFolder, 'reports', 'implementation-context-retrieval-report.txt'));
    const ref = buildRepositoryEvidenceReference(implRequirement, paths(runFolder));
    expect(ref.status).toBe('partial');
    expect(ref.packetStatus).toBe('template');
    expect(ref.reportStatus).toBe('missing');
  });

  it('reports malformed when either file is structurally invalid', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('feature', runFolder);
    fs.writeFileSync(path.join(runFolder, 'artifacts', 'implementation-context-packet.txt'), 'garbage', 'utf8');
    const ref = buildRepositoryEvidenceReference(implRequirement, paths(runFolder));
    expect(ref.status).toBe('malformed');
  });

  it('reports populated when both files are structurally valid and populated', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('feature', runFolder);
    const packetPath = path.join(runFolder, 'artifacts', 'implementation-context-packet.txt');
    const reportPath = path.join(runFolder, 'reports', 'implementation-context-retrieval-report.txt');
    fs.writeFileSync(
      packetPath,
      fillRequiredSections(fs.readFileSync(packetPath, 'utf8').replace('Status: template', 'Status: populated'), 'implementation-context-packet'),
      'utf8',
    );
    fs.writeFileSync(reportPath, fs.readFileSync(reportPath, 'utf8').replace('Status: template', 'Status: populated'), 'utf8');
    const ref = buildRepositoryEvidenceReference(implRequirement, paths(runFolder));
    expect(ref.status).toBe('populated');
  });

  it('never embeds raw document text', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('feature', runFolder);
    const ref = buildRepositoryEvidenceReference(implRequirement, paths(runFolder));
    const serialized = JSON.stringify(ref);
    expect(serialized).not.toContain('## Focus');
    expect(serialized).not.toContain('Not populated.');
  });

  it('preserves declared freshness/adequacy but does not evaluate them', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('feature', runFolder);
    const packetPath = path.join(runFolder, 'artifacts', 'implementation-context-packet.txt');
    fs.writeFileSync(
      packetPath,
      fs.readFileSync(packetPath, 'utf8').replace('Freshness: unknown', 'Freshness: stale'),
      'utf8',
    );
    const ref = buildRepositoryEvidenceReference(implRequirement, paths(runFolder));
    expect(ref.declaredFreshness).toBe('stale');
    // Batch 4 never enforces -- status remains driven by structural
    // template/populated classification, not by the freshness value.
    expect(ref.status).toBe('template');
  });

  it('carries test-only responsibility-mapping fields for the test kind', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('feature', runFolder);
    const testPaths = {
      packetPath: path.join(runFolder, 'artifacts', 'test-context-packet.txt'),
      reportPath: path.join(runFolder, 'reports', 'test-context-retrieval-report.txt'),
    };
    const ref = buildRepositoryEvidenceReference(testRequirement, testPaths);
    expect(ref.responsibilityMappingsTruncated).toBe('unknown');
    expect(ref.criticalResponsibilityMappingStatus).toBe('unknown');
  });

  it('does not carry responsibility-mapping fields for the implementation kind', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('feature', runFolder);
    const ref = buildRepositoryEvidenceReference(implRequirement, paths(runFolder));
    expect(ref.responsibilityMappingsTruncated).toBeUndefined();
    expect(ref.criticalResponsibilityMappingStatus).toBeUndefined();
  });
});
