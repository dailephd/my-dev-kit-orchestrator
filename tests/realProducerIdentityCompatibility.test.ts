import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from '@jest/globals';
import { evaluateContextReadiness } from '../src/instructions/contextReadiness';
import {
  findCapsuleAuditInconsistencies,
  readRawContextCapsule,
  readRawRetrievalAudit,
} from '../src/instructions/myDevKitEvidenceSummary';
import { STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from '../src/instructions/stageRepositoryEvidenceRequirements';
import { makeReadyRunFolder } from './readyContextTestHelpers';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'context-contracts', 'my-dev-kit-1.10.2-identity');
const EXPECTED_PROJECT_ROOT = 'Z:/Users/newuser/Projects/my-dev-kit-orchestrator';
const implRequirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find(
  (requirement) => requirement.stageId === 'stage.feature.implementation',
)!;
const tempDirs: string[] = [];

function makeRunFolder(): string {
  const runFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-real-producer-'));
  tempDirs.push(runFolder);
  makeReadyRunFolder(runFolder, 'feature');
  fs.copyFileSync(
    path.join(FIXTURE_DIR, 'context-capsule.json'),
    path.join(runFolder, 'implementation-capsule.json'),
  );
  fs.copyFileSync(
    path.join(FIXTURE_DIR, 'retrieval-audit-record.json'),
    path.join(runFolder, 'implementation-audit.json'),
  );
  return runFolder;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('copied real my-dev-kit producer identity pair', () => {
  it('parses matching repository/active/before/after identity and reaches ready', () => {
    const runFolder = makeRunFolder();
    const capsule = readRawContextCapsule(path.join(runFolder, 'implementation-capsule.json'), runFolder);
    const audit = readRawRetrievalAudit(path.join(runFolder, 'implementation-audit.json'), runFolder);
    expect(capsule.ok).toBe(true);
    expect(audit.ok).toBe(true);
    if (!capsule.ok || !audit.ok) return;

    expect(capsule.projection.projectRoot).toBe(EXPECTED_PROJECT_ROOT);
    expect(audit.projection.projectRoot).toBe(EXPECTED_PROJECT_ROOT);
    expect(capsule.projection.indexPath).toBe(audit.projection.indexPath);
    expect(capsule.projection.freshnessBeforeIndexPath).toBe(audit.projection.freshnessBeforeIndexPath);
    expect(capsule.projection.freshnessAfterIndexPath).toBe(audit.projection.freshnessAfterIndexPath);
    expect(findCapsuleAuditInconsistencies(capsule.projection, audit.projection)).toEqual([]);

    const readiness = evaluateContextReadiness({
      requirement: implRequirement,
      stageId: implRequirement.stageId,
      runFolder,
      mode: 'feature',
      projectRoot: EXPECTED_PROJECT_ROOT,
    });
    expect(readiness.decision).toBe('ready');
    expect(readiness.blockingIssueCodes).toEqual([]);
  });

  it('keeps a copied legacy-style audit readable but blocks identity-sensitive readiness', () => {
    const runFolder = makeRunFolder();
    const auditPath = path.join(runFolder, 'implementation-audit.json');
    const legacyAudit = JSON.parse(fs.readFileSync(auditPath, 'utf8')) as {
      index: { projectRoot?: string; manifestSchemaVersion?: string };
    };
    delete legacyAudit.index.projectRoot;
    delete legacyAudit.index.manifestSchemaVersion;
    fs.writeFileSync(auditPath, `${JSON.stringify(legacyAudit, null, 2)}\n`, 'utf8');

    expect(readRawRetrievalAudit(auditPath, runFolder).ok).toBe(true);
    const readiness = evaluateContextReadiness({
      requirement: implRequirement,
      stageId: implRequirement.stageId,
      runFolder,
      mode: 'feature',
      projectRoot: EXPECTED_PROJECT_ROOT,
    });
    expect(readiness.decision).toBe('refresh-required');
    expect(readiness.blockingIssueCodes).toEqual(
      expect.arrayContaining(['CONTEXT_SOURCE_SUMMARY_MISMATCH', 'CONTEXT_SOURCE_REPOSITORY_INCOMPLETE']),
    );
  });
});
