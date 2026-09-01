import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRun, loadRun } from '../src/run';
import { evaluateProofEvidence } from '../src/proofOnly';
import { initWorkspace } from '../src/workspace';
import { runCli } from './cliTestHelpers';

function temporaryRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-proof-only-'));
}

describe('explicit proof-only capability', () => {
  it('persists only explicit proof-only state across reload', () => {
    const root = temporaryRoot();
    try {
      const proof = createRun({ request: 'prove behavior', mode: 'feature', projectRoot: root, proofOnly: true, verificationResponsibility: 'artifacts/proof.txt' });
      const ordinary = createRun({ request: 'ordinary behavior', mode: 'feature', projectRoot: root });
      expect(loadRun(proof.runFolder)).toMatchObject({ proofOnly: true, verificationResponsibility: 'artifacts/proof.txt' });
      expect(loadRun(ordinary.runFolder).proofOnly).toBe(false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('accepts only one exact successful proof declaration', () => {
    const root = temporaryRoot();
    try {
      const file = path.join(root, 'proof.txt');
      fs.writeFileSync(file, 'Proof result: PASS\n', 'utf8');
      expect(evaluateProofEvidence(root, 'proof.txt').state).toBe('pass');
      fs.writeFileSync(file, 'proof result: pass\n', 'utf8');
      expect(evaluateProofEvidence(root, 'proof.txt').state).toBe('invalid');
      fs.writeFileSync(file, 'Proof result: PASS\nProof result: FAIL\n', 'utf8');
      expect(evaluateProofEvidence(root, 'proof.txt').code).toBe('PROOF_EVIDENCE_CONFLICT');
      fs.writeFileSync(file, 'Proof result: FAIL\n', 'utf8');
      expect(evaluateProofEvidence(root, 'proof.txt').state).toBe('invalid');
      fs.rmSync(file);
      expect(evaluateProofEvidence(root, 'proof.txt').state).toBe('missing');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('fails closed at the public CLI boundary for incomplete or unsafe declarations', () => {
    const root = temporaryRoot();
    try {
      initWorkspace(root);
      expect(runCli(['start', '--root', root, '--proof-only', 'proof']).exitCode).toBe(1);
      expect(runCli(['start', '--root', root, '--verification-responsibility', 'artifacts/proof.txt', 'proof']).exitCode).toBe(1);
      expect(runCli(['start', '--root', root, '--proof-only', '--verification-responsibility', '../proof.txt', 'proof']).exitCode).toBe(1);
      const valid = runCli(['start', '--root', root, '--proof-only', '--verification-responsibility', 'artifacts/proof.txt', 'proof']);
      expect(valid.exitCode).toBeUndefined();
      expect(valid.output).toContain('Proof-only: active');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
