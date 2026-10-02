// Pre-test entry policy for the test-context gate (v1.6.1).
//
// The test-implementation stage is what creates related-test and
// oracle/assertion evidence, so requiring that evidence before the stage can
// begin is circular. This module is the single policy decision for the
// narrow, phase-specific exception: ENTRY to test-implementation may accept
// critical responsibilities whose raw producer mapping is `partially-mapped`
// ONLY because test-side evidence cannot exist yet. It never rewrites the raw
// mappingStatus and never relaxes any production-side requirement; completion
// and every downstream stage keep the strict contract (callers only ask for
// this assessment while the stage's report does not exist yet).
//
// Classification uses typed projections (counts and the producer's fixed
// unresolvedReasons vocabulary), never free prose, and fails closed: a missing
// or unrecognized field makes a mapping non-deferrable.

import { RawResponsibilityMappingEntry } from './myDevKitEvidenceSummary';
import { TestResponsibilityParseResult } from './testResponsibilityCriticality';

export const CONTEXT_TEST_EVIDENCE_PENDING_PRETEST = 'CONTEXT_TEST_EVIDENCE_PENDING_PRETEST';

// Producer unresolvedReasons that are necessarily caused by tests not existing
// yet. "no test command" is deliberately NOT here: a repository with test
// infrastructure always yields at least the full-project command, so its
// absence is a real infrastructure gap, not a pre-test consequence.
export const PRETEST_DEFERRABLE_UNRESOLVED_REASONS: readonly string[] = ['no related test', 'no oracle evidence'];

export interface PreTestDeferralAssessment {
  // True only when at least one critical responsibility is deferred and none
  // is non-deferrable.
  deferrable: boolean;
  deferredResponsibilityIds: string[];
  nonDeferrableResponsibilityIds: string[];
  deferredReasons: string[];
}

function isDeferrablePartialMapping(mapping: RawResponsibilityMappingEntry): boolean {
  if (mapping.mappingStatus !== 'partially-mapped') return false;
  // Production-side evidence must be fully grounded.
  if ((mapping.productionSymbols?.length ?? 0) === 0) return false;
  if ((mapping.contractLikeEvidenceCount ?? 0) === 0) return false;
  // Test infrastructure evidence must exist (a runner command was discovered).
  if ((mapping.testCommandCount ?? 0) === 0) return false;
  // Pre-test means no related test exists yet; any existing related test makes
  // this a genuine post-test mapping that must be fully mapped.
  if ((mapping.proposedOrExistingTestFiles?.length ?? 0) > 0) return false;
  const reasons = mapping.unresolvedReasons ?? [];
  if (reasons.length === 0) return false;
  return reasons.every((reason) => PRETEST_DEFERRABLE_UNRESOLVED_REASONS.includes(reason));
}

export function assessPreTestDeferral(
  parsed: TestResponsibilityParseResult,
  rawMappings: readonly RawResponsibilityMappingEntry[],
): PreTestDeferralAssessment {
  const firstMappingById = new Map<string, RawResponsibilityMappingEntry>();
  for (const mapping of rawMappings) {
    if (!firstMappingById.has(mapping.responsibilityId)) firstMappingById.set(mapping.responsibilityId, mapping);
  }

  const deferred: string[] = [];
  const nonDeferrable: string[] = [];
  const reasons = new Set<string>();
  for (const responsibility of parsed.responsibilities) {
    if (responsibility.criticality !== 'critical') continue;
    const mapping = firstMappingById.get(responsibility.responsibilityId);
    if (mapping && (mapping.mappingStatus === 'mapped' || mapping.mappingStatus === 'not-applicable')) continue;
    // A critical responsibility with no raw mapping at all is never deferrable.
    if (mapping && isDeferrablePartialMapping(mapping)) {
      deferred.push(responsibility.responsibilityId);
      for (const reason of mapping.unresolvedReasons ?? []) reasons.add(reason);
    } else {
      nonDeferrable.push(responsibility.responsibilityId);
    }
  }
  return {
    deferrable: deferred.length > 0 && nonDeferrable.length === 0,
    deferredResponsibilityIds: deferred,
    nonDeferrableResponsibilityIds: nonDeferrable,
    deferredReasons: [...reasons].sort(),
  };
}
