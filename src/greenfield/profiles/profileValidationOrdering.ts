// Deterministic ordering and deduplication for ProfileValidationIssue lists,
// shared by validateGreenfieldProfile.ts and validateGreenfieldProfileRegistry.ts
// (and by later-batch validators extending the same issue system).
//
// Fixed phase order (PseudocodePacket PSE-021), only the Batch 1 phases are
// populated today; later batches add codes to PHASE_WEIGHT_BY_PREFIX for
// their own phases rather than re-deriving ordering elsewhere.
import { ProfileValidationIssue, ProfileValidationSeverity } from './profileValidationTypes';

// v1.3.0 Batch 3: GF_TARGET_ and GF_PLAN_ codes span two different PSE-021
// phases each (profile-local expectation shape vs. scaffold-plan
// conformance), so prefix matching alone can no longer distinguish them.
// Codes with a single unambiguous phase stay on PHASE_WEIGHT_BY_PREFIX;
// codes needing a specific phase are listed explicitly here and checked
// first.
const PHASE_WEIGHT_BY_CODE: ReadonlyMap<string, number> = new Map([
  // phase: target/command/doc contracts (profile-owned expectation shape)
  ['GF_TARGET_EXPECTATION_INVALID', 3],
  ['GF_TARGET_DUPLICATE', 3],
  ['GF_TARGET_OVERLAP', 3],
  // phase: plan identity
  ['GF_PLAN_PROFILE_MISMATCH', 5],
  // phase: paths/targets (scaffold-plan conformance)
  ['GF_TARGET_REQUIRED_MISSING', 6],
  ['GF_TARGET_UNSUPPORTED', 6],
  ['GF_TARGET_AMBIGUOUS', 6],
  ['GF_PATH_ABSOLUTE', 6],
  ['GF_PATH_TRAVERSAL', 6],
  ['GF_PATH_INVALID_PATTERN', 6],
  // phase: commands (scaffold-plan command conformance)
  ['GF_PLAN_COMMAND_MISSING', 7],
  ['GF_PLAN_CONTRADICTORY_CLAIM', 7],
  // phase: report evidence
  ['GF_SCAFFOLD_REPORT_MISSING', 8],
  ['GF_SCAFFOLD_REPORT_STALE', 8],
  ['GF_GENERATED_EVIDENCE_MISSING', 8],
  ['GF_GENERATED_EVIDENCE_CONFLICT', 8],
  // phase: first slice
  ['GF_FIRST_SLICE_MISSING', 9],
  ['GF_FIRST_SLICE_INCOMPLETE', 9],
  ['GF_FIRST_SLICE_BOILERPLATE', 9],
  ['GF_FIRST_SLICE_PROFILE_MISMATCH', 9],
  // phase: verification
  ['GF_COMMAND_EVIDENCE_MISSING', 10],
  ['GF_COMMAND_PASS_UNSUPPORTED', 10],
  ['GF_OPTIONAL_SKIP_REASON_MISSING', 10],
  // phase: lifecycle/compatibility
  ['GF_LEGACY_EVIDENCE_NOT_EVALUATED', 11],
]);

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
  const explicit = PHASE_WEIGHT_BY_CODE.get(code);
  if (explicit !== undefined) {
    return explicit;
  }
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
