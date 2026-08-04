// Deterministic ordering and deduplication for ProfileValidationIssue lists,
// shared by validateGreenfieldProfile.ts and validateGreenfieldProfileRegistry.ts
// (and by later-batch validators extending the same issue system).
//
// Fixed phase order (PseudocodePacket PSE-021), only the Batch 1 phases are
// populated today; later batches add codes to PHASE_WEIGHT_BY_PREFIX for
// their own phases rather than re-deriving ordering elsewhere.
import { ProfileValidationIssue, ProfileValidationSeverity } from './profileValidationTypes';

const PHASE_WEIGHT_BY_PREFIX: ReadonlyArray<{ prefix: string; weight: number }> = [
  // phase: profile-local fields
  { prefix: 'GF_PROFILE_', weight: 2 },
  // phase: target/command/doc contracts
  { prefix: 'GF_COMMAND_', weight: 3 },
  { prefix: 'GF_DOC_', weight: 3 },
  // phase: registry identity/aliases
  { prefix: 'GF_REGISTRY_', weight: 4 },
  { prefix: 'GF_ALIAS_', weight: 4 },
];

const UNKNOWN_PHASE_WEIGHT = Number.MAX_SAFE_INTEGER;

function phaseWeight(code: string): number {
  const match = PHASE_WEIGHT_BY_PREFIX.find((entry) => code.startsWith(entry.prefix));
  return match ? match.weight : UNKNOWN_PHASE_WEIGHT;
}

function severityWeight(severity: ProfileValidationSeverity): number {
  return severity === 'error' ? 0 : 1;
}

/** PSE-022: phase, then severity, profileId, affectedContract, code, evidenceKey. */
export function sortProfileValidationIssues(
  issues: readonly ProfileValidationIssue[],
): ProfileValidationIssue[] {
  return [...issues].sort((a, b) => {
    const phaseDiff = phaseWeight(a.code) - phaseWeight(b.code);
    if (phaseDiff !== 0) return phaseDiff;

    const severityDiff = severityWeight(a.severity) - severityWeight(b.severity);
    if (severityDiff !== 0) return severityDiff;

    const profileDiff = a.profileId.localeCompare(b.profileId);
    if (profileDiff !== 0) return profileDiff;

    const contractDiff = a.affectedContract.localeCompare(b.affectedContract);
    if (contractDiff !== 0) return contractDiff;

    const codeDiff = a.code.localeCompare(b.code);
    if (codeDiff !== 0) return codeDiff;

    return (a.evidenceKey ?? '').localeCompare(b.evidenceKey ?? '');
  });
}

/** PSE-023: dedupe only exact code/profile/contract/evidenceKey matches. */
export function dedupeProfileValidationIssues(
  issues: readonly ProfileValidationIssue[],
): ProfileValidationIssue[] {
  const seen = new Set<string>();
  const result: ProfileValidationIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.code}|${issue.profileId}|${issue.affectedContract}|${issue.evidenceKey ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(issue);
    }
  }
  return result;
}

export function finalizeProfileValidationResult(issues: readonly ProfileValidationIssue[]): {
  valid: boolean;
  issues: readonly ProfileValidationIssue[];
} {
  const ordered = sortProfileValidationIssues(dedupeProfileValidationIssues(issues));
  return Object.freeze({
    valid: !ordered.some((issue) => issue.severity === 'error'),
    issues: Object.freeze(ordered),
  });
}
