// v1.5.0 Batch 1 -- implementation evidence bridge.
//
//   semantic responsibility (RSP-NNN, Batch 0)
//     -> explicit production file/symbol declarations by the coding agent
//     -> bounded corroboration against my-dev-kit implementation-role evidence
//
// The future persisted carrier is the existing ImplementationReport artifact;
// this module only defines the block contract, its structural validation, and
// a pure bridge evaluator. Nothing here is wired into prompts, artifact
// checks, RunIntegrityGate, JudgeIntegrity, status/check/export, or
// final-report eligibility.
//
// Canonical block:
//   implementation responsibility ID: RSP-001
//   production file: src/config/schema.ts
//   production symbol: symbol:src/config/validate.ts#validateConfig
// A block runs until the next "implementation responsibility ID:" line or end
// of input. Repeated "production file:" / "production symbol:" fields are
// list entries, not duplicate-field errors. Each block needs at least one
// production evidence declaration. Text before the first block is ignored.
//
// Corroboration semantics (IMPORTANT). "Corroborated" means only that the
// coding-agent-declared repository identity appears EXACTLY in the bounded
// my-dev-kit production-role evidence of the same-ID responsibility mapping.
// It does NOT mean my-dev-kit proved the file/symbol implements the RSP
// (my-dev-kit 1.12.4 productionSymbols are request-scoped and may be shared
// across every mapping in one request), and it does NOT prove the file
// changed (the producer may fall back to focus symbols, owners, or
// contracts). The RSP -> implementation relation stays an Orchestrator /
// coding-agent declaration. Producer mappingStatus is retained for context
// but never substituted for exact reference corroboration. Matching is exact:
// no fuzzy, basename, suffix, substring, or case-insensitive matching.
//
// Pure: no I/O, clock, Git, subprocess, my-dev-kit invocation, or mutation of
// caller input.

import { getWorkflow } from '../workflows';
import { isValidMode } from '../types';
import { RawEvidenceProjection, RawEvidenceItemRef } from './myDevKitEvidenceSummary';
import { SEMANTIC_RESPONSIBILITY_ID_RE, SemanticResponsibility } from './semanticResponsibility';
import { TestResponsibilityCriticality } from './testResponsibilityCriticality';

// ─── Structural contract ────────────────────────────────────────────────────

export type ImplementationResponsibilityStructuralIssueCode =
  | 'IMPLEMENTATION_RESPONSIBILITY_ID_MISSING'
  | 'IMPLEMENTATION_RESPONSIBILITY_ID_INVALID'
  | 'IMPLEMENTATION_RESPONSIBILITY_DUPLICATE'
  | 'IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_MISSING'
  | 'IMPLEMENTATION_RESPONSIBILITY_FILE_INVALID'
  | 'IMPLEMENTATION_RESPONSIBILITY_SYMBOL_INVALID'
  | 'IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_DUPLICATE';

export type ImplementationResponsibilityBridgeIssueCode =
  | 'IMPLEMENTATION_RESPONSIBILITY_ORPHAN'
  | 'IMPLEMENTATION_RESPONSIBILITY_DECLARATION_MISSING'
  | 'IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_MISSING'
  | 'IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_TRUNCATED'
  | 'IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_UNCORROBORATED';

export type ImplementationResponsibilityIssueCode =
  | ImplementationResponsibilityStructuralIssueCode
  | ImplementationResponsibilityBridgeIssueCode;

export interface ImplementationResponsibilityIssue {
  code: ImplementationResponsibilityIssueCode;
  message: string;
  blockIndex?: number;
  responsibilityId?: string;
  // Exact offending / unmatched reference where known.
  context?: string;
}

export interface ImplementationResponsibilityDeclaration {
  responsibilityId: string;
  // Normalized, first-occurrence-deduplicated, in declaration order.
  productionFiles: string[];
  productionSymbols: string[];
  blockIndex: number;
}

