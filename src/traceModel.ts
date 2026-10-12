// ─── Trace prefix constants ───────────────────────────────────────────────────

export const TRACE_PREFIXES = [
  'REQ',
  'CTX',
  'BEH',
  'INV',
  'TRN',
  'PSE',
  'TST',
  'RSP',
  'IMP',
  'VER',
  'RISK',
] as const;

export type TracePrefix = (typeof TRACE_PREFIXES)[number];

// Canonical trace ID format: PREFIX-NNN (3+ zero-padded digits)
// Derived from TRACE_PREFIXES so the vocabulary has a single source of truth.
export const TRACE_ID_RE = new RegExp(`^(${TRACE_PREFIXES.join('|')})-(\\d{3,})$`);

// ─── Validation functions ─────────────────────────────────────────────────────

export function isValidTracePrefix(prefix: string): prefix is TracePrefix {
  return (TRACE_PREFIXES as readonly string[]).includes(prefix);
}

export function isValidTraceId(id: string): boolean {
  return TRACE_ID_RE.test(id);
}

// Lexical policy. Only a recognized prefix is trace vocabulary: a token is a
// malformed trace ID when it uses a recognized prefix but fails the canonical
// PREFIX-NNN format (PREFIX-N, PREFIX-NN, PREFIXNNN). Other uppercase
// letter+digit tokens (ECO-00, UTF-8, SHA256) are ordinary technical
// identifiers; whether an unrecognized prefix is a trace-ID attempt depends on
// context (see isUnsupportedPrefixTraceId and traceParser.findMalformedTraceIds).
const MALFORMED_RE = new RegExp(`^(?:${TRACE_PREFIXES.join('|')})(?:-\\d+|\\d+)$`);

export function isMalformedTraceId(text: string): boolean {
  if (isValidTraceId(text)) return false;
  return MALFORMED_RE.test(text);
}

// Canonical shape (PREFIX-NNN, 3+ digits) with a prefix outside the trace
// vocabulary. Context-free this is not an error; it is a trace-ID attempt only
// where it is used as a declaration label or an explicit trace-link endpoint.
const UNSUPPORTED_PREFIX_RE = /^([A-Z]{2,6})-\d{3,}$/;

export function isUnsupportedPrefixTraceId(text: string): boolean {
  const match = UNSUPPORTED_PREFIX_RE.exec(text);
  return match !== null && !isValidTracePrefix(match[1]);
}
