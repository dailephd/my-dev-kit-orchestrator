// v1.2.2 Batch 2 (F-006): end-to-end production-path tests proving the
// active run's real projectRoot (RunMetadata -> TaskState/StageContextBundle
// -> evaluateContextReadiness) is what repository-identity enforcement
// compares against, not a value invented in the test itself.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun } from '../src/run';
import { generateStagePrompt } from '../src/promptGenerator';
import { makeReadyRunFolder, fillRequiredSections } from './readyContextTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-identity-prompt-'));
}

function setDeclaredCapsuleProjectRoot(runFolder: string, projectRoot: string) {
  const capsulePath = path.join(runFolder, 'implementation-capsule.json');
  const auditPath = path.join(runFolder, 'implementation-audit.json');
  for (const p of [capsulePath, auditPath]) {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    data.index.projectRoot = projectRoot;
    fs.writeFileSync(p, JSON.stringify(data), 'utf8');
  }
}

describe('v1.2.2 Batch 2: repository identity enforcement through the real prompt-generation path', () => {
  it('evidence declaring the active run\'s real projectRoot renders the normal prompt', () => {
    const repoRoot = makeTempDir();
    try {
      const meta = createRun({ request: 'identity test', mode: 'feature', projectRoot: repoRoot });
      makeReadyRunFolder(meta.runFolder, 'feature');
      setDeclaredCapsuleProjectRoot(meta.runFolder, repoRoot);
      const prompt = generateStagePrompt(meta, 'implementation');
      expect(prompt).toContain('Workflow instruction packet:');
      expect(prompt).not.toContain('BLOCKED on repository context');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('evidence declaring an unrelated projectRoot keeps the implementation prompt refresh-only', () => {
    const repoRoot = makeTempDir();
    try {
      const meta = createRun({ request: 'identity test', mode: 'feature', projectRoot: repoRoot });
      makeReadyRunFolder(meta.runFolder, 'feature');
      setDeclaredCapsuleProjectRoot(meta.runFolder, path.join(os.tmpdir(), 'a-completely-different-repository'));
      const prompt = generateStagePrompt(meta, 'implementation');
      expect(prompt).toContain('BLOCKED on repository context');
      expect(prompt).toContain('repository-scope-mismatch');
      expect(prompt).not.toContain('Workflow instruction packet:');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('legacy raw evidence with no declared projectRoot at all still renders the normal prompt (old-run compatibility)', () => {
    const repoRoot = makeTempDir();
    try {
      const meta = createRun({ request: 'identity test', mode: 'feature', projectRoot: repoRoot });
      makeReadyRunFolder(meta.runFolder, 'feature');
      // Deliberately do not call setDeclaredCapsuleProjectRoot: the raw
      // evidence fixture from makeReadyRunFolder has no index.projectRoot at
      // all, matching pre-Batch-2 / older my-dev-kit raw evidence.
      expect(() => generateStagePrompt(meta, 'implementation')).not.toThrow();
      const prompt = generateStagePrompt(meta, 'implementation');
      expect(prompt).toContain('Workflow instruction packet:');
      expect(prompt).not.toContain('BLOCKED on repository context');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('printing the prompt performs no writes (read-only)', () => {
    const repoRoot = makeTempDir();
    try {
      const meta = createRun({ request: 'identity test', mode: 'feature', projectRoot: repoRoot });
      makeReadyRunFolder(meta.runFolder, 'feature');
      setDeclaredCapsuleProjectRoot(meta.runFolder, path.join(os.tmpdir(), 'unrelated'));
      const before = fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8');
      generateStagePrompt(meta, 'implementation');
      generateStagePrompt(meta, 'implementation');
      const after = fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8');
      expect(after).toBe(before);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});

describe('v1.2.2 Batch 2: declared index-identity contradiction through the real prompt path', () => {
  it('a bogus "Index identity" declared in the packet keeps the prompt refresh-only', () => {
    const repoRoot = makeTempDir();
    try {
      const meta = createRun({ request: 'identity test', mode: 'feature', projectRoot: repoRoot });
      makeReadyRunFolder(meta.runFolder, 'feature');
      const packetPath = path.join(meta.runFolder, 'artifacts', 'implementation-context-packet.txt');
      const text = fillRequiredSections(
        fs.readFileSync(packetPath, 'utf8').replace('Index identity: unknown', 'Index identity: /totally/unrelated/index'),
        'implementation-context-packet',
      );
      fs.writeFileSync(packetPath, text, 'utf8');
      const prompt = generateStagePrompt(meta, 'implementation');
      expect(prompt).toContain('BLOCKED on repository context');
      expect(prompt).toContain('index-identity-mismatch');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
