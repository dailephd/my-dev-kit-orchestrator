import * as fs from 'fs';
import * as path from 'path';
import { CheckSeverity } from './artifactChecker';
import { TRACE_PREFIXES, isValidTraceId } from './traceModel';
import { TraceId, TraceLink, parseTraceLinks, findMalformedTraceIds } from './traceParser';
import { RunMetadata } from './run';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TraceCheckIssue {
  code: string;
  severity: CheckSeverity;
  message: string;
  context?: string;
}

export interface TraceCheckResult {
  artifactFile: string;
  issues: TraceCheckIssue[];
  passed: boolean;
  checkedAt: string;
}

export interface TraceCheckResultsFile {
  version: '1';
  checkedAt: string;
  traceResults: TraceCheckResult[];
}

// ─── Declared ID parser ───────────────────────────────────────────────────────

// A declaration is the documented label form at the start of a line, e.g.
// "BEH-001: externally visible behavior". A valid ID mentioned in ordinary
// prose is a reference, not a declaration.
const TRACE_DECLARATION_RE = new RegExp(
  `^\\s*(?:[-*+]\\s+)?(${TRACE_PREFIXES.join('|')})-(\\d{3,})\\s*:`,
);

/**
 * Finds trace IDs declared in content, excluding IDs that only appear in link
 * expressions. This separates declared IDs from link-line references, fixing
 * the "missing link target" detection problem: a link target like BEH-999
 * that appears only in "REQ-001 -> BEH-999" is NOT counted as a declared ID,
 * so it can be flagged as missing. A link line never starts with the
 * "ID:" declaration label, so the declaration pattern alone separates them;
 * a declaration whose description contains "->" (for example the canonical
 * "TRN-001: invalid-input -> validation-error") is still a declaration.
 */
export function parseDeclaredTraceIds(content: string): TraceId[] {
  const results: TraceId[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = TRACE_DECLARATION_RE.exec(line);
    if (match) results.push({ id: `${match[1]}-${match[2]}`, prefix: match[1], num: match[2], line: i + 1 });
  }
  return results;
}

// ─── Single-artifact trace check ─────────────────────────────────────────────

/**
 * File-local trace check: link targets resolve only against declarations in
 * this one artifact. Run-aware resolution lives in checkAllTraces.
 */
export function checkArtifactTrace(
  runFolder: string,
  artifactFile: string,
): TraceCheckResult {
  const checkedAt = new Date().toISOString();
  const content = readArtifactContent(runFolder, artifactFile);
  if (content === null) {
    // Missing file is already reported by checkArtifact; skip trace check silently
    return { artifactFile, issues: [], passed: true, checkedAt };
  }
  return evaluateTraceContent(artifactFile, content, checkedAt);
}

function readArtifactContent(runFolder: string, artifactFile: string): string | null {
  const fullPath = path.join(runFolder, artifactFile);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf8');
}

// Shared evaluation. `upstreamKnownIds` carries declarations visible from other
// applicable artifacts (run-aware mode); it only widens link-target resolution.
// Duplicate and orphan diagnostics remain strictly file-local.
function evaluateTraceContent(
  artifactFile: string,
  content: string,
  checkedAt: string,
  upstreamKnownIds?: ReadonlySet<string>,
): TraceCheckResult {
  const issues: TraceCheckIssue[] = [];

  // Malformed IDs: recognized-prefix near misses, plus unsupported prefixes
  // used as an explicit declaration or link endpoint (shared parser policy).
  const malformed = findMalformedTraceIds(content);
  for (const token of malformed) {
    issues.push({
      code: 'TRACE_MALFORMED_ID',
      severity: 'fail',
      message: `Malformed trace ID token: "${token}" (not a valid trace ID format)`,
      context: token,
    });
  }

  // Declared IDs (non-link lines only)
  const declaredIds = parseDeclaredTraceIds(content);

  // Duplicate declared IDs
  const idCount = new Map<string, number>();
  for (const id of declaredIds) {
    idCount.set(id.id, (idCount.get(id.id) ?? 0) + 1);
  }
  for (const [id, count] of idCount.entries()) {
    if (count > 1) {
      issues.push({
        code: 'TRACE_DUPLICATE_ID',
        severity: 'warn',
        message: `Trace ID "${id}" is declared ${count} times`,
        context: id,
      });
    }
  }

  // Link expressions
  const links: TraceLink[] = parseTraceLinks(content);

  // Orphan declared IDs: declared but not in any link from/to
  if (links.length > 0 && declaredIds.length > 0) {
    const linked = new Set<string>();
    for (const link of links) {
      linked.add(link.from);
      linked.add(link.to);
    }
    const uniqueDeclared = [...new Set(declaredIds.map((id) => id.id))];
    for (const id of uniqueDeclared) {
      if (!linked.has(id)) {
        issues.push({
          code: 'TRACE_ORPHAN_ID',
          severity: 'warn',
          message: `Trace ID "${id}" is declared but not referenced in any link`,
          context: id,
        });
      }
    }
  }

  // Missing link targets: link.to is a valid trace ID but not a declared ID
  if (links.length > 0) {
    const knownIds = new Set(declaredIds.map((id) => id.id));
    if (upstreamKnownIds) {
      for (const id of upstreamKnownIds) knownIds.add(id);
    }
    const missing = new Set<string>();
    for (const link of links) {
      if (isValidTraceId(link.to) && !knownIds.has(link.to)) {
        missing.add(link.to);
      }
    }
    for (const target of missing) {
      issues.push({
        code: 'TRACE_MISSING_LINK_TARGET',
        severity: 'fail',
        message: `Link target "${target}" is a valid trace ID but is not declared in this artifact`,
        context: target,
      });
    }
  }

  const passed = !issues.some((i) => i.severity === 'fail');
  return { artifactFile, issues, passed, checkedAt };
}

