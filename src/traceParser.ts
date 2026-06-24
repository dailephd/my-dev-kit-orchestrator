import { isValidTraceId, isMalformedTraceId } from './traceModel';

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
const TRACE_ID_INLINE_RE =
  /(REQ|CTX|BEH|INV|TRN|PSE|TST|IMP|VER|RISK)-(\d{3,})/g;

// Matches link expressions: FROM -> TO (non-whitespace tokens around ->)
const TRACE_LINK_RE = /(\S+)\s*->\s*(\S+)/g;

// Matches tokens with the shape of a trace ID attempt: uppercase prefix + dash-digits or digits
const MALFORMED_INLINE_RE = /\b([A-Z]{2,6}(?:-\d+|\d+))\b/g;

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

export function findMalformedTraceIds(content: string): string[] {
  const all = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(MALFORMED_INLINE_RE.source, 'g');
  while ((match = re.exec(content)) !== null) {
    const token = match[1];
    if (isMalformedTraceId(token)) {
      all.add(token);
    }
  }
  return [...all];
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
