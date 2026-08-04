// Shared profile/alias identifier normalization, extracted from
// resolveGreenfieldProfile.ts so the v1.3.0 shared profile validator
// (validateGreenfieldProfileRegistry.ts) can compare profile ids and aliases
// using the exact same normalization resolveGreenfieldProfile already uses,
// without duplicating the rule or creating a second normalization owner.
//
// Deliberately narrow: trim, lowercase, collapse whitespace to a single
// dash. No further collapsing or transliteration -- this must continue to
// match resolveGreenfieldProfile's existing case-/spacing-insensitive
// explicit-profile resolution exactly.
export function normalizeGreenfieldProfileIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}
