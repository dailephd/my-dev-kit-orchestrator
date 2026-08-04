// Shared, immutable validation result and issue contracts for the v1.3.0
// greenfield profile/registry validators (validateGreenfieldProfile.ts,
// validateGreenfieldProfileRegistry.ts). This is the one issue system for
// greenfield profile/scaffold/readiness validation across Batches 1-4; later
// batches extend the code inventory here rather than introducing a second
// issue model.

/** `GF_<DOMAIN>_<CONDITION>`, e.g. `GF_PROFILE_MISSING_FIELD`. */
export type ProfileValidationIssueCode = `GF_${string}`;

export type ProfileValidationSeverity = 'error' | 'warning';

/** Sentinel profileId for registry-level issues not tied to one profile entry. */
export const UNRESOLVED_PROFILE_VALIDATION_ID = 'unresolved-profile';

export interface ProfileValidationIssue {
  readonly code: ProfileValidationIssueCode;
  readonly severity: ProfileValidationSeverity;
  readonly profileId: string;
  readonly affectedContract: string;
  readonly reason: string;
  readonly correctiveAction: string;
  readonly evidenceKey?: string;
  readonly expected?: string;
  readonly actual?: string;
}

export interface ProfileValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ProfileValidationIssue[];
}

/** Distinct name per PseudocodePacket PSE-018; same immutable shape as ProfileValidationResult. */
export type ProfileRegistryValidationResult = ProfileValidationResult;

/**
 * One alias->profile mapping entry. Modeled as an array (rather than the
 * runtime `Record<string, GreenfieldProfileId>` PROFILE_ALIASES uses) so the
 * registry validator can represent and detect a duplicate/malformed alias
 * table, which an object literal's key uniqueness would silently prevent.
 */
export interface GreenfieldProfileAliasEntry {
  readonly alias: string;
  readonly profileId: string;
}
