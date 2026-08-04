import * as path from 'path';
import { buildInstructionCatalog } from '../src/instructions/catalog';
import {
  STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS,
  findStageRepositoryEvidenceRequirement,
  validateStageRepositoryEvidenceRequirements,
  requiredSupplementalContextKindsForMode,
  implementationContextPacketPath,
  implementationContextRetrievalReportPath,
  testContextPacketPath,
  testContextRetrievalReportPath,
} from '../src/instructions/stageRepositoryEvidenceRequirements';

describe('STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS', () => {
  it('has exactly 11 entries: 5 implementation + 6 test-implementation', () => {
    expect(STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.length).toBe(11);
    const implementationCount = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.filter((r) => r.role === 'implementation').length;
    const testCount = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.filter((r) => r.role === 'test-implementation').length;
    expect(implementationCount).toBe(5);
    expect(testCount).toBe(6);
  });

  it('contains exactly the expected stage IDs', () => {
    const ids = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.map((r) => r.stageId).sort();
    expect(ids).toEqual(
      [
        'stage.extraction.implementation',
        'stage.extraction.test-implementation',
        'stage.feature.implementation',
        'stage.feature.test-implementation',
        'stage.harden.implementation',
        'stage.harden.test-implementation',
        'stage.refactor.implementation',
        'stage.refactor.test-implementation',
        'stage.repair.implementation',
        'stage.repair.test-implementation',
        'stage.test.test-implementation',
      ].sort(),
    );
  });

  it('every entry uses informational enforcement', () => {
    for (const req of STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS) {
      expect(req.enforcement).toBe('informational');
      expect(req.requiredForStage).toBe(true);
    }
  });

  it('has no greenfield entry', () => {
    expect(STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.some((r) => r.stageId.startsWith('stage.greenfield.'))).toBe(false);
  });

  it('passes registry validation against the real catalog with zero issues', () => {
    const issues = validateStageRepositoryEvidenceRequirements(buildInstructionCatalog());
    expect(issues).toEqual([]);
  });

  it('findStageRepositoryEvidenceRequirement uses exact stage-ID lookup, no stage-name fallback', () => {
    expect(findStageRepositoryEvidenceRequirement('stage.feature.implementation')).toBeDefined();
    // Same stage-name segment ("implementation") under an unrelated/nonexistent
    // workflow ID must not match by name alone.
    expect(findStageRepositoryEvidenceRequirement('stage.bogus-mode.implementation')).toBeUndefined();
    expect(findStageRepositoryEvidenceRequirement('stage.greenfield.scaffold-implementation')).toBeUndefined();
  });

  it('mode matrix matches the approved requirement matrix', () => {
    expect(requiredSupplementalContextKindsForMode('feature').sort()).toEqual(['implementation', 'test']);
    expect(requiredSupplementalContextKindsForMode('repair').sort()).toEqual(['implementation', 'test']);
    expect(requiredSupplementalContextKindsForMode('test')).toEqual(['test']);
    expect(requiredSupplementalContextKindsForMode('refactor').sort()).toEqual(['implementation', 'test']);
    expect(requiredSupplementalContextKindsForMode('harden').sort()).toEqual(['implementation', 'test']);
    expect(requiredSupplementalContextKindsForMode('extraction').sort()).toEqual(['implementation', 'test']);
    expect(requiredSupplementalContextKindsForMode('greenfield')).toEqual([]);
  });
});

describe('supplemental context path helpers', () => {
  it('derive the exact fixed paths under a run folder', () => {
    const runFolder = path.join(path.parse(process.cwd()).root, 'runs', 'run-1');
    expect(implementationContextPacketPath(runFolder)).toBe(
      path.resolve(runFolder, 'artifacts/implementation-context-packet.txt'),
    );
    expect(implementationContextRetrievalReportPath(runFolder)).toBe(
      path.resolve(runFolder, 'reports/implementation-context-retrieval-report.txt'),
    );
    expect(testContextPacketPath(runFolder)).toBe(path.resolve(runFolder, 'artifacts/test-context-packet.txt'));
    expect(testContextRetrievalReportPath(runFolder)).toBe(
      path.resolve(runFolder, 'reports/test-context-retrieval-report.txt'),
    );
  });
});