export interface ImplementationResponsibilityValidationResult {
  declarations: ImplementationResponsibilityDeclaration[];
  issues: ImplementationResponsibilityIssue[];
  duplicateResponsibilityIds: string[];
}

const BLOCK_START_RE = /^implementation responsibility id\s*:\s*(.*)$/i;
const FIELD_RE = /^([a-zA-Z][a-zA-Z0-9 ]*):\s*(.*)$/;

// Returns the normalized project-relative path, or undefined when invalid.
// Purely lexical: never touches the filesystem.
export function normalizeProductionFilePath(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.includes('\0')) return undefined;
  const slashed = trimmed.replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(slashed)) return undefined; // drive letter
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(slashed)) return undefined; // URL scheme
  if (slashed.startsWith('/')) return undefined; // POSIX absolute or UNC
  const segments = slashed.split('/').filter((s) => s.length > 0 && s !== '.');
  if (segments.length === 0) return undefined;
  if (segments.includes('..')) return undefined;
  return segments.join('/');
}

// Returns the normalized "symbol:<path>#<name>" identity, or undefined.
export function normalizeProductionSymbolId(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('symbol:')) return undefined;
  const parts = trimmed.slice('symbol:'.length).split('#');
  if (parts.length !== 2) return undefined;
  const name = parts[1].trim();
  if (name.length === 0 || name.includes('\0')) return undefined;
  const normalizedPath = normalizeProductionFilePath(parts[0]);
  if (normalizedPath === undefined) return undefined;
  return `symbol:${normalizedPath}#${name}`;
}

interface RawBlock {
  blockIndex: number;
  idRaw: string;
  fileValues: string[];
  symbolValues: string[];
}

function splitBlocks(text: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  let current: RawBlock | undefined;
  for (const line of text.split(/\r\n|\n/)) {
    const trimmed = line.trim();
    const start = BLOCK_START_RE.exec(trimmed);
    if (start) {
      current = { blockIndex: blocks.length, idRaw: start[1].trim(), fileValues: [], symbolValues: [] };
      blocks.push(current);
      continue;
    }
    if (!current) continue; // prose before the first block is ignored
    const field = FIELD_RE.exec(trimmed);
    if (!field) continue;
    const key = field[1].trim().toLowerCase();
    if (key === 'production file') current.fileValues.push(field[2]);
    else if (key === 'production symbol') current.symbolValues.push(field[2]);
  }
  return blocks;
}

