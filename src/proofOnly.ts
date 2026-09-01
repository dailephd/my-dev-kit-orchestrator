import * as fs from 'fs';
import * as path from 'path';

export type ProofEvidenceState = 'pass' | 'missing' | 'invalid';

export interface ProofEvidenceResult {
  state: ProofEvidenceState;
  responsibility: string;
  code?: string;
  reason?: string;
}

// The responsibility is deliberately run-relative.  It is persisted as
// supplied, but unsafe paths are rejected rather than normalized into a
// different meaning.
export function validateVerificationResponsibility(value: string | undefined): string | undefined {
  if (!value || value.trim().length === 0) return 'Verification responsibility must be a non-empty relative path.';
  if (value.includes('\0') || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    return 'Verification responsibility must be a safe relative path.';
  }
  const normalized = path.normalize(value);
  if (normalized === '.' || normalized === '' || normalized.startsWith(`..${path.sep}`) || normalized === '..') {
    return 'Verification responsibility must not escape the run folder.';
  }
  return undefined;
}

function safeProofPath(runFolder: string, responsibility: string): string | undefined {
  if (validateVerificationResponsibility(responsibility)) return undefined;
  const root = path.resolve(runFolder);
  const target = path.resolve(root, responsibility);
  return target.startsWith(root + path.sep) ? target : undefined;
}

export function evaluateProofEvidence(runFolder: string, responsibility: string | undefined): ProofEvidenceResult {
  if (!responsibility) {
    return { state: 'invalid', responsibility: '', code: 'PROOF_RESPONSIBILITY_MISSING', reason: 'Proof-only run has no verification responsibility.' };
  }
  const target = safeProofPath(runFolder, responsibility);
  if (!target) {
    return { state: 'invalid', responsibility, code: 'PROOF_RESPONSIBILITY_UNSAFE', reason: 'Verification responsibility is not a safe run-relative path.' };
  }
  if (!fs.existsSync(target)) {
    return { state: 'missing', responsibility, code: 'PROOF_EVIDENCE_MISSING', reason: 'Declared proof evidence file does not exist.' };
  }
  let text: string;
  try {
    text = fs.readFileSync(target, 'utf8');
  } catch {
    return { state: 'invalid', responsibility, code: 'PROOF_EVIDENCE_UNREADABLE', reason: 'Declared proof evidence file cannot be read.' };
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const pass = lines.filter((line) => line === 'Proof result: PASS').length;
  const fail = lines.filter((line) => line === 'Proof result: FAIL').length;
  if (pass === 1 && fail === 0) return { state: 'pass', responsibility };
  if (pass > 0 && fail > 0) {
    return { state: 'invalid', responsibility, code: 'PROOF_EVIDENCE_CONFLICT', reason: 'Declared proof evidence contains conflicting PASS and FAIL declarations.' };
  }
  return { state: 'invalid', responsibility, code: 'PROOF_RESULT_NOT_PASS', reason: 'Declared proof evidence must contain exactly one literal "Proof result: PASS" declaration.' };
}
