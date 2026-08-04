// v1.3.0 Batch 1 shared registry-wide validator. Validates every entry in
// the single current greenfield profile registry (profile-local validation
// per entry, then duplicate-id and alias collision detection across the
// registry) -- see PseudocodePacket PSE-018 and BehaviorModel BEH-002/INV-001.
// Every conflicting participant is reported; no winner is silently selected,
// and ordering never depends on registry/alias input order.
import { GreenfieldProfile } from './profileTypes';
import {
  GreenfieldProfileAliasEntry,
  ProfileRegistryValidationResult,
  ProfileValidationIssue,
} from './profileValidationTypes';
import { finalizeProfileValidationResult } from './profileValidationOrdering';
import { validateGreenfieldProfile } from './validateGreenfieldProfile';
import { normalizeGreenfieldProfileIdentifier } from './profileIdentifierNormalization';

export function validateGreenfieldProfileRegistry(
  entries: readonly GreenfieldProfile[],
  aliases: readonly GreenfieldProfileAliasEntry[] = [],
): ProfileRegistryValidationResult {
  const issues: ProfileValidationIssue[] = [];

  for (const entry of entries) {
    const localResult = validateGreenfieldProfile(entry);
    issues.push(...localResult.issues);
  }

  const entriesByNormalizedId = groupBy(entries, (entry) =>
    normalizeGreenfieldProfileIdentifier(String(entry?.id ?? '')),
  );
  for (const [normalizedId, group] of entriesByNormalizedId) {
    if (group.length > 1) {
      group.forEach((entry, indexInGroup) => {
        issues.push(duplicateIdIssue(entry.id, normalizedId, indexInGroup));
      });
    }
  }

  const aliasesByNormalizedKey = groupBy(aliases, (aliasEntry) =>
    normalizeGreenfieldProfileIdentifier(aliasEntry.alias),
  );
  for (const [normalizedAlias, group] of aliasesByNormalizedKey) {
    if (group.length > 1) {
      group.forEach((aliasEntry, indexInGroup) => {
        issues.push(duplicateAliasIssue(aliasEntry, normalizedAlias, indexInGroup));
      });
    }
  }

  for (const [normalizedAlias, aliasGroup] of aliasesByNormalizedKey) {
    const collidingProfiles = entriesByNormalizedId.get(normalizedAlias) ?? [];
    if (collidingProfiles.length === 0) {
      continue;
    }
    for (const aliasEntry of aliasGroup) {
      issues.push(aliasCollidesWithProfileIdIssue(aliasEntry, normalizedAlias));
    }
    for (const profileEntry of collidingProfiles) {
      issues.push(profileIdCollidesWithAliasIssue(profileEntry, normalizedAlias));
    }
  }

  return finalizeProfileValidationResult(issues);
}

function groupBy<T>(items: readonly T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

// Every entry sharing a duplicate id/alias reports the same profileId, code,
// and affectedContract, so the participant's position within its own
// duplicate group is folded into evidenceKey. This keeps each conflicting
// participant's issue distinct through PSE-023 dedup (otherwise two entries
// with truly identical id/alias text would collapse into one issue, hiding a
// participant) while remaining deterministic: the group's evidenceKey *set*
// (`#0`, `#1`, ...) does not depend on which physical entry the registry
// listed first.
function duplicateIdIssue(profileId: string, normalizedId: string, indexInGroup: number): ProfileValidationIssue {
  return {
    code: 'GF_REGISTRY_DUPLICATE_ID',
    severity: 'error',
    profileId,
    affectedContract: 'registry.id',
    reason: `Profile id "${profileId}" (normalized "${normalizedId}") is declared by more than one registry entry.`,
    correctiveAction: 'Give every registry entry a distinct profile id.',
    evidenceKey: `${normalizedId}#${indexInGroup}`,
  };
}

function duplicateAliasIssue(
  aliasEntry: GreenfieldProfileAliasEntry,
  normalizedAlias: string,
  indexInGroup: number,
): ProfileValidationIssue {
  return {
    code: 'GF_ALIAS_DUPLICATE',
    severity: 'error',
    profileId: aliasEntry.profileId,
    affectedContract: 'registry.alias',
    reason: `Alias "${aliasEntry.alias}" (normalized "${normalizedAlias}") is declared more than once.`,
    correctiveAction: 'Remove or rename the duplicate alias so each normalized alias maps to exactly one profile.',
    evidenceKey: `${normalizedAlias}#${indexInGroup}`,
  };
}

function aliasCollidesWithProfileIdIssue(
  aliasEntry: GreenfieldProfileAliasEntry,
  normalizedAlias: string,
): ProfileValidationIssue {
  return {
    code: 'GF_ALIAS_COLLISION',
    severity: 'error',
    profileId: aliasEntry.profileId,
    affectedContract: 'registry.alias',
    reason: `Alias "${aliasEntry.alias}" (normalized "${normalizedAlias}") collides with an existing profile id.`,
    correctiveAction: 'Choose an alias that does not match any existing profile id.',
    evidenceKey: normalizedAlias,
  };
}

function profileIdCollidesWithAliasIssue(
  profileEntry: GreenfieldProfile,
  normalizedAlias: string,
): ProfileValidationIssue {
  return {
    code: 'GF_ALIAS_COLLISION',
    severity: 'error',
    profileId: profileEntry.id,
    affectedContract: 'registry.id',
    reason: `Profile id "${profileEntry.id}" collides with a registered alias "${normalizedAlias}".`,
    correctiveAction: 'Rename the profile id or remove the colliding alias.',
    evidenceKey: normalizedAlias,
  };
}
