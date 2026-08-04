// Cross-platform identity-path normalization and comparison (v1.2.2 Batch 2
// / F-006). Used to compare declared repository/index path identities
// (which may have been generated on a different platform than the one now
// evaluating readiness) without unsafely resolving the filesystem.
//
// Pure string normalization only -- never touches disk, never follows
// symlinks, never resolves ".." segments (a ".." segment may be meaningful
// if the real directory structure is unknown to us here, so it is left
// exactly as declared). Only structurally redundant, platform-cosmetic
// differences are treated as equivalent:
//   - backslash vs. forward-slash separators
//   - duplicate separators
//   - a redundant "./" segment
//   - a trailing separator
//   - Windows drive-letter case (C: vs c:) -- Windows treats these as the
//     same volume; the rest of the path is left case-sensitive since POSIX
//     paths (and most of Windows in practice) are case-sensitive.
// Different drive letters/volumes, different roots, and unrelated paths are
// never treated as equal.

function normalizeIdentityPath(input: string): string {
  let p = input.trim().replace(/\\/g, '/');
  p = p.replace(/\/{2,}/g, '/');
  while (p.includes('/./')) p = p.replace('/./', '/');
  if (p.startsWith('./')) p = p.slice(2);
  const isDriveRoot = /^[a-zA-Z]:\/$/.test(p);
  if (p.length > 1 && p.endsWith('/') && !isDriveRoot) {
    p = p.slice(0, -1);
  }
  const driveMatch = /^([a-zA-Z]):(\/.*|)$/.exec(p);
  if (driveMatch) {
    p = `${driveMatch[1].toLowerCase()}:${driveMatch[2]}`;
  }
  return p;
}

// Compares two possibly-undefined declared identity path strings. Two
// undefined/empty values are treated as "no comparison possible" (equal by
// vacuous truth -- callers must decide separately whether an absent value is
// acceptable for their context); one present and one absent are unequal.
export function identityPathsEqual(a: string | undefined, b: string | undefined): boolean {
  const an = nonEmpty(a);
  const bn = nonEmpty(b);
  if (an === undefined || bn === undefined) return an === bn;
  return normalizeIdentityPath(an) === normalizeIdentityPath(bn);
}

export function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export { normalizeIdentityPath };
