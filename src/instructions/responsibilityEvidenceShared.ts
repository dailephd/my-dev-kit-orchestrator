// Shared, pure helpers for the v1.5 responsibility-evidence bridges
// (implementation, test implementation). Extracted from Batch 1 so the
// project-relative path policy and corroboration-state vocabulary have a
// single owner. Behavior is identical to the original Batch 1 definitions.

// Corroboration state vocabulary shared by the implementation and test
// bridges. Corroboration is exact repository-identity presence in bounded
// my-dev-kit evidence; it is never causal proof of responsibility ownership.
export type EvidenceCorroborationState =
  | 'corroborated'
  | 'partially-corroborated'
  | 'uncorroborated'
  | 'missing-declaration'
  | 'producer-mapping-unavailable';

// Returns the normalized project-relative path, or undefined when invalid.
// Purely lexical: never touches the filesystem. Separators become "/", case is
// preserved, and empty/"." segments are dropped. Rejected: empty, ".",
// absolute (POSIX/UNC), drive letter, URL scheme, NUL, and ".." segments.
export function normalizeProjectRelativePath(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.includes('\0')) return undefined;
  const slashed = trimmed.replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(slashed)) return undefined; // drive letter
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(slashed)) return undefined; // URL scheme
  if (slashed.startsWith('/')) return undefined; // POSIX absolute or UNC
  const segments = slashed.split('/').filter((s) => s.length > 0 && s !== '.');
  if (segments.length === 0) return undefined;
  if (segments.includes('..')) return undefined;
  return segments.join('/');
}
