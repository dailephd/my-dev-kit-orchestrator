// Canonical generated-project target composition for greenfield scaffolds.
//
// Pure and deterministic: this module only composes existing in-memory
// contracts. It does not write project files, inspect the filesystem, execute
// commands, or add the coding-agent files to the public-document registry.

import { GREENFIELD_PROJECT_INSTRUCTION_PATHS } from '../bootstrap/projectInstructions/projectInstructionTypes';
import type { GreenfieldFullstackCapability } from '../fullstack/fullstackCapabilityTypes';
import type { GreenfieldProfile, GreenfieldTargetExpectation } from '../profiles/profileTypes';
import { normalizeTargetPath } from '../profiles/targetPathSafety';

const COMMON_TARGET_IDS = [
  'common-agents-instructions',
  'common-claude-instructions',
  'common-coding-agents-adapter',
  'common-claude-code-adapter',
] as const;

/**
 * Common generated-project targets required for every selected greenfield
 * starter profile. Their paths come from the Batch 1 instruction bundle
 * contract rather than being independently repeated here.
 */
export const COMMON_GREENFIELD_TARGET_EXPECTATIONS: readonly GreenfieldTargetExpectation[] =
  GREENFIELD_PROJECT_INSTRUCTION_PATHS.map((path, index) => ({
    id: COMMON_TARGET_IDS[index],
    category: 'coding-agent-instructions',
    matcher: { kind: 'exact', value: path },
    required: true,
    purpose: 'Provide deterministic project-local operating instructions for compatible coding agents.',
    evidenceKind: 'file',
  }));

/**
 * Returns the one effective target contract consumed by scaffold planning,
 * scaffold validation, and generated-file readiness. Precedence and ordering
 * are stable: common, selected profile, then optional capability.
 */
export function composeEffectiveGreenfieldTargetExpectations(
  profile: GreenfieldProfile,
  capability?: GreenfieldFullstackCapability,
): readonly GreenfieldTargetExpectation[] {
  const candidates = [
    ...COMMON_GREENFIELD_TARGET_EXPECTATIONS,
    ...profile.targetExpectations,
    ...(capability?.targetExpectations ?? []),
  ];
  const identities = new Set<string>();

  return candidates.filter((expectation) => {
    const identity = targetExpectationIdentity(expectation);
    if (identities.has(identity)) {
      return false;
    }
    identities.add(identity);
    return true;
  });
}

/** Extracts concrete plan paths without interpreting bounded patterns as files. */
export function exactGreenfieldTargetPaths(
  expectations: readonly GreenfieldTargetExpectation[],
): string[] {
  return expectations
    .filter((expectation) => expectation.matcher.kind === 'exact')
    .map((expectation) => expectation.matcher.value);
}

function targetExpectationIdentity(expectation: GreenfieldTargetExpectation): string {
  if (expectation.matcher.kind === 'bounded-pattern') {
    return `${expectation.matcher.kind}:${expectation.matcher.value}`;
  }

  const normalized = normalizeTargetPath(expectation.matcher.value);
  return `${expectation.matcher.kind}:${normalized.ok ? normalized.normalized : expectation.matcher.value}`;
}
