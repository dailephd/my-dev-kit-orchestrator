// v1.5.0 Batch 0 -- canonical semantic responsibility contract (RSP-NNN).
//
// Identity ownership: my-dev-kit-orchestrator. Block parsing is NOT done here;
// this module consumes ParsedTestResponsibility from
// testResponsibilityCriticality.ts (the single block-parser owner) and layers
// the canonical v1.5 structural validation on top.
//
// Scope boundary (structural only). This validates identity syntax, required
// fields, criticality vocabulary, responsibility-statement presence,
// traces-to syntax, allowed upstream prefixes, and duplicate identities /
// trace references. It deliberately does NOT check that upstream trace IDs
// exist in the run, that requirements have responsibilities, that
// implementation/test/verification evidence exists, or that the prose follows
// from upstream prose. Those belong to later v1.5 batches. Nothing here is
// wired into RunIntegrityGate, JudgeIntegrity, status, check, export, prompts
// or final-report eligibility.
//
// Legacy responsibility IDs (any safe ID) remain valid for the legacy parser
// and readiness path; only this explicit canonical validator requires RSP-*.
//
// Pure: no I/O, clock, Git, subprocess, or caller-input mutation.

import { isValidTraceId } from '../traceModel';
import {
  ParsedTestResponsibility,
  TestResponsibilityCriticality,
  TestResponsibilityParseResult,
  parseTestResponsibilityBlocks,
} from './testResponsibilityCriticality';

export const SEMANTIC_RESPONSIBILITY_ID_RE = /^RSP-\d{3,}$/;

export const SEMANTIC_RESPONSIBILITY_UPSTREAM_PREFIXES = ['REQ', 'CTX', 'BEH', 'INV', 'TRN', 'PSE'] as const;

export type SemanticResponsibilityIssueCode =
  | 'SEMANTIC_RESPONSIBILITY_ID_MISSING'
  | 'SEMANTIC_RESPONSIBILITY_ID_INVALID'
  | 'SEMANTIC_RESPONSIBILITY_DUPLICATE'
  | 'SEMANTIC_RESPONSIBILITY_CRITICALITY_MISSING'
  | 'SEMANTIC_RESPONSIBILITY_CRITICALITY_INVALID'
  | 'SEMANTIC_RESPONSIBILITY_STATEMENT_MISSING'
  | 'SEMANTIC_RESPONSIBILITY_STATEMENT_BLANK'
  | 'SEMANTIC_RESPONSIBILITY_TRACES_MISSING'
  | 'SEMANTIC_RESPONSIBILITY_TRACE_INVALID'
  | 'SEMANTIC_RESPONSIBILITY_TRACE_PREFIX_INVALID'
  | 'SEMANTIC_RESPONSIBILITY_TRACE_DUPLICATE'
  | 'SEMANTIC_RESPONSIBILITY_FIELD_DUPLICATE'
  // Required body field (setup / action or trigger / expected result / test
  // level) absent or blank. Single shared code to avoid one code per field.
  | 'SEMANTIC_RESPONSIBILITY_FIELD_MISSING';

export interface SemanticResponsibilityIssue {
  code: SemanticResponsibilityIssueCode;
  message: string;
  blockIndex?: number;
  responsibilityId?: string;
}

export interface SemanticResponsibility {
  responsibilityId: string;
  criticality: TestResponsibilityCriticality | undefined;
  responsibility: string;
  upstreamTraceIds: string[];
  setup: string;
  actionOrTrigger: string;
  expectedResult: string;
  testLevel: string;
  blockIndex: number;
}

export interface SemanticResponsibilityValidationResult {
  responsibilities: SemanticResponsibility[];
  issues: SemanticResponsibilityIssue[];
  duplicateResponsibilityIds: string[];
}

const PLACEHOLDER_RE = /^(?:tbd|todo|n\/a|na|none|placeholder|\.{2,}|-+|<[^>]*>|\[[^\]]*\])$/i;
const BODY_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['setup', 'setup'],
  ['action or trigger', 'actionOrTrigger'],
  ['expected result', 'expectedResult'],
  ['test level', 'testLevel'],
];

function isBlankOrPlaceholder(value: string | undefined): boolean {
  const v = (value ?? '').trim();
  return v.length === 0 || PLACEHOLDER_RE.test(v);
}

