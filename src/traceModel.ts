// ─── Trace prefix constants ───────────────────────────────────────────────────

export const TRACE_PREFIXES = [
  'REQ',
  'CTX',
  'BEH',
  'INV',
  'TRN',
  'PSE',
  'TST',
  'IMP',
  'VER',
  'RISK',
] as const;

export type TracePrefix = (typeof TRACE_PREFIXES)[number];

// Canonical trace ID format: PREFIX-NNN (3+ zero-padded digits)
export const TRACE_ID_RE = /^(REQ|CTX|BEH|INV|TRN|PSE|TST|IMP|VER|RISK)-(\d{3,})$/;

// ─── Validation functions ─────────────────────────────────────────────────────

export function isValidTracePrefix(prefix: string): prefix is TracePrefix {
  return (TRACE_PREFIXES as readonly string[]).includes(prefix);
}

export function isValidTraceId(id: string): boolean {
  return TRACE_ID_RE.test(id);
}

// Returns true if a token looks like a trace ID attempt but fails canonical validation.
// Matches tokens of shape PREFIX-digits or PREFIXdigits (2-6 uppercase letters + digits).
const MALFORMED_RE = /^[A-Z]{2,6}(-\d+|\d+)$/;

export function isMalformedTraceId(text: string): boolean {
  if (isValidTraceId(text)) return false;
  return MALFORMED_RE.test(text);
}
