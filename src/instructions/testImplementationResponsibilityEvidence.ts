// v1.5.0 Batch 2 -- test implementation evidence bridge.
//
//   semantic responsibility (RSP-NNN, Batch 0)
//     -> explicit test-file declarations by the coding agent
//     -> bounded corroboration against my-dev-kit proposedOrExistingTestFiles
//
// The future persisted carrier is the existing TestImplementationReport;
// this module only defines the block contract, its structural validation, and
// a pure bridge evaluator. Nothing here is wired into prompts, artifact
// checks, RunIntegrityGate, JudgeIntegrity, status/check/export, or
// final-report eligibility.
//
// Canonical block:
//   test implementation responsibility ID: RSP-001
//   test file: tests/config/validate.spec.ts
// A block runs until the next "test implementation responsibility ID:" line
// or end of input. Repeated "test file:" fields are list entries. Each block
// needs at least one. Text before the first block is ignored.
//
// Granularity is FILE-LEVEL only. my-dev-kit 1.12.4 related-test discovery
// yields file-level "test-file" items, so no test-symbol contract exists.
//
// Corroboration semantics (IMPORTANT). "Corroborated" means only that the
// coding-agent-declared test-file identity appears EXACTLY (item path, or item
// id equal to the path) in the same-ID producer mapping's
// proposedOrExistingTestFiles. It does not mean my-dev-kit proved the test
// implements the RSP, that its assertions are correct, that it was executed,
// or that it passed; execution belongs to the VerificationReport. Producer
// mappingStatus is retained for context and never substituted for exact
// matching. Matching is exact: no basename, suffix, substring, or
// case-insensitive matching.
//
// Pure: no I/O, clock, Git, subprocess, my-dev-kit invocation, or mutation of
// caller input.

import { getWorkflow } from '../workflows';
import { isValidMode } from '../types';
import { RawEvidenceItemRef, RawEvidenceProjection } from './myDevKitEvidenceSummary';
import { EvidenceCorroborationState, normalizeProjectRelativePath } from './responsibilityEvidenceShared';
import { SEMANTIC_RESPONSIBILITY_ID_RE, SemanticResponsibility } from './semanticResponsibility';
import { TestResponsibilityCriticality } from './testResponsibilityCriticality';

export type TestImplementationStructuralIssueCode =
  | 'TEST_IMPLEMENTATION_RESPONSIBILITY_ID_MISSING'
  | 'TEST_IMPLEMENTATION_RESPONSIBILITY_ID_INVALID'
  | 'TEST_IMPLEMENTATION_RESPONSIBILITY_DUPLICATE'
  | 'TEST_IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_MISSING'
  | 'TEST_IMPLEMENTATION_RESPONSIBILITY_FILE_INVALID'
  | 'TEST_IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_DUPLICATE';

export type TestImplementationBridgeIssueCode =
  | 'TEST_IMPLEMENTATION_RESPONSIBILITY_ORPHAN'
  | 'TEST_IMPLEMENTATION_RESPONSIBILITY_DECLARATION_MISSING'
  | 'TEST_IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_MISSING'
  | 'TEST_IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_TRUNCATED'
  | 'TEST_IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_UNCORROBORATED';

export type TestImplementationIssueCode = TestImplementationStructuralIssueCode | TestImplementationBridgeIssueCode;

export interface TestImplementationIssue {
  code: TestImplementationIssueCode;
  message: string;
  blockIndex?: number;
  responsibilityId?: string;
  context?: string;
}

export interface TestImplementationResponsibilityDeclaration {
  responsibilityId: string;
  // Normalized, first-occurrence-deduplicated, in declaration order.
  testFiles: string[];
  blockIndex: number;
}

export interface TestImplementationValidationResult {
  declarations: TestImplementationResponsibilityDeclaration[];
  issues: TestImplementationIssue[];
  duplicateResponsibilityIds: string[];
}

const BLOCK_START_RE = /^test implementation responsibility id\s*:\s*(.*)$/i;
const FIELD_RE = /^([a-zA-Z][a-zA-Z0-9 ]*):\s*(.*)$/;

interface RawBlock {
  blockIndex: number;
  idRaw: string;
  fileValues: string[];
}