export function validateSemanticResponsibilitiesFromParsed(
  parsed: TestResponsibilityParseResult,
): SemanticResponsibilityValidationResult {
  const issues: SemanticResponsibilityIssue[] = [];
  const responsibilities: SemanticResponsibility[] = [];

  // Block-level issues owned by the legacy parser that keep the same meaning.
  // Legacy ID_INVALID is intentionally not mapped: canonical ID syntax is
  // checked below against RSP-NNN.
  const legacyIssues = parsed.issues.filter((i) => i.code !== 'CONTEXT_TEST_RESPONSIBILITY_ID_INVALID');
  const mapLegacy: Record<string, SemanticResponsibilityIssueCode> = {
    CONTEXT_TEST_RESPONSIBILITY_ID_MISSING: 'SEMANTIC_RESPONSIBILITY_ID_MISSING',
    CONTEXT_TEST_RESPONSIBILITY_DUPLICATE: 'SEMANTIC_RESPONSIBILITY_DUPLICATE',
    CONTEXT_TEST_RESPONSIBILITY_CRITICALITY_MISSING: 'SEMANTIC_RESPONSIBILITY_CRITICALITY_MISSING',
    CONTEXT_TEST_RESPONSIBILITY_CRITICALITY_INVALID: 'SEMANTIC_RESPONSIBILITY_CRITICALITY_INVALID',
  };

  const perBlock = new Map<number, SemanticResponsibilityIssue[]>();
  const push = (blockIndex: number, issue: SemanticResponsibilityIssue): void => {
    const list = perBlock.get(blockIndex) ?? [];
    list.push(issue);
    perBlock.set(blockIndex, list);
  };

  for (const li of legacyIssues) {
    push(li.blockIndex, {
      code: mapLegacy[li.code],
      message: li.message,
      blockIndex: li.blockIndex,
      ...(li.responsibilityId !== undefined ? { responsibilityId: li.responsibilityId } : {}),
    });
  }

  for (const r of parsed.responsibilities) {
    const id = r.responsibilityId;
    const at = { blockIndex: r.blockIndex, responsibilityId: id };
    const fv = r.fieldValues;

    if (!SEMANTIC_RESPONSIBILITY_ID_RE.test(id)) {
      push(r.blockIndex, {
        code: 'SEMANTIC_RESPONSIBILITY_ID_INVALID',
        message: `Responsibility block ${r.blockIndex} ID "${id}" is not a canonical RSP-NNN identity.`,
        ...at,
      });
    }

    for (const field of r.duplicateFields) {
      push(r.blockIndex, {
        code: 'SEMANTIC_RESPONSIBILITY_FIELD_DUPLICATE',
        message: `Responsibility "${id}" declares "${field}:" more than once.`,
        ...at,
      });
    }

    if (!('responsibility' in fv)) {
      push(r.blockIndex, {
        code: 'SEMANTIC_RESPONSIBILITY_STATEMENT_MISSING',
        message: `Responsibility "${id}" is missing "responsibility:".`,
        ...at,
      });
    } else if (isBlankOrPlaceholder(fv['responsibility'])) {
      push(r.blockIndex, {
        code: 'SEMANTIC_RESPONSIBILITY_STATEMENT_BLANK',
        message: `Responsibility "${id}" has a blank or placeholder "responsibility:" statement.`,
        ...at,
      });
    }

    for (const [field] of BODY_FIELDS) {
      if (isBlankOrPlaceholder(fv[field])) {
        push(r.blockIndex, {
          code: 'SEMANTIC_RESPONSIBILITY_FIELD_MISSING',
          message: `Responsibility "${id}" is missing or has a blank "${field}:".`,
          ...at,
        });
      }
    }

    const upstreamTraceIds = validateTraces(r, push);
    responsibilities.push(toSemantic(r, upstreamTraceIds));
  }

  // Deterministic ordering: by block index, then insertion order within block.
  for (const blockIndex of [...perBlock.keys()].sort((a, b) => a - b)) {
    issues.push(...(perBlock.get(blockIndex) as SemanticResponsibilityIssue[]));
  }

  return {
    responsibilities,
    issues,
    duplicateResponsibilityIds: [...parsed.duplicateResponsibilityIds],
  };
}

function validateTraces(
  r: ParsedTestResponsibility,
  push: (blockIndex: number, issue: SemanticResponsibilityIssue) => void,
): string[] {
  const id = r.responsibilityId;
  const at = { blockIndex: r.blockIndex, responsibilityId: id };
  const raw = r.fieldValues['traces to'];
  if (raw === undefined || raw.trim().length === 0) {
    push(r.blockIndex, {
      code: 'SEMANTIC_RESPONSIBILITY_TRACES_MISSING',
      message: `Responsibility "${id}" is missing or has a blank "traces to:".`,
      ...at,
    });
    return [];
  }

  const accepted: string[] = [];
  const seen = new Set<string>();
  for (const token of raw.split(',').map((t) => t.trim())) {
    if (!isValidTraceId(token)) {
      push(r.blockIndex, {
        code: 'SEMANTIC_RESPONSIBILITY_TRACE_INVALID',
        message: `Responsibility "${id}" has a malformed trace reference: "${token}".`,
        ...at,
      });
      continue;
    }
    if (seen.has(token)) {
      push(r.blockIndex, {
        code: 'SEMANTIC_RESPONSIBILITY_TRACE_DUPLICATE',
        message: `Responsibility "${id}" repeats trace reference "${token}".`,
        ...at,
      });
      continue;
    }
    seen.add(token);
    const prefix = token.split('-')[0];
    if (!(SEMANTIC_RESPONSIBILITY_UPSTREAM_PREFIXES as readonly string[]).includes(prefix)) {
      push(r.blockIndex, {
        code: 'SEMANTIC_RESPONSIBILITY_TRACE_PREFIX_INVALID',
        message: `Responsibility "${id}" traces to "${token}", but only ${SEMANTIC_RESPONSIBILITY_UPSTREAM_PREFIXES.join(', ')} are allowed upstream origins.`,
        ...at,
      });
      continue;
    }
    accepted.push(token);
  }
  return accepted;
}

function toSemantic(r: ParsedTestResponsibility, upstreamTraceIds: string[]): SemanticResponsibility {
  const fv = r.fieldValues;
  return {
    responsibilityId: r.responsibilityId,
    criticality: r.criticality,
    responsibility: fv['responsibility'] ?? '',
    upstreamTraceIds,
    setup: fv['setup'] ?? '',
    actionOrTrigger: fv['action or trigger'] ?? '',
    expectedResult: fv['expected result'] ?? '',
    testLevel: fv['test level'] ?? '',
    blockIndex: r.blockIndex,
  };
}

export function validateSemanticResponsibilities(text: string): SemanticResponsibilityValidationResult {
  return validateSemanticResponsibilitiesFromParsed(parseTestResponsibilityBlocks(text));
}
