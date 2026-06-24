import * as fs from 'fs';
import * as path from 'path';
import { CheckSeverity } from './artifactChecker';
import { isValidTraceId, isMalformedTraceId } from './traceModel';
import { TraceId, TraceLink, parseTraceLinks } from './traceParser';
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

// Inline regex for valid trace IDs
const TRACE_ID_INLINE_RE_SRC =
  '(REQ|CTX|BEH|INV|TRN|PSE|TST|IMP|VER|RISK)-(\\d{3,})';

// Malformed token pattern
const MALFORMED_TOKEN_RE = /\b([A-Z]{2,6}(?:-\d+|\d+))\b/g;

/**
 * Finds trace IDs declared in content, excluding IDs that only appear in link
 * expressions (lines containing "->"). This separates declared IDs from
 * link-line references, fixing the "missing link target" detection problem:
 * a link target like BEH-999 that appears only in "REQ-001 -> BEH-999" is
 * NOT counted as a declared ID, so it can be flagged as missing.
 */
export function parseDeclaredTraceIds(content: string): TraceId[] {
  const results: TraceId[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('->')) continue; // skip link lines
    let match: RegExpExecArray | null;
    const lineRe = new RegExp(TRACE_ID_INLINE_RE_SRC, 'g');
    while ((match = lineRe.exec(line)) !== null) {
      results.push({ id: match[0], prefix: match[1], num: match[2], line: i + 1 });
    }
  }
  return results;
}

function findMalformedInContent(content: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(MALFORMED_TOKEN_RE.source, 'g');
  while ((match = re.exec(content)) !== null) {
    const token = match[1];
    if (isMalformedTraceId(token)) found.add(token);
  }
  return [...found];
}

// ─── Single-artifact trace check ─────────────────────────────────────────────

export function checkArtifactTrace(
  runFolder: string,
  artifactFile: string,
): TraceCheckResult {
  const fullPath = path.join(runFolder, artifactFile);
  const checkedAt = new Date().toISOString();
  const issues: TraceCheckIssue[] = [];

  if (!fs.existsSync(fullPath)) {
    // Missing file is already reported by checkArtifact; skip trace check silently
    return { artifactFile, issues: [], passed: true, checkedAt };
  }

  const content = fs.readFileSync(fullPath, 'utf8');

  // Malformed IDs (tokens that look like trace IDs but are invalid format)
  const malformed = findMalformedInContent(content);
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

export function checkAllTraces(meta: RunMetadata): TraceCheckResult[] {
  const results: TraceCheckResult[] = [];
  for (const stage of meta.stages) {
    results.push(checkArtifactTrace(meta.runFolder, stage.artifactFile));
    for (const additional of stage.additionalArtifactFiles ?? []) {
      results.push(checkArtifactTrace(meta.runFolder, additional));
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
