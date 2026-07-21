import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveRawEvidencePath } from '../src/instructions/myDevKitEvidenceSummary';
import { implementationContextPacketPath, testContextRetrievalReportPath } from '../src/instructions/stageRepositoryEvidenceRequirements';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { evaluateContextReadiness } from '../src/instructions/contextReadiness';
import { STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from '../src/instructions/stageRepositoryEvidenceRequirements';

describe('v1.2.1 cross-platform path safety', () => {
  describe('resolveRawEvidencePath', () => {
    const runFolder = path.join(path.parse(process.cwd()).root, 'runs', 'run-1');

    it.each([
      ['drive-letter absolute path', 'C:\\Users\\dev\\evidence\\capsule.json'],
      ['backslash separators', 'C:\\Program Files (x86)\\data\\capsule.json'],
      ['path with spaces', 'C:\\Users\\dev\\My Project (v1)\\capsule.json'],
      ['path with hyphens and underscores', 'C:\\Users\\dev\\my-project_data\\capsule.json'],
      ['posix-style absolute path', '/home/dev/evidence/capsule.json'],
      ['posix path with spaces', '/home/dev/My Project/capsule.json'],
      ['posix path with dots', '/home/dev/.cache/my-dev-kit/capsule.json'],
      ['long nested relative path', 'a/b/c/d/e/f/g/h/capsule.json'],
    ])('accepts a safe %s', (_label, input) => {
      const result = resolveRawEvidencePath(input, runFolder);
      expect(result.safe).toBe(true);
    });

    it.each([
      ['traversal via ../', '../../etc/capsule.json'],
      ['traversal embedded mid-path', 'evidence/../../capsule.json'],
      ['NUL byte', 'capsule\0.json'],
      ['http URL', 'http://example.com/capsule.json'],
      ['https URL', 'https://example.com/capsule.json'],
      ['file URL', 'file:///etc/capsule.json'],
    ])('rejects %s', (_label, input) => {
      const result = resolveRawEvidencePath(input, runFolder);
      expect(result.safe).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('normalizes an absolute path without altering runFolder-relative resolution for relative paths', () => {
      const absolutePath = path.join(path.parse(process.cwd()).root, 'evidence', 'capsule.json');
      const absolute = resolveRawEvidencePath(absolutePath, runFolder);
      expect(absolute.resolved).toBe(path.normalize(absolutePath));

      const relative = resolveRawEvidencePath('evidence/capsule.json', runFolder);
      expect(relative.resolved).toBe(path.resolve(runFolder, 'evidence/capsule.json'));
    });
  });

  describe('fixed supplemental context path helpers', () => {
    it.each([
      ['Windows drive-letter run folder', 'C:\\Users\\dev\\.my-dev-kit-orchestrator\\runs\\run-1'],
      ['Windows run folder with spaces', 'C:\\Users\\dev name\\My Project (2)\\.my-dev-kit-orchestrator\\runs\\run-1'],
      ['POSIX run folder', '/home/dev/project/.my-dev-kit-orchestrator/runs/run-1'],
      ['POSIX run folder with spaces', '/home/dev/My Project/.my-dev-kit-orchestrator/runs/run-1'],
    ])('derives a path under the run folder for %s', (_label, runFolder) => {
      const packetPath = implementationContextPacketPath(runFolder);
      const reportPath = testContextRetrievalReportPath(runFolder);
      expect(packetPath.startsWith(path.resolve(runFolder))).toBe(true);
      expect(reportPath.startsWith(path.resolve(runFolder))).toBe(true);
    });
  });

  describe('run folders with spaces and nested paths end-to-end', () => {
    it('readiness evaluation works correctly when the run folder itself contains spaces and parentheses', () => {
      const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-space-test-'));
      const runFolder = path.join(parent, 'My Run (v1) - test');
      makeReadyRunFolder(runFolder, 'feature');
      const requirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === 'stage.feature.implementation')!;
      const result = evaluateContextReadiness({
        requirement,
        stageId: requirement.stageId,
        runFolder,
        mode: 'feature',
      });
      expect(result.decision).toBe('ready');
      fs.rmSync(parent, { recursive: true, force: true });
    });

    it('readiness evaluation works correctly for a deeply nested run folder', () => {
      const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-nested-test-'));
      const runFolder = path.join(parent, 'a', 'b', 'c', 'd', 'e', 'run-1');
      makeReadyRunFolder(runFolder, 'feature');
      const requirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === 'stage.feature.implementation')!;
      const result = evaluateContextReadiness({
        requirement,
        stageId: requirement.stageId,
        runFolder,
        mode: 'feature',
      });
      expect(result.decision).toBe('ready');
      fs.rmSync(parent, { recursive: true, force: true });
    });
  });

  describe('directory rejected in place of a file', () => {
    it('a raw-evidence reference pointing at a directory is rejected as unreadable, not crashed on', () => {
      const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-dir-ref-'));
      const runFolder = path.join(parent, 'run');
      makeReadyRunFolder(runFolder, 'feature');
      const packetPath = path.join(runFolder, 'artifacts', 'implementation-context-packet.txt');
      const dirAsCapsule = path.join(parent, 'not-a-file-dir');
      fs.mkdirSync(dirAsCapsule);
      const text = fs
        .readFileSync(packetPath, 'utf8')
        .replace(/Source context capsule: .*/, `Source context capsule: ${dirAsCapsule}`);
      fs.writeFileSync(packetPath, text, 'utf8');

      const requirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === 'stage.feature.implementation')!;
      expect(() =>
        evaluateContextReadiness({ requirement, stageId: requirement.stageId, runFolder, mode: 'feature' }),
      ).not.toThrow();
      const result = evaluateContextReadiness({ requirement, stageId: requirement.stageId, runFolder, mode: 'feature' });
      expect(result.decision).toBe('refresh-required');
      expect(result.classification).toBe('source-reference-unreadable');
      fs.rmSync(parent, { recursive: true, force: true });
    });
  });

  describe('nonexistent raw-evidence reference', () => {
    it('a raw-evidence reference pointing at a nonexistent path is rejected deterministically', () => {
      const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-nonexistent-ref-'));
      const runFolder = path.join(parent, 'run');
      makeReadyRunFolder(runFolder, 'feature');
      const packetPath = path.join(runFolder, 'artifacts', 'implementation-context-packet.txt');
      const text = fs
        .readFileSync(packetPath, 'utf8')
        .replace(/Source context capsule: .*/, `Source context capsule: ${path.join(parent, 'does-not-exist.json')}`);
      fs.writeFileSync(packetPath, text, 'utf8');

      const requirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === 'stage.feature.implementation')!;
      const result = evaluateContextReadiness({ requirement, stageId: requirement.stageId, runFolder, mode: 'feature' });
      expect(result.decision).toBe('refresh-required');
      expect(result.classification).toBe('source-reference-unreadable');
      fs.rmSync(parent, { recursive: true, force: true });
    });
  });
});
