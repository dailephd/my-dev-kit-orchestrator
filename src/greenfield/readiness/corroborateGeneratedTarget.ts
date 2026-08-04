// v1.3.0 Batch 4 (PSE-011..016, section 6.2/7.3): optional, secondary,
// read-only filesystem corroboration of a reported generated target.
// Bounded to the trusted run projectRoot; never follows symlinks, never
// reads file content, never writes, never executes anything, never
// traverses outside the root. Report evidence remains mandatory --
// this module only classifies whether an already-reported target is also
// corroborated on disk; it never substitutes for a missing report entry.
import * as fs from 'fs';
import * as path from 'path';

export type GeneratedTargetCorroborationStatus =
  | 'corroborated'
  | 'missing'
  | 'directory'
  | 'symlink'
  | 'unavailable';

export interface GeneratedTargetCorroborationResult {
  readonly status: GeneratedTargetCorroborationStatus;
}

/**
 * `normalizedRelativePath` must already be a lexically-safe, root-relative
 * path produced by targetPathSafety.ts (no absolute path, no `..`). This
 * function re-derives the resolved path and defensively re-confirms it did
 * not escape `projectRoot` before touching the filesystem.
 */
export function corroborateGeneratedTarget(
  projectRoot: string,
  normalizedRelativePath: string,
): GeneratedTargetCorroborationResult {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedTarget = path.resolve(resolvedRoot, normalizedRelativePath);

  const relativeFromRoot = path.relative(resolvedRoot, resolvedTarget);
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    // Defensive: normalizeTargetPath() should have already rejected any
    // input capable of producing this, so reaching here indicates the
    // trusted root itself is unavailable/unreliable rather than a bad path.
    return { status: 'unavailable' };
  }

  let lstatResult: fs.Stats;
  try {
    lstatResult = fs.lstatSync(resolvedTarget);
  } catch {
    return { status: 'missing' };
  }

  if (lstatResult.isSymbolicLink()) {
    return { status: 'symlink' };
  }
  if (lstatResult.isDirectory()) {
    return { status: 'directory' };
  }
  if (lstatResult.isFile()) {
    return { status: 'corroborated' };
  }
  return { status: 'unavailable' };
}
