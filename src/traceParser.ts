import {
  TRACE_PREFIXES,
  isValidTraceId,
  isMalformedTraceId,
  isUnsupportedPrefixTraceId,
} from './traceModel';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TraceId {
  id: string;
  prefix: string;
  num: string;
  line: number;
}

export interface TraceLink {
  from: string;
  to: string;
  line: number;
}

export interface ParsedTrace {
  ids: TraceId[];
  links: TraceLink[];
  malformed: string[];
  duplicateIds: string[];
  orphanIds: string[];
  missingLinkTargets: string[];
}

// ─── Inline patterns ──────────────────────────────────────────────────────────

// Matches valid trace IDs embedded in text content
const TRACE_ID_INLINE_RE = new RegExp(`(${TRACE_PREFIXES.join('|')})-(\\d{3,})`, 'g');

// Matches link expressions: FROM -> TO (non-whitespace tokens around ->)
const TRACE_LINK_RE = /(\S+)\s*->\s*(\S+)/g;

// Matches recognized-prefix tokens followed by dash-digits or digits; the
// canonical-format check is left to isMalformedTraceId.
const MALFORMED_INLINE_RE = new RegExp(`\\b((?:${TRACE_PREFIXES.join('|')})(?:-\\d+|\\d+))\\b`, 'g');

// An explicit declaration label at the start of a line ("FOO-001: ..."),
// mirroring traceChecker's TRACE_DECLARATION_RE but accepting any prefix.
const UNSUPPORTED_DECLARATION_RE = /^\s*(?:[-*+]\s+)?([A-Z]{2,6}-\d{3,})\s*:/;

// ─── Parsers ──────────────────────────────────────────────────────────────────

export function parseTraceIds(content: string): TraceId[] {
  const results: TraceId[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;
    const re = new RegExp(TRACE_ID_INLINE_RE.source, 'g');
    while ((match = re.exec(line)) !== null) {
      results.push({
        id: match[0],
        prefix: match[1],
        num: match[2],
        line: i + 1,
      });
    }
  }
  return results;
}

export function parseTraceLinks(content: string): TraceLink[] {
  const results: TraceLink[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;
    const re = new RegExp(TRACE_LINK_RE.source, 'g');
    while ((match = re.exec(line)) !== null) {
      results.push({ from: match[1], to: match[2], line: i + 1 });
    }
  }
  return results;
}

// Single classification policy for malformed trace-ID attempts (used by
// parseTrace and by traceChecker.checkArtifactTrace):
//   1. A recognized prefix with a non-canonical suffix (REQ-01, BEH1, RSP001)
//      is malformed wherever it appears.
//   2. A canonical-shaped token with an unsupported prefix (FOO-001) is
//      malformed only when used as a declaration label at the start of a line
//      ("FOO-001: ...") or as an endpoint of an explicit trace link in which
//      the other endpoint is a valid trace ID ("REQ-001 -> FOO-001").
//   3. Everything else (ECO-00, UTF-8, FOO-001 in prose) is ordinary content.
// Results are deduplicated and ordered by first occurrence.
export function findMalformedTraceIds(content: string): string[] {
  const all = new Set<string>();
  const lines = content.split('\n');
  for (const line of lines) {
    const found: Array<{ index: number; token: string }> = [];

    const inline = new RegExp(MALFORMED_INLINE_RE.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = inline.exec(line)) !== null) {
      if (isMalformedTraceId(match[1])) found.push({ index: match.index, token: match[1] });
    }

    const declaration = UNSUPPORTED_DECLARATION_RE.exec(line);
    if (declaration && isUnsupportedPrefixTraceId(declaration[1])) {
      found.push({ index: declaration.index + declaration[0].indexOf(declaration[1]), token: declaration[1] });
    }

    if (line.includes('->')) {
      for (const link of parseTraceLinks(line)) {
        const from = linkEndpointCore(link.from);
        const to = linkEndpointCore(link.to);
        if (isUnsupportedPrefixTraceId(to) && isValidTraceId(from)) {
          found.push({ index: line.indexOf(to), token: to });
        } else if (isUnsupportedPrefixTraceId(from) && isValidTraceId(to)) {
          found.push({ index: line.indexOf(from), token: from });
        }
      }
    }

    found.sort((a, b) => a.index - b.index);
    for (const item of found) all.add(item.token);
  }
  return [...all];
}

// Strips surrounding punctuation/markup (backticks, parentheses, commas, ...)
// from a link endpoint so "`FOO-001`," is classified as FOO-001.
function linkEndpointCore(token: string): string {
  return token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
}

export function findDuplicateIds(ids: TraceId[]): string[] {
  const count = new Map<string, number>();
  for (const id of ids) {
    count.set(id.id, (count.get(id.id) ?? 0) + 1);
  }
  const duplicates: string[] = [];
  for (const [id, n] of count.entries()) {
    if (n > 1) duplicates.push(id);
  }
  return duplicates;
}

export function findOrphanIds(ids: TraceId[], links: TraceLink[]): string[] {
  const linked = new Set<string>();
  for (const link of links) {
    linked.add(link.from);
    linked.add(link.to);
  }
  return ids.filter((id) => !linked.has(id.id)).map((id) => id.id);
}

export function findMissingLinkTargets(
  links: TraceLink[],
  ids: TraceId[],
): string[] {
  const known = new Set(ids.map((id) => id.id));
  const missing = new Set<string>();
  for (const link of links) {
    if (isValidTraceId(link.to) && !known.has(link.to)) {
      missing.add(link.to);
    }
  }
  return [...missing];
}

// ─── Composite parser ─────────────────────────────────────────────────────────

export function parseTrace(content: string): ParsedTrace {
  const ids = parseTraceIds(content);
  const links = parseTraceLinks(content);
  const malformed = findMalformedTraceIds(content);
  const duplicateIds = findDuplicateIds(ids);
  const orphanIds = findOrphanIds(ids, links);
  const missingLinkTargets = findMissingLinkTargets(links, ids);
  return { ids, links, malformed, duplicateIds, orphanIds, missingLinkTargets };
}