export function validateImplementationResponsibilities(text: string): ImplementationResponsibilityValidationResult {
  const declarations: ImplementationResponsibilityDeclaration[] = [];
  const issues: ImplementationResponsibilityIssue[] = [];
  const duplicateResponsibilityIds: string[] = [];
  const seen = new Set<string>();

  for (const block of splitBlocks(text)) {
    const { blockIndex, idRaw } = block;
    const idRef = idRaw.length > 0 ? { responsibilityId: idRaw } : {};

    if (idRaw.length === 0) {
      issues.push({
        code: 'IMPLEMENTATION_RESPONSIBILITY_ID_MISSING',
        message: `Implementation responsibility block ${blockIndex} has an empty "implementation responsibility ID:".`,
        blockIndex,
      });
    } else if (!SEMANTIC_RESPONSIBILITY_ID_RE.test(idRaw)) {
      issues.push({
        code: 'IMPLEMENTATION_RESPONSIBILITY_ID_INVALID',
        message: `Implementation responsibility block ${blockIndex} ID "${idRaw}" is not a canonical RSP-NNN identity.`,
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
          code: 'IMPLEMENTATION_RESPONSIBILITY_DUPLICATE',
          message: `Duplicate implementation responsibility ID: "${idRaw}".`,
          blockIndex,
          ...idRef,
        });
      } else {
        seen.add(idRaw);
      }
    }

    if (block.fileValues.length + block.symbolValues.length === 0) {
      issues.push({
        code: 'IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_MISSING',
        message: `Implementation responsibility block ${blockIndex} declares no "production file:" or "production symbol:".`,
        blockIndex,
        ...idRef,
      });
    }

    const productionFiles: string[] = [];
    const productionSymbols: string[] = [];
    for (const raw of block.fileValues) {
      const normalized = normalizeProductionFilePath(raw);
      if (normalized === undefined) {
        issues.push({
          code: 'IMPLEMENTATION_RESPONSIBILITY_FILE_INVALID',
          message: `Implementation responsibility block ${blockIndex} has an invalid production file: "${raw.trim()}".`,
          blockIndex,
          context: raw.trim(),
          ...idRef,
        });
      } else if (productionFiles.includes(normalized)) {
        issues.push({
          code: 'IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_DUPLICATE',
          message: `Implementation responsibility block ${blockIndex} repeats production file "${normalized}".`,
          blockIndex,
          context: normalized,
          ...idRef,
        });
      } else {
        productionFiles.push(normalized);
      }
    }
    for (const raw of block.symbolValues) {
      const normalized = normalizeProductionSymbolId(raw);
      if (normalized === undefined) {
        issues.push({
          code: 'IMPLEMENTATION_RESPONSIBILITY_SYMBOL_INVALID',
          message: `Implementation responsibility block ${blockIndex} has an invalid production symbol: "${raw.trim()}".`,
          blockIndex,
          context: raw.trim(),
          ...idRef,
        });
      } else if (productionSymbols.includes(normalized)) {
        issues.push({
          code: 'IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_DUPLICATE',
          message: `Implementation responsibility block ${blockIndex} repeats production symbol "${normalized}".`,
          blockIndex,
          context: normalized,
          ...idRef,
        });
      } else {
        productionSymbols.push(normalized);
      }
    }

    // The first declaration of an ID is authoritative; a duplicate block is
    // reported but not added, so it cannot silently override or merge.
    if (idRaw.length > 0 && !isDuplicate) {
      declarations.push({ responsibilityId: idRaw, productionFiles, productionSymbols, blockIndex });
    }
  }

  return { declarations, issues, duplicateResponsibilityIds };
}

// ─── Bridge evaluation ──────────────────────────────────────────────────────

export type ImplementationEvidenceState =
  | 'corroborated'
  | 'partially-corroborated'
  | 'uncorroborated'
  | 'missing-declaration'
  | 'producer-mapping-unavailable';

export interface ImplementationEvidenceBridgeEntry {
  responsibilityId: string;
  criticality: TestResponsibilityCriticality | undefined;
  declaredProductionFiles: string[];
  declaredProductionSymbols: string[];
  corroboratedProductionFiles: string[];
  corroboratedProductionSymbols: string[];
  uncorroboratedProductionFiles: string[];
  uncorroboratedProductionSymbols: string[];
  // Producer's whole-mapping status, retained for context only.
  producerMappingStatus?: string;
  state: ImplementationEvidenceState;
}

export interface ImplementationEvidenceBridgeResult {
  responsibilities: ImplementationEvidenceBridgeEntry[];
  issues: ImplementationResponsibilityIssue[];
}

export interface ImplementationEvidenceBridgeInput {
  semanticResponsibilities: readonly SemanticResponsibility[];
  declarations: readonly ImplementationResponsibilityDeclaration[];
  evidence: Pick<RawEvidenceProjection, 'responsibilityMappings' | 'responsibilityMappingsTruncated'>;
}

function symbolMatches(items: readonly RawEvidenceItemRef[], symbolId: string): boolean {
  return items.some((i) => i.id === symbolId || i.symbolId === symbolId);
}

function fileMatches(items: readonly RawEvidenceItemRef[], file: string): boolean {
  return items.some((i) => i.path === file || i.id === file);
}