// ─── All-artifacts trace check ────────────────────────────────────────────────

/**
 * Run-aware trace check. Link targets resolve against declarations in the
 * artifact itself, in other artifacts of the same native stage (primary plus
 * declared additional artifacts), and in artifacts of earlier stages in
 * RunMetadata order. Declarations in later stages are never visible, and a
 * missing artifact contributes nothing. Only declaration labels count; prose
 * mentions and link endpoints never make an ID known.
 */
export function checkAllTraces(meta: RunMetadata): TraceCheckResult[] {
  const contentCache = new Map<string, string | null>();
  const declaredCache = new Map<string, string[]>();

  const contentOf = (file: string): string | null => {
    if (!contentCache.has(file)) {
      contentCache.set(file, readArtifactContent(meta.runFolder, file));
    }
    return contentCache.get(file) ?? null;
  };
  const declaredOf = (file: string): string[] => {
    let ids = declaredCache.get(file);
    if (!ids) {
      const content = contentOf(file);
      ids = content === null ? [] : parseDeclaredTraceIds(content).map((d) => d.id);
      declaredCache.set(file, ids);
    }
    return ids;
  };

  const results: TraceCheckResult[] = [];
  const priorStageIds = new Set<string>();

  for (const stage of meta.stages) {
    const stageFiles = [stage.artifactFile, ...(stage.additionalArtifactFiles ?? [])];

    const visible = new Set<string>(priorStageIds);
    for (const file of stageFiles) {
      for (const id of declaredOf(file)) visible.add(id);
    }

    for (const file of stageFiles) {
      const checkedAt = new Date().toISOString();
      const content = contentOf(file);
      results.push(
        content === null
          ? { artifactFile: file, issues: [], passed: true, checkedAt }
          : evaluateTraceContent(file, content, checkedAt, visible),
      );
    }

    // Only after the stage is evaluated do its declarations become upstream.
    for (const file of stageFiles) {
      for (const id of declaredOf(file)) priorStageIds.add(id);
    }
  }
  return results;
}

// ─── Design-map specific check ────────────────────────────────────────────────

export function checkDesignMapTrace(runFolder: string): TraceCheckResult {
  return checkArtifactTrace(runFolder, 'artifacts/design-map.txt');
}

// ─── Trace-aware correction suggestions ──────────────────────────────────────

// Maps trace ID prefix to the workflow stage that owns IDs with that prefix
const PREFIX_TO_STAGE: Record<string, string> = {
  REQ: 'request-brief',
  CTX: 'architecture-context',
  BEH: 'behavior-model',
  INV: 'behavior-model',
  TRN: 'behavior-model',
  PSE: 'pseudocode-packet',
  TST: 'test-strategy',
  // Generic responsibility-declaration owner only; mode-specific routing is out of scope for v1.5 Batch 0.
  RSP: 'test-strategy',
  IMP: 'implementation',
  VER: 'verification',
  RISK: 'judge',
};

/**
 * Suggests a correction stage for a trace check issue.
 * Returns null when no meaningful suggestion can be made.
 * These suggestions are deterministic and do not infer semantics with an LLM.
 */
export function suggestCorrectionStageFromTraceIssue(
  issue: TraceCheckIssue,
): string | null {
  if (issue.code === 'TRACE_MISSING_LINK_TARGET' && issue.context) {
    // Extract prefix from a canonical trace ID like BEH-001
    const prefixMatch = /^([A-Z]+)-\d+$/.exec(issue.context);
    const prefix = prefixMatch ? prefixMatch[1] : null;
    if (prefix && PREFIX_TO_STAGE[prefix]) {
      return PREFIX_TO_STAGE[prefix];
    }
    return 'design-map';
  }

  if (issue.code === 'TRACE_MALFORMED_ID') {
    return 'design-map';
  }

  if (issue.code === 'TRACE_ORPHAN_ID') {
    return 'design-map';
  }

  return null;
}

/**
 * Returns deduplicated correction suggestions from a list of trace check results.
 * Each entry is "suggested stage: reason".
 */
export function buildTraceCorrectionSuggestions(
  results: TraceCheckResult[],
): string[] {
  const suggestions = new Map<string, Set<string>>();

  for (const result of results) {
    for (const issue of result.issues) {
      const stage = suggestCorrectionStageFromTraceIssue(issue);
      if (stage) {
        if (!suggestions.has(stage)) suggestions.set(stage, new Set());
        suggestions.get(stage)!.add(issue.code);
      }
    }
  }

  return [...suggestions.entries()].map(
    ([stage, codes]) => `Suggested correction stage: ${stage}  (${[...codes].join(', ')})`,
  );
}

// ─── Persistence ─────────────────────────────────────────────────────────────

export function getTraceCheckResultsPath(runFolder: string): string {
  return path.join(runFolder, 'trace-check-results.json');
}

export function readTraceCheckResults(runFolder: string): TraceCheckResultsFile | null {
  const p = getTraceCheckResultsPath(runFolder);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as TraceCheckResultsFile;
  } catch {
    return null;
  }
}

export function writeTraceCheckResults(
  runFolder: string,
  data: TraceCheckResultsFile,
): void {
  const p = getTraceCheckResultsPath(runFolder);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}
