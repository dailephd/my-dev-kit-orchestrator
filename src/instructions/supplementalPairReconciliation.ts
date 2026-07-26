// Supplemental packet/retrieval-report pair reconciliation (v1.2.2 Batch 3
// / F-007).
//
// The packet and report are already parsed fully independently
// (supplementalContextParser.ts calls inspectSupplementalContextFile once
// per document; neither parse call ever sees the other document). The
// defect this module fixes lives one layer up: contextReadiness.ts used to
// combine the two independent SupplementalContextInspection values with
// `packetInspection.declaredX ?? reportInspection.declaredX` for several
// duplicated declarations. Because these fields are populated with a real
// (non-nullish) value as soon as either document is populated -- including
// the literal string "unknown" itself, which is a legal declared value, not
// an absence -- `??` almost always resolves to the packet's value on the
// first branch and never even inspects the report's value. A packet
// declaring "fresh" while the report declares "stale" was silently resolved
// to "fresh" with no comparison and no issue.
//
// reconcileDeclaredField never picks a side. It classifies the pair into
// one of five outcomes and leaves the blocking decision to the caller.

export type FieldReconciliationOutcome<T> =
  | { status: 'both-absent' }
  | { status: 'packet-only'; value: T }
  | { status: 'report-only'; value: T }
  | { status: 'agree'; value: T }
  | { status: 'disagree'; packetValue: T; reportValue: T };

export function reconcileDeclaredField<T>(
  packetValue: T | undefined,
  reportValue: T | undefined,
  equals: (a: T, b: T) => boolean = (a, b) => a === b,
): FieldReconciliationOutcome<T> {
  if (packetValue === undefined && reportValue === undefined) return { status: 'both-absent' };
  if (packetValue !== undefined && reportValue === undefined) return { status: 'packet-only', value: packetValue };
  if (packetValue === undefined && reportValue !== undefined) return { status: 'report-only', value: reportValue };
  if (equals(packetValue as T, reportValue as T)) return { status: 'agree', value: packetValue as T };
  return { status: 'disagree', packetValue: packetValue as T, reportValue: reportValue as T };
}

// Treats an absent value and the literal placeholder string "unknown" (the
// starter-template default for every enum/path metadata line -- see
// supplementalContextTemplates.ts) identically as "not yet declared". Used
// before reconciling any field where "unknown" is either the template
// default (freshness/adequacy/truncation/index paths) or, for path fields,
// the explicit "not filled in" sentinel. Comparison is case-insensitive and
// trims surrounding whitespace, matching the parser's own metadata-value
// handling.
export function nonUnknown(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === 'unknown') return undefined;
  return trimmed;
}