export function evaluateImplementationEvidenceBridge(
  input: ImplementationEvidenceBridgeInput,
): ImplementationEvidenceBridgeResult {
  const issues: ImplementationResponsibilityIssue[] = [];
  const responsibilities: ImplementationEvidenceBridgeEntry[] = [];

  const declarationById = new Map<string, ImplementationResponsibilityDeclaration>();
  for (const d of input.declarations) {
    if (!declarationById.has(d.responsibilityId)) declarationById.set(d.responsibilityId, d);
  }
  const strategyIds = new Set(input.semanticResponsibilities.map((r) => r.responsibilityId));

  for (const strategy of input.semanticResponsibilities) {
    const id = strategy.responsibilityId;
    const declaration = declarationById.get(id);
    const base = {
      responsibilityId: id,
      criticality: strategy.criticality,
      declaredProductionFiles: declaration ? [...declaration.productionFiles] : [],
      declaredProductionSymbols: declaration ? [...declaration.productionSymbols] : [],
      corroboratedProductionFiles: [] as string[],
      corroboratedProductionSymbols: [] as string[],
      uncorroboratedProductionFiles: [] as string[],
      uncorroboratedProductionSymbols: [] as string[],
    };

    if (!declaration) {
      issues.push({
        code: 'IMPLEMENTATION_RESPONSIBILITY_DECLARATION_MISSING',
        message: `Responsibility "${id}" has no implementation responsibility declaration.`,
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
          ? 'IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_TRUNCATED'
          : 'IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_MISSING',
        message: truncated
          ? `No producer mapping for "${id}"; producer responsibility mappings were truncated, so it may have been omitted.`
          : `No producer mapping for "${id}" in the implementation evidence.`,
        responsibilityId: id,
        blockIndex: declaration.blockIndex,
      });
      responsibilities.push({ ...base, uncorroboratedProductionFiles: [...base.declaredProductionFiles], uncorroboratedProductionSymbols: [...base.declaredProductionSymbols], state: 'producer-mapping-unavailable' });
      continue;
    }

    const items = mapping.productionSymbols ?? [];
    for (const file of declaration.productionFiles) {
      (fileMatches(items, file) ? base.corroboratedProductionFiles : base.uncorroboratedProductionFiles).push(file);
    }
    for (const symbol of declaration.productionSymbols) {
      (symbolMatches(items, symbol) ? base.corroboratedProductionSymbols : base.uncorroboratedProductionSymbols).push(symbol);
    }

    const matched = base.corroboratedProductionFiles.length + base.corroboratedProductionSymbols.length;
    const unmatched = base.uncorroboratedProductionFiles.length + base.uncorroboratedProductionSymbols.length;
    const state: ImplementationEvidenceState =
      unmatched === 0 && matched > 0 ? 'corroborated' : matched > 0 ? 'partially-corroborated' : 'uncorroborated';

    for (const ref of [...base.uncorroboratedProductionFiles, ...base.uncorroboratedProductionSymbols]) {
      issues.push({
        code: 'IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_UNCORROBORATED',
        message: `Declared implementation reference "${ref}" for "${id}" is not present in the same-ID producer production evidence.`,
        responsibilityId: id,
        blockIndex: declaration.blockIndex,
        context: ref,
      });
    }
    responsibilities.push({ ...base, producerMappingStatus: mapping.mappingStatus, state });
  }

  for (const d of input.declarations) {
    if (!strategyIds.has(d.responsibilityId)) {
      issues.push({
        code: 'IMPLEMENTATION_RESPONSIBILITY_ORPHAN',
        message: `Implementation responsibility "${d.responsibilityId}" is not declared by the strategy artifact.`,
        responsibilityId: d.responsibilityId,
        blockIndex: d.blockIndex,
      });
    }
  }

  return { responsibilities, issues };
}

// ─── Workflow applicability (informational; not wired into any gate) ────────

// A mode is applicable when its native workflow has the normal
// "implementation" stage. Derived from workflow definitions rather than a
// second mode registry: feature/repair/refactor/harden/extraction qualify;
// test (no production implementation stage) and greenfield
// (scaffold-implementation) do not.
export function workflowHasProductionImplementationStage(mode: string): boolean {
  if (!isValidMode(mode)) return false;
  return getWorkflow(mode).stages.some((s) => s.name === 'implementation');
}