function splitBlocks(text: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  let current: RawBlock | undefined;
  for (const line of text.split(/\r\n|\n/)) {
    const trimmed = line.trim();
    const start = BLOCK_START_RE.exec(trimmed);
    if (start) {
      current = { blockIndex: blocks.length, idRaw: start[1].trim(), fileValues: [] };
      blocks.push(current);
      continue;
    }
    if (!current) continue; // prose before the first block is ignored
    const field = FIELD_RE.exec(trimmed);
    if (field && field[1].trim().toLowerCase() === 'test file') current.fileValues.push(field[2]);
  }
  return blocks;
}

export function validateTestImplementationResponsibilities(text: string): TestImplementationValidationResult {
  const declarations: TestImplementationResponsibilityDeclaration[] = [];
  const issues: TestImplementationIssue[] = [];
  const duplicateResponsibilityIds: string[] = [];
  const seen = new Set<string>();

  for (const block of splitBlocks(text)) {
    const { blockIndex, idRaw } = block;
    const idRef = idRaw.length > 0 ? { responsibilityId: idRaw } : {};

    if (idRaw.length === 0) {
      issues.push({
        code: 'TEST_IMPLEMENTATION_RESPONSIBILITY_ID_MISSING',
        message: `Test implementation block ${blockIndex} has an empty "test implementation responsibility ID:".`,
        blockIndex,
      });
    } else if (!SEMANTIC_RESPONSIBILITY_ID_RE.test(idRaw)) {
      issues.push({
        code: 'TEST_IMPLEMENTATION_RESPONSIBILITY_ID_INVALID',
        message: `Test implementation block ${blockIndex} ID "${idRaw}" is not a canonical RSP-NNN identity.`,
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
          code: 'TEST_IMPLEMENTATION_RESPONSIBILITY_DUPLICATE',
          message: `Duplicate test implementation responsibility ID: "${idRaw}".`,
          blockIndex,
          ...idRef,
        });
      } else {
        seen.add(idRaw);
      }
    }

    if (block.fileValues.length === 0) {
      issues.push({
        code: 'TEST_IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_MISSING',
        message: `Test implementation block ${blockIndex} declares no "test file:".`,
        blockIndex,
        ...idRef,
      });
    }

    const testFiles: string[] = [];
    for (const raw of block.fileValues) {
      const normalized = normalizeProjectRelativePath(raw);
      if (normalized === undefined) {
        issues.push({
          code: 'TEST_IMPLEMENTATION_RESPONSIBILITY_FILE_INVALID',
          message: `Test implementation block ${blockIndex} has an invalid test file: "${raw.trim()}".`,
          blockIndex,
          context: raw.trim(),
          ...idRef,
        });
      } else if (testFiles.includes(normalized)) {
        issues.push({
          code: 'TEST_IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_DUPLICATE',
          message: `Test implementation block ${blockIndex} repeats test file "${normalized}".`,
          blockIndex,
          context: normalized,
          ...idRef,
        });
      } else {
        testFiles.push(normalized);
      }
    }

    // First declaration of an ID is authoritative; duplicates are reported,
    // never merged.
    if (idRaw.length > 0 && !isDuplicate) {
      declarations.push({ responsibilityId: idRaw, testFiles, blockIndex });
    }
  }

  return { declarations, issues, duplicateResponsibilityIds };
}

// ─── Bridge evaluation ──────────────────────────────────────────────────────

export type TestImplementationEvidenceState = EvidenceCorroborationState;

export interface TestImplementationBridgeEntry {
  responsibilityId: string;
  criticality: TestResponsibilityCriticality | undefined;
  declaredTestFiles: string[];
  corroboratedTestFiles: string[];
  uncorroboratedTestFiles: string[];
  // Producer's whole-mapping status, retained for context only.
  producerMappingStatus?: string;
  state: TestImplementationEvidenceState;
}

export interface TestImplementationBridgeResult {
  responsibilities: TestImplementationBridgeEntry[];
  issues: TestImplementationIssue[];
}

export interface TestImplementationBridgeInput {
  semanticResponsibilities: readonly SemanticResponsibility[];
  declarations: readonly TestImplementationResponsibilityDeclaration[];
  evidence: Pick<RawEvidenceProjection, 'responsibilityMappings' | 'responsibilityMappingsTruncated'>;
}

