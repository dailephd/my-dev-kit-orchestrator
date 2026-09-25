// v1.5.0 Batch 2 -- verification responsibility attribution.
//
// The future persisted carrier is the existing VerificationReport. This module
// defines the block contract, structural validation, and a pure attribution
// evaluator. It is NOT wired into prompts, artifact checks, RunIntegrityGate,
// JudgeIntegrity, status/check/export, or final-report eligibility.
//
// Canonical block:
//   verification responsibility ID: RSP-001
//   verification status: pass            (pass | fail | skipped | blocked)
//   reason: <text>                       (required for skipped / blocked)
//
//   verification evidence:
//   command: npm test -- tests/config/validate.spec.ts
//   working directory: .
//   exit code: 0
//
// A "verification evidence:" line starts a command-result record inside the
// current block; a new "verification responsibility ID:" line starts a new
// block. Command/working directory/exit code lines outside a record, and
// unrelated prose, are ignored. Within one record or block a repeated field
// keeps its first value (no silent override).
//
// Evidence philosophy. Verification evidence is coding-agent-authored
// command-result evidence. This module validates structure and responsibility
// attribution only; it never executes a command and cannot prove one ran.
// Status is always the declared status: it is never inferred from exit codes
// (only flagged when clearly inconsistent), and command text is never
// interpreted as test/production coverage. Working directories are kept
// verbatim, including absolute ones, because they record where a command ran.
// Attribution is by exact RSP identity only.
//
// Pure: no I/O, clock, Git, subprocess, or mutation of caller input.

import { SEMANTIC_RESPONSIBILITY_ID_RE, SemanticResponsibility } from './semanticResponsibility';
import { TestResponsibilityCriticality } from './testResponsibilityCriticality';

