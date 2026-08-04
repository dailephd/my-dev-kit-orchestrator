// v1.2.2 Batch 3 (F-007): packet/report contradictions must keep the real
// stage prompt refresh-only, not just the lower-level evaluateContextReadiness
// result.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun } from '../src/run';
import { generateStagePrompt } from '../src/promptGenerator';
import { makeReadyRunFolder } from './readyContextTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-pair-recon-prompt-'));
}

describe('v1.2.2 Batch 3: supplemental pair contradiction keeps the real prompt refresh-only', () => {
  it('a packet/report freshness contradiction keeps the implementation prompt refresh-only', () => {
    const repoRoot = makeTempDir();
    try {
      const meta = createRun({ request: 'pair reconciliation test', mode: 'feature', projectRoot: repoRoot });
      makeReadyRunFolder(meta.runFolder, 'feature');
      const packetPath = path.join(meta.runFolder, 'artifacts', 'implementation-context-packet.txt');
      const reportPath = path.join(meta.runFolder, 'reports', 'implementation-context-retrieval-report.txt');
      fs.writeFileSync(packetPath, fs.readFileSync(packetPath, 'utf8').replace('Freshness: unknown', 'Freshness: fresh'), 'utf8');
      fs.writeFileSync(reportPath, fs.readFileSync(reportPath, 'utf8').replace('Freshness: unknown', 'Freshness: stale'), 'utf8');

      const prompt = generateStagePrompt(meta, 'implementation');
      expect(prompt).toContain('BLOCKED on repository context');
      expect(prompt).toContain('CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH');
      expect(prompt).not.toContain('Workflow instruction packet:');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('a packet/report freshness contradiction keeps the test-implementation prompt refresh-only', () => {
    const repoRoot = makeTempDir();
    try {
      const meta = createRun({ request: 'pair reconciliation test', mode: 'feature', projectRoot: repoRoot });
      makeReadyRunFolder(meta.runFolder, 'feature');
      const packetPath = path.join(meta.runFolder, 'artifacts', 'test-context-packet.txt');
      const reportPath = path.join(meta.runFolder, 'reports', 'test-context-retrieval-report.txt');
      fs.writeFileSync(packetPath, fs.readFileSync(packetPath, 'utf8').replace('Adequacy: unknown', 'Adequacy: sufficient'), 'utf8');
      fs.writeFileSync(reportPath, fs.readFileSync(reportPath, 'utf8').replace('Adequacy: unknown', 'Adequacy: insufficient'), 'utf8');

      const prompt = generateStagePrompt(meta, 'test-implementation');
      expect(prompt).toContain('BLOCKED on repository context');
      expect(prompt).not.toContain('Workflow instruction packet:');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('different declared capsule paths keep the implementation prompt refresh-only', () => {
    const repoRoot = makeTempDir();
    try {
      const meta = createRun({ request: 'pair reconciliation test', mode: 'feature', projectRoot: repoRoot });
      makeReadyRunFolder(meta.runFolder, 'feature');
      const decoyPath = path.join(meta.runFolder, 'decoy-capsule.json');
      fs.writeFileSync(decoyPath, fs.readFileSync(path.join(meta.runFolder, 'implementation-capsule.json'), 'utf8'), 'utf8');
      const reportPath = path.join(meta.runFolder, 'reports', 'implementation-context-retrieval-report.txt');
      fs.writeFileSync(reportPath, fs.readFileSync(reportPath, 'utf8').replace(/Source context capsule: .*/, `Source context capsule: ${decoyPath}`), 'utf8');

      const prompt = generateStagePrompt(meta, 'implementation');
      expect(prompt).toContain('BLOCKED on repository context');
      expect(prompt).toContain('CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('a matching (non-contradictory) pair renders the normal prompt', () => {
    const repoRoot = makeTempDir();
    try {
      const meta = createRun({ request: 'pair reconciliation test', mode: 'feature', projectRoot: repoRoot });
      makeReadyRunFolder(meta.runFolder, 'feature');
      const prompt = generateStagePrompt(meta, 'implementation');
      expect(prompt).toContain('Workflow instruction packet:');
      expect(prompt).not.toContain('BLOCKED on repository context');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('printing the prompt is read-only even when the pair contradicts', () => {
    const repoRoot = makeTempDir();
    try {
      const meta = createRun({ request: 'pair reconciliation test', mode: 'feature', projectRoot: repoRoot });
      makeReadyRunFolder(meta.runFolder, 'feature');
      const packetPath = path.join(meta.runFolder, 'artifacts', 'implementation-context-packet.txt');
      const reportPath = path.join(meta.runFolder, 'reports', 'implementation-context-retrieval-report.txt');
      fs.writeFileSync(packetPath, fs.readFileSync(packetPath, 'utf8').replace('Freshness: unknown', 'Freshness: fresh'), 'utf8');
      fs.writeFileSync(reportPath, fs.readFileSync(reportPath, 'utf8').replace('Freshness: unknown', 'Freshness: stale'), 'utf8');
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
