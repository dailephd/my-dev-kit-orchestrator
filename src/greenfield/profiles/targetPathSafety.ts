// v1.3.0 Batch 3: lexical-only target path normalization and safety
// checking (PseudocodePacket PSE-001..004). No filesystem access of any
// kind -- this module never reads, stats, or resolves against a real
// filesystem, current working directory, or host path separator behavior.
// Shared by the profile-local target-expectation validator
// (validateGreenfieldProfile.ts) and the scaffold-plan validator
// (validateGreenfieldScaffoldPlan.ts) so both apply identical rules.

export type PathSafetyFailureReason =
  | 'empty'
  | 'control-character'
  | 'absolute-posix'
  | 'absolute-drive'
  | 'unc'
  | 'uri-scheme'
  | 'traversal'
  | 'trailing-separator';

export interface PathNormalizationResult {
  readonly ok: boolean;
  /** Present only when `ok` is true. */
  readonly normalized?: string;
  /** Present only when `ok` is false. */
  readonly reason?: PathSafetyFailureReason;
}

function containsControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

const URI_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const DRIVE_QUALIFIED_RE = /^[a-zA-Z]:[\\/]/;
const UNC_RE = /^[\\/]{2}/;

/**
 * PSE-001..002: normalizes a raw target path for exact/pattern comparison,
 * or reports the exact reason it is unsafe/malformed. Does not resolve `..`
 * (rejects it outright per PSE-002) and does not touch the filesystem.
 */
export function normalizeTargetPath(rawValue: string): PathNormalizationResult {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (containsControlCharacter(rawValue)) {
    return { ok: false, reason: 'control-character' };
  }
  if (URI_SCHEME_RE.test(rawValue)) {
    return { ok: false, reason: 'uri-scheme' };
  }
  if (DRIVE_QUALIFIED_RE.test(rawValue)) {
    return { ok: false, reason: 'absolute-drive' };
  }
  if (UNC_RE.test(rawValue)) {
    return { ok: false, reason: 'unc' };
  }

  // PSE-001: convert `\` to `/`.
  const slashed = rawValue.replace(/\\/g, '/');

  // PSE-002: leading-slash absolute POSIX path.
  if (slashed.startsWith('/')) {
    return { ok: false, reason: 'absolute-posix' };
  }

  // PSE-001: collapse repeated separators.
  const collapsed = slashed.replace(/\/+/g, '/');

  // PSE-001: resolve lexical `.` segments; PSE-002: reject any remaining `..`.
  const segments = collapsed.split('/');
  const resolvedSegments: string[] = [];
  for (const segment of segments) {
    if (segment === '.') {
      continue;
    }
    if (segment === '..') {
      return { ok: false, reason: 'traversal' };
    }
    resolvedSegments.push(segment);
  }

  // PSE-002: reject a trailing separator for file evidence (trailing empty segment).
  if (resolvedSegments.length > 0 && resolvedSegments[resolvedSegments.length - 1] === '') {
    return { ok: false, reason: 'trailing-separator' };
  }

  const normalized = resolvedSegments.filter((segment) => segment.length > 0).join('/');
  if (normalized.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  return { ok: true, normalized };
}

/** PSE-002: absolute path failure reasons (drive/UNC/URI/leading-slash), grouped for issue-code mapping. */
export function isAbsolutePathFailure(reason: PathSafetyFailureReason): boolean {
  return reason === 'absolute-posix' || reason === 'absolute-drive' || reason === 'unc' || reason === 'uri-scheme';
}

/** PSE-004: case-sensitive normalized-path equality on every host. */
export function pathsAreEqual(normalizedA: string, normalizedB: string): boolean {
  return normalizedA === normalizedB;
}