function testFileMatches(items: readonly RawEvidenceItemRef[], file: string): boolean {
  return items.some((i) => i.path === file || i.id === file);
}

export function evaluateTestImplementationBridge(input: TestImplementationBridgeInput): TestImplementationBridgeResult {
  const issues: TestImplementationIssue[] = [];
  const responsibilities: TestImplementationBridgeEntry[] = [];

  const declarationById = new Map<string, TestImplementationResponsibilityDeclaration>();
  for (const d of input.declarations) {
    if (!declarationById.has(d.responsibilityId)) declarationById.set(d.responsibilityId, d);
  }
  const strategyIds = new Set(input.semanticResponsibilities.map((r) => r.responsibilityId));

  for (const strategy of input.semanticResponsibilities) {
    const id = strategy.responsibilityId;
    const declaration = declarationById.get(id);
    const declared = declaration ? [...declaration.testFiles] : [];
    const base = {
      responsibilityId: id,
      criticality: strategy.criticality,
      declaredTestFiles: declared,
      corroboratedTestFiles: [] as string[],
      uncorroboratedTestFiles: [] as string[],
    };

    if (!declaration) {
      issues.push({
        code: 'TEST_IMPLEMENTATION_RESPONSIBILITY_DECLARATION_MISSING',
        message: `Responsibility "${id}" has no test implementation declaration.`,
        responsibilityId: id,
        blockIndex: strategy.blockIndex,
      });
      responsibilities.push({ ...base, state: 'missing-declaration' });
      continue;
    }

    // Exact same-ID mapping selection. Necessary, not causal proof.
    const mapping = input.evidence.responsibilityMappings.find((m) => m.responsibilityId === id);
    if (!mapping) {
      const truncated = input.evidence.responsibilityMappingsTruncated;
      issues.push({
        code: truncated
          ? 'TEST_IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_TRUNCATED'
          : 'TEST_IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_MISSING',
        message: truncated
          ? `No producer mapping for "${id}"; producer responsibility mappings were truncated, so it may have been omitted.`
          : `No producer mapping for "${id}" in the test evidence.`,
        responsibilityId: id,
        blockIndex: declaration.blockIndex,
      });
      responsibilities.push({ ...base, uncorroboratedTestFiles: [...declared], state: 'producer-mapping-unavailable' });
      continue;
    }

    const items = mapping.proposedOrExistingTestFiles ?? [];
    for (const file of declaration.testFiles) {
      (testFileMatches(items, file) ? base.corroboratedTestFiles : base.uncorroboratedTestFiles).push(file);
    }
    const matched = base.corroboratedTestFiles.length;
    const unmatched = base.uncorroboratedTestFiles.length;
    const state: TestImplementationEvidenceState =
      unmatched === 0 && matched > 0 ? 'corroborated' : matched > 0 ? 'partially-corroborated' : 'uncorroborated';

    for (const file of base.uncorroboratedTestFiles) {
      issues.push({
        code: 'TEST_IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_UNCORROBORATED',
        message: `Declared test file "${file}" for "${id}" is not present in the same-ID producer test-file evidence.`,
        responsibilityId: id,
        blockIndex: declaration.blockIndex,
        context: file,
      });
    }
    responsibilities.push({ ...base, producerMappingStatus: mapping.mappingStatus, state });
  }

  for (const d of input.declarations) {
    if (!strategyIds.has(d.responsibilityId)) {
      issues.push({
        code: 'TEST_IMPLEMENTATION_RESPONSIBILITY_ORPHAN',
        message: `Test implementation responsibility "${d.responsibilityId}" is not declared by the strategy artifact.`,
        responsibilityId: d.responsibilityId,
        blockIndex: d.blockIndex,
      });
    }
  }

  return { responsibilities, issues };
}

// ─── Workflow applicability (informational; not wired into any gate) ────────

// Derived from workflow definitions: feature, repair, test, refactor, harden
// and extraction have a native "test-implementation" stage; greenfield does not.
export function workflowHasTestImplementationStage(mode: string): boolean {
  if (!isValidMode(mode)) return false;
  return getWorkflow(mode).stages.some((s) => s.name === 'test-implementation');
}
