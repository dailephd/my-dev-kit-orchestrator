import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveArtifactContractsForMode, checkArtifactContract } from '../../src/contractChecker';
import { initWorkspace } from '../../src/workspace';
import { createRun } from '../../src/run';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-greenfield-contract-test-'));
}

function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const EXPECTED_ARTIFACT_PATHS: Record<string, string> = {
  'idea-brief': 'artifacts/idea-brief.json',
  'product-boundary': 'artifacts/product-boundary.txt',
  'stack-decision': 'artifacts/stack-decision.txt',
  'starter-profile': 'artifacts/starter-profile.json',
  'bootstrap-bundle': 'artifacts/bootstrap-bundle.json',
  'project-docs': 'artifacts/project-docs-report.txt',
  'scaffold-plan': 'artifacts/scaffold-plan.txt',
  'scaffold-implementation': 'reports/scaffold-implementation-report.txt',
  'first-vertical-slice': 'artifacts/first-vertical-slice.txt',
  verification: 'artifacts/verification-report.txt',
  'initial-index': 'reports/initial-index-report.txt',
  judge: 'artifacts/judge-report.txt',
  'final-report': 'artifacts/final-report.txt',
};

describe('greenfield artifact contract', () => {
  it('resolves a non-null contract summary for greenfield', () => {
    const summary = resolveArtifactContractsForMode('greenfield');
    expect(summary).not.toBeNull();
    expect(summary!.mode).toBe('greenfield');
    expect(summary!.stages.length).toBe(13);
  });

  it('defines all required greenfield artifact and report paths exactly', () => {
    const summary = resolveArtifactContractsForMode('greenfield')!;
    for (const stage of summary.stages) {
      expect(stage.artifactFile).toBe(EXPECTED_ARTIFACT_PATHS[stage.stageName]);
    }
  });

  it('assigns every stage a known artifact kind (no "Unknown" kinds)', () => {
    const summary = resolveArtifactContractsForMode('greenfield')!;
    for (const stage of summary.stages) {
      expect(stage.artifactKind).not.toBe('Unknown');
    }
  });

  it('does not require any Android/mobile artifact', () => {
    const summary = resolveArtifactContractsForMode('greenfield')!;
    const serialized = JSON.stringify(summary).toLowerCase();
    expect(serialized).not.toMatch(/android|react-native|flutter|jetpack/);
  });

  it('does not require any release/security/publish artifact', () => {
    const summary = resolveArtifactContractsForMode('greenfield')!;
    const stageNames = summary.stages.map((s) => s.stageName);
    const artifactKinds = summary.stages.map((s) => s.artifactKind);
    for (const forbidden of ['release', 'security', 'publish']) {
      expect(stageNames.join(' ').toLowerCase()).not.toContain(forbidden);
      expect(artifactKinds.join(' ').toLowerCase()).not.toContain(forbidden);
    }
  });

  it('follows current project patterns for missing artifacts (CONTRACT_MISSING_FILE)', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({
        request: 'Create a sample TypeScript CLI app',
        mode: 'greenfield',
        projectRoot: tmp,
      });
      const result = checkArtifactContract(meta.runFolder, 'artifacts/idea-brief.json', 'idea-brief', 'greenfield', []);
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.code === 'CONTRACT_MISSING_FILE')).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('passes contract check once a minimal valid artifact is present', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({
        request: 'Create a sample TypeScript CLI app',
        mode: 'greenfield',
        projectRoot: tmp,
      });
      const artifactPath = path.join(meta.runFolder, 'artifacts/idea-brief.json');
      fs.writeFileSync(
        artifactPath,
        ['Artifact: IdeaBrief', 'Workflow mode: greenfield', 'Status: complete'].join('\n'),
        'utf8',
      );
      const result = checkArtifactContract(meta.runFolder, 'artifacts/idea-brief.json', 'idea-brief', 'greenfield', []);
      expect(result.passed).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });
});
