// v1.3.0 Batch 3: exact and anchored-bounded-pattern target matching
// (PseudocodePacket PSE-005..006). No regular expressions, character
// classes, brace expansion, or shell glob interpretation are accepted from
// profile data; patterns are parsed and matched using an explicit,
// segment-by-segment algorithm only.

export type PatternSyntaxFailureReason =
  | 'absolute-marker'
  | 'traversal-token'
  | 'multiple-double-star'
  | 'invalid-syntax';

export interface PatternSyntaxValidationResult {
  readonly ok: boolean;
  readonly reason?: PatternSyntaxFailureReason;
}

const DISALLOWED_SEGMENT_CHARACTERS_RE = /[*?[\]{}()\\]/;

/**
 * PSE-006: validates a bounded pattern's static syntax. The pattern must
 * already be a root-relative value (callers normalize with
 * targetPathSafety.ts first for the shared absolute/traversal/control-
 * character checks); this additionally rejects pattern-only syntax
 * violations -- more than one `**`, partial-segment wildcards, and any
 * character outside plain literal segments, `*`, or `**`.
 */
export function validateBoundedPatternSyntax(pattern: string): PatternSyntaxValidationResult {
  if (pattern.startsWith('/')) {
    return { ok: false, reason: 'absolute-marker' };
  }

  const segments = pattern.split('/');
  let doubleStarCount = 0;

  for (const segment of segments) {
    if (segment.length === 0) {
      return { ok: false, reason: 'invalid-syntax' };
    }
    if (segment === '**') {
      doubleStarCount += 1;
      continue;
    }
    if (segment === '*') {
      continue;
    }
    if (segment === '.' || segment === '..') {
      return { ok: false, reason: 'traversal-token' };
    }
    if (DISALLOWED_SEGMENT_CHARACTERS_RE.test(segment)) {
      return { ok: false, reason: 'invalid-syntax' };
    }
  }

  if (doubleStarCount > 1) {
    return { ok: false, reason: 'multiple-double-star' };
  }

  return { ok: true };
}

const MAX_DOUBLE_STAR_SEGMENTS = 8;

/**
 * PSE-006: matches a normalized root-relative path against a syntactically
 * valid bounded pattern. Anchored to the complete path -- no partial or
 * substring matching. Assumes `validateBoundedPatternSyntax(pattern).ok`
 * and that `normalizedPath` was produced by targetPathSafety.ts.
 */
export function matchesBoundedPattern(normalizedPath: string, pattern: string): boolean {
  const pathSegments = normalizedPath.split('/');
  const patternSegments = pattern.split('/');
  const doubleStarIndex = patternSegments.indexOf('**');

  if (doubleStarIndex === -1) {
    if (pathSegments.length !== patternSegments.length) {
      return false;
    }
    return pathSegments.every((segment, index) => matchesSingleSegment(segment, patternSegments[index]));
  }

  const before = patternSegments.slice(0, doubleStarIndex);
  const after = patternSegments.slice(doubleStarIndex + 1);

  if (pathSegments.length < before.length + after.length) {
    return false;
  }

  const middleLength = pathSegments.length - before.length - after.length;
  if (middleLength < 0 || middleLength > MAX_DOUBLE_STAR_SEGMENTS) {
    return false;
  }

  const beforeMatches = before.every((segment, index) => matchesSingleSegment(pathSegments[index], segment));
  if (!beforeMatches) {
    return false;
  }

  const afterPathSegments = pathSegments.slice(pathSegments.length - after.length);
  return after.every((segment, index) => matchesSingleSegment(afterPathSegments[index], segment));
}

function matchesSingleSegment(pathSegment: string, patternSegment: string): boolean {
  if (patternSegment === '*') {
    return pathSegment.length > 0;
  }
  // PSE-004: case-sensitive literal comparison.
  return pathSegment === patternSegment;
}

/** PSE-005: exact matcher requires full normalized-string equality. */
export function matchesExact(normalizedPath: string, exactValue: string): boolean {
  return normalizedPath === exactValue;
}
