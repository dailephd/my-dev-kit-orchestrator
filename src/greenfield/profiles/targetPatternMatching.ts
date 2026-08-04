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

// ─── Pattern-versus-pattern overlap (v1.3.0 Batch 3 correction) ─────────

interface DecomposedPattern {
  readonly before: readonly string[];
  readonly after: readonly string[];
  readonly hasDoubleStar: boolean;
}

function decomposePattern(pattern: string): DecomposedPattern {
  const segments = pattern.split('/');
  const doubleStarIndex = segments.indexOf('**');
  if (doubleStarIndex === -1) {
    return { before: segments, after: [], hasDoubleStar: false };
  }
  return {
    before: segments.slice(0, doubleStarIndex),
    after: segments.slice(doubleStarIndex + 1),
    hasDoubleStar: true,
  };
}

/** The set of total path lengths (segment counts) a pattern can produce, as an inclusive [min, max] range. */
function feasibleLengths(decomposed: DecomposedPattern): { readonly min: number; readonly max: number } {
  const fixedLength = decomposed.before.length + decomposed.after.length;
  if (!decomposed.hasDoubleStar) {
    return { min: fixedLength, max: fixedLength };
  }
  return { min: fixedLength, max: fixedLength + MAX_DOUBLE_STAR_SEGMENTS };
}

/** The literal/`*` constraint a pattern imposes at `position` for a candidate total length, or `null` when the position falls inside an unconstrained `**` span. */
function segmentConstraintAt(decomposed: DecomposedPattern, position: number, totalLength: number): string | null {
  if (position < decomposed.before.length) {
    return decomposed.before[position];
  }
  const afterStart = totalLength - decomposed.after.length;
  if (position >= afterStart) {
    return decomposed.after[position - afterStart];
  }
  return null; // consumed by '**'
}

function constraintsCompatible(a: string | null, b: string | null): boolean {
  if (a === null || b === null) {
    return true; // an unconstrained '**' position accepts whatever the other side requires.
  }
  if (a === '*' || b === '*') {
    return true; // '*' accepts any single nonempty segment, including a specific literal.
  }
  return a === b; // two literals must match exactly (PSE-004: case-sensitive).
}

/**
 * v1.3.0 Batch 3 correction: determines whether two syntactically valid,
 * normalized bounded patterns can both match at least one common complete
 * path (PSE-006/PSE-008). Callers must not pass identical normalized
 * patterns here -- that is duplicate classification (GF_TARGET_DUPLICATE),
 * not overlap.
 *
 * Algorithm: each pattern has at most one `**`, so it decomposes into a
 * fixed-length prefix, a fixed-length suffix, and (if `**` is present) an
 * unconstrained middle span of 0-8 segments. A shared total path length `L`
 * is a candidate only when both patterns can produce it -- each pattern's
 * feasible-length set is a single value (no `**`) or a 9-value inclusive
 * range `[fixed, fixed+8]` (`**` present), so the intersection is at most 9
 * candidate lengths. For each candidate `L`, position-by-position
 * compatibility (literal-vs-literal equality, `*`-vs-anything, or either
 * side unconstrained by `**`) is checked across the `L` positions; if any
 * candidate length has full-position compatibility, some real path could
 * satisfy both patterns' segment constraints simultaneously, so they
 * overlap. This exhaustively covers every length either pattern can
 * produce, is not recursive, and terminates after at most 9 * L bounded
 * comparisons -- complete for this grammar, since a pattern's only degrees
 * of freedom are `**`'s consumed-segment count and each non-`**` segment's
 * own local literal/`*` constraint.
 */
export function patternsOverlap(patternA: string, patternB: string): boolean {
  const decomposedA = decomposePattern(patternA);
  const decomposedB = decomposePattern(patternB);
  const feasibleA = feasibleLengths(decomposedA);
  const feasibleB = feasibleLengths(decomposedB);

  const minLength = Math.max(feasibleA.min, feasibleB.min);
  const maxLength = Math.min(feasibleA.max, feasibleB.max);

  for (let length = minLength; length <= maxLength; length += 1) {
    let allPositionsCompatible = true;
    for (let position = 0; position < length; position += 1) {
      const constraintA = segmentConstraintAt(decomposedA, position, length);
      const constraintB = segmentConstraintAt(decomposedB, position, length);
      if (!constraintsCompatible(constraintA, constraintB)) {
        allPositionsCompatible = false;
        break;
      }
    }
    if (allPositionsCompatible) {
      return true;
    }
  }

  return false;
}