export const VERIFICATION_STATUSES = ['pass', 'fail', 'skipped', 'blocked'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type VerificationStructuralIssueCode =
  | 'VERIFICATION_RESPONSIBILITY_ID_MISSING'
  | 'VERIFICATION_RESPONSIBILITY_ID_INVALID'
  | 'VERIFICATION_RESPONSIBILITY_DUPLICATE'
  | 'VERIFICATION_RESPONSIBILITY_STATUS_MISSING'
  | 'VERIFICATION_RESPONSIBILITY_STATUS_INVALID'
  | 'VERIFICATION_RESPONSIBILITY_EVIDENCE_MISSING'
  | 'VERIFICATION_RESPONSIBILITY_COMMAND_MISSING'
  // Missing, blank, or containing a NUL byte.
  | 'VERIFICATION_RESPONSIBILITY_WORKING_DIRECTORY_MISSING'
  | 'VERIFICATION_RESPONSIBILITY_EXIT_CODE_MISSING'
  | 'VERIFICATION_RESPONSIBILITY_EXIT_CODE_INVALID'
  | 'VERIFICATION_RESPONSIBILITY_REASON_MISSING'
  // Diagnostic only: never changes the declared status or run integrity.
  | 'VERIFICATION_RESPONSIBILITY_STATUS_EVIDENCE_INCONSISTENT';

export type VerificationAttributionIssueCode =
  | 'VERIFICATION_RESPONSIBILITY_ORPHAN'
  | 'VERIFICATION_RESPONSIBILITY_DECLARATION_MISSING';

export type VerificationIssueCode = VerificationStructuralIssueCode | VerificationAttributionIssueCode;

export interface VerificationIssue {
  code: VerificationIssueCode;
  message: string;
  blockIndex?: number;
  responsibilityId?: string;
  // Index of the evidence record within its block, where applicable.
  recordIndex?: number;
}

export interface VerificationCommandEvidence {
  command: string;
  workingDirectory: string;
  exitCode: number;
  recordIndex: number;
}

export interface VerificationResponsibilityDeclaration {
  responsibilityId: string;
  status: VerificationStatus;
  reason?: string;
  evidence: VerificationCommandEvidence[];
  blockIndex: number;
}

export interface VerificationValidationResult {
  declarations: VerificationResponsibilityDeclaration[];
  issues: VerificationIssue[];
  duplicateResponsibilityIds: string[];
}

const BLOCK_START_RE = /^verification responsibility id\s*:\s*(.*)$/i;
const RECORD_START_RE = /^verification evidence\s*:/i;
const FIELD_RE = /^([a-zA-Z][a-zA-Z0-9 ]*):\s*(.*)$/;
const EXIT_CODE_RE = /^[+-]?\d+$/;

interface RawRecord {
  command?: string;
  workingDirectory?: string;
  exitCode?: string;
}

interface RawBlock {
  blockIndex: number;
  idRaw: string;
  statusRaw?: string;
  reasonRaw?: string;
  records: RawRecord[];
}

function splitBlocks(text: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  let block: RawBlock | undefined;
  let record: RawRecord | undefined;
  for (const line of text.split(/\r\n|\n/)) {
    const trimmed = line.trim();
    const start = BLOCK_START_RE.exec(trimmed);
    if (start) {
      block = { blockIndex: blocks.length, idRaw: start[1].trim(), records: [] };
      blocks.push(block);
      record = undefined;
      continue;
    }
    if (!block) continue; // prose before the first block is ignored
    if (RECORD_START_RE.test(trimmed)) {
      record = {};
      block.records.push(record);
      continue;
    }
    const field = FIELD_RE.exec(trimmed);
    if (!field) continue;
    const key = field[1].trim().toLowerCase();
    const value = field[2].trim();
    if (key === 'verification status') {
      if (block.statusRaw === undefined) block.statusRaw = value;
    } else if (key === 'reason') {
      if (block.reasonRaw === undefined) block.reasonRaw = value;
    } else if (record) {
      if (key === 'command' && record.command === undefined) record.command = value;
      else if (key === 'working directory' && record.workingDirectory === undefined) record.workingDirectory = value;
      else if (key === 'exit code' && record.exitCode === undefined) record.exitCode = value;
    }
  }
  return blocks;
}

export function validateVerificationResponsibilities(text: string): VerificationValidationResult {
  const declarations: VerificationResponsibilityDeclaration[] = [];
  const issues: VerificationIssue[] = [];
  const duplicateResponsibilityIds: string[] = [];
  const seen = new Set<string>();

  for (const block of splitBlocks(text)) {
    const { blockIndex, idRaw } = block;
    const idRef = idRaw.length > 0 ? { responsibilityId: idRaw } : {};

    if (idRaw.length === 0) {
      issues.push({
        code: 'VERIFICATION_RESPONSIBILITY_ID_MISSING',
        message: `Verification block ${blockIndex} has an empty "verification responsibility ID:".`,
        blockIndex,
      });
    } else if (!SEMANTIC_RESPONSIBILITY_ID_RE.test(idRaw)) {
      issues.push({
        code: 'VERIFICATION_RESPONSIBILITY_ID_INVALID',
        message: `Verification block ${blockIndex} ID "${idRaw}" is not a canonical RSP-NNN identity.`,
        blockIndex,
        ...idRef,
      });
    }

    let isDuplicate = false;
    if (idRaw.length > 0) {
      if (seen.has(idRaw)) {
        isDuplicate = true;
        if (!duplicateResponsibilityIds.includes(idRaw)) duplicateResponsibilityIds.push(idRaw);
        issues.push({
          code: 'VERIFICATION_RESPONSIBILITY_DUPLICATE',
          message: `Duplicate verification responsibility ID: "${idRaw}".`,
          blockIndex,
          ...idRef,
        });
      } else {
        seen.add(idRaw);
      }
    }

    // Records: validate each; keep only fully valid ones as evidence.
    const evidence: VerificationCommandEvidence[] = [];
    block.records.forEach((rec, recordIndex) => {
      const at = { blockIndex, recordIndex, ...idRef };
      let ok = true;
      if (!rec.command) {
        ok = false;
        issues.push({
          code: 'VERIFICATION_RESPONSIBILITY_COMMAND_MISSING',
          message: `Verification evidence record ${recordIndex} in block ${blockIndex} has no "command:".`,
          ...at,
        });
      }
      if (!rec.workingDirectory || rec.workingDirectory.includes('\0')) {
        ok = false;
        issues.push({
          code: 'VERIFICATION_RESPONSIBILITY_WORKING_DIRECTORY_MISSING',
          message: `Verification evidence record ${recordIndex} in block ${blockIndex} has a missing or invalid "working directory:".`,
          ...at,
        });
      }
      let exitCode = 0;
      if (rec.exitCode === undefined || rec.exitCode.length === 0) {
        ok = false;
        issues.push({
          code: 'VERIFICATION_RESPONSIBILITY_EXIT_CODE_MISSING',
          message: `Verification evidence record ${recordIndex} in block ${blockIndex} has no "exit code:".`,
          ...at,
        });
      } else {
        const parsed = EXIT_CODE_RE.test(rec.exitCode) ? Number.parseInt(rec.exitCode, 10) : NaN;
        if (!Number.isSafeInteger(parsed)) {
          ok = false;
          issues.push({
            code: 'VERIFICATION_RESPONSIBILITY_EXIT_CODE_INVALID',
            message: `Verification evidence record ${recordIndex} in block ${blockIndex} has a non-integer exit code: "${rec.exitCode}".`,
            ...at,
          });
        } else {
          exitCode = parsed === 0 ? 0 : parsed; // normalize -0
        }
      }
      if (ok) {
        evidence.push({
          command: rec.command as string,
          workingDirectory: rec.workingDirectory as string,
          exitCode,
          recordIndex,
        });
      }
    });

    const statusRaw = block.statusRaw;
    let status: VerificationStatus | undefined;
    if (statusRaw === undefined || statusRaw.length === 0) {
      issues.push({
        code: 'VERIFICATION_RESPONSIBILITY_STATUS_MISSING',
        message: `Verification block ${blockIndex} has no "verification status:".`,
        blockIndex,
        ...idRef,
      });
    } else if (!(VERIFICATION_STATUSES as readonly string[]).includes(statusRaw)) {
      issues.push({
        code: 'VERIFICATION_RESPONSIBILITY_STATUS_INVALID',
        message: `Verification block ${blockIndex} has invalid status "${statusRaw}" (expected pass, fail, skipped, or blocked).`,
        blockIndex,
        ...idRef,
      });
    } else {
      status = statusRaw as VerificationStatus;
    }

    const reason = block.reasonRaw && block.reasonRaw.length > 0 ? block.reasonRaw : undefined;
    if (status === 'pass' || status === 'fail') {
      // Count declared records so a malformed record is not double-reported
      // as missing evidence.
      if (block.records.length === 0) {
        issues.push({
          code: 'VERIFICATION_RESPONSIBILITY_EVIDENCE_MISSING',
          message: `Verification block ${blockIndex} with status "${status}" declares no "verification evidence:" record.`,
          blockIndex,
          ...idRef,
        });
      } else if (evidence.length > 0) {
        const allNonzero = evidence.every((e) => e.exitCode !== 0);
        const allZero = evidence.every((e) => e.exitCode === 0);
        if ((status === 'pass' && allNonzero) || (status === 'fail' && allZero)) {
          issues.push({
            code: 'VERIFICATION_RESPONSIBILITY_STATUS_EVIDENCE_INCONSISTENT',
            message: `Verification block ${blockIndex} declares "${status}" but every recorded exit code is ${allZero ? 'zero' : 'nonzero'}.`,
            blockIndex,
            ...idRef,
          });
        }
      }
    } else if ((status === 'skipped' || status === 'blocked') && reason === undefined) {
      issues.push({
        code: 'VERIFICATION_RESPONSIBILITY_REASON_MISSING',
        message: `Verification block ${blockIndex} with status "${status}" has no "reason:".`,
        blockIndex,
        ...idRef,
      });
    }

    // First declaration of an ID is authoritative; duplicates are reported,
    // never merged. A declaration needs a usable ID and a valid status.
    if (idRaw.length > 0 && !isDuplicate && status !== undefined) {
      declarations.push({
        responsibilityId: idRaw,
        status,
        ...(reason !== undefined ? { reason } : {}),
        evidence,
        blockIndex,
      });
    }
  }

  return { declarations, issues, duplicateResponsibilityIds };
}

// ─── Attribution evaluation ─────────────────────────────────────────────────

export type VerificationEvaluationState = 'passed' | 'failed' | 'skipped' | 'blocked' | 'missing-declaration';

export interface VerificationAttributionEntry {
  responsibilityId: string;
  criticality: TestResponsibilityCriticality | undefined;
  status?: VerificationStatus;
  reason?: string;
  evidence: VerificationCommandEvidence[];
  state: VerificationEvaluationState;
}

export interface VerificationAttributionResult {
  responsibilities: VerificationAttributionEntry[];
  issues: VerificationIssue[];
}

const STATE_BY_STATUS: Record<VerificationStatus, VerificationEvaluationState> = {
  pass: 'passed',
  fail: 'failed',
  skipped: 'skipped',
  blocked: 'blocked',
};

export interface VerificationAttributionInput {
  semanticResponsibilities: readonly SemanticResponsibility[];
  declarations: readonly VerificationResponsibilityDeclaration[];
}

export function evaluateVerificationAttribution(input: VerificationAttributionInput): VerificationAttributionResult {
  const issues: VerificationIssue[] = [];
  const responsibilities: VerificationAttributionEntry[] = [];

  const declarationById = new Map<string, VerificationResponsibilityDeclaration>();
  for (const d of input.declarations) {
    if (!declarationById.has(d.responsibilityId)) declarationById.set(d.responsibilityId, d);
  }
  const strategyIds = new Set(input.semanticResponsibilities.map((r) => r.responsibilityId));

  for (const strategy of input.semanticResponsibilities) {
    const id = strategy.responsibilityId;
    const d = declarationById.get(id);
    if (!d) {
      issues.push({
        code: 'VERIFICATION_RESPONSIBILITY_DECLARATION_MISSING',
        message: `Responsibility "${id}" has no verification declaration.`,
        responsibilityId: id,
        blockIndex: strategy.blockIndex,
      });
      responsibilities.push({
        responsibilityId: id,
        criticality: strategy.criticality,
        evidence: [],
        state: 'missing-declaration',
      });
      continue;
    }
    responsibilities.push({
      responsibilityId: id,
      criticality: strategy.criticality,
      status: d.status,
      ...(d.reason !== undefined ? { reason: d.reason } : {}),
      evidence: d.evidence.map((e) => ({ ...e })),
      state: STATE_BY_STATUS[d.status],
    });
  }

  for (const d of input.declarations) {
    if (!strategyIds.has(d.responsibilityId)) {
      issues.push({
        code: 'VERIFICATION_RESPONSIBILITY_ORPHAN',
        message: `Verification responsibility "${d.responsibilityId}" is not declared by the strategy artifact.`,
        responsibilityId: d.responsibilityId,
        blockIndex: d.blockIndex,
      });
    }
  }

  return { responsibilities, issues };
}
