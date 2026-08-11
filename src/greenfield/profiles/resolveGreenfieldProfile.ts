// Resolves a starter profile from a normalized greenfield brief.
//
// No historical source has a profile catalog or resolution mechanism
// (REWRITE_FOR_ORCHESTRATOR, see artifacts/greenfield-porting-map.txt). Both
// historical sources only infer app-type/stack heuristically from free text;
// this module additionally supports an explicit, versioned profile catalog
// and never silently substitutes an unsupported or ambiguous request with a
// default (section 9.5 of the v1.1.0 batch: "preserve unknown profile
// requests as unresolved or unsupported; do not silently map them to a
// random default").
//
// v1.2.0 adds android-compose as a third supported profile (see
// artifacts/v1.2.0-android-compose-profile-contract.txt). iOS, Flutter, and
// React Native remain explicitly out of scope: they are not added to
// SUPPORTED_PROFILES or PROFILE_ALIASES, so they continue to fall through
// the existing catalog-miss branch below like any other unrecognized profile
// id, with no platform-specific behavior of their own.

import { NormalizedGreenfieldBrief } from '../brief/briefTypes';
import {
  GreenfieldProfile,
  GreenfieldProfileId,
  GreenfieldProfileSelection,
  GreenfieldProjectType,
  GreenfieldWebFramework,
} from './profileTypes';
import { TYPESCRIPT_CLI_PROFILE } from './typescriptCliProfile';
import { NEXTJS_APP_PROFILE } from './nextjsAppProfile';
import { ANDROID_COMPOSE_PROFILE } from './androidComposeProfile';
import { PYTHON_CLI_PROFILE } from './pythonCliProfile';
import { normalizeGreenfieldProfileIdentifier } from './profileIdentifierNormalization';
import { ProfileRegistryValidationResult } from './profileValidationTypes';
import { validateGreenfieldProfileRegistry } from './validateGreenfieldProfileRegistry';

// Exported (v1.3.0) so the shared profile/registry validator
// (validateGreenfieldProfileRegistry.ts) can validate the single current
// registry without a second registry being created. Resolution behavior
// below is unchanged; this is an additive, read-only export of the existing
// private table.
export const SUPPORTED_PROFILES: Record<GreenfieldProfileId, GreenfieldProfile> = {
  'typescript-cli': TYPESCRIPT_CLI_PROFILE,
  'nextjs-app': NEXTJS_APP_PROFILE,
  'android-compose': ANDROID_COMPOSE_PROFILE,
  'python-cli': PYTHON_CLI_PROFILE,
};

// Small, explicit, bounded alias table -- never fuzzy matching. Each key is
// already normalized (trimmed, lowercased, spaces replaced with dashes) the
// same way an incoming preferredProfile request is normalized below.
// "android compose" and "kotlin compose"/"jetpack compose" (spaced) already
// normalize to their exact catalog/alias key via the existing
// lowercase+dash-join step, so they do not need separate entries here.
//
// Exported (v1.3.0) for the same reason as SUPPORTED_PROFILES above.
export const PROFILE_ALIASES: Record<string, GreenfieldProfileId> = {
  python: 'python-cli',
  android: 'android-compose',
  'kotlin-compose': 'android-compose',
  'jetpack-compose': 'android-compose',
  'compose-android': 'android-compose',
};

// Explicit, bounded set of generic-mobile preferredProfile requests that
// must resolve as ambiguous rather than being aliased to android-compose or
// falling through to "unsupported". Deliberately narrow (no fuzzy matching):
// a request naming a specific technology (e.g. "android", "kotlin-compose")
// is handled by PROFILE_ALIASES above, not this set.
const AMBIGUOUS_MOBILE_PROFILE_IDS = new Set(['mobile', 'mobile-app', 'phone-app']);

// Signals a generic, technology-unspecified mobile request within free-text
// fallback signals (platformTarget/preferredStack), when no preferredProfile
// was given at all. Deliberately narrow: it does not match "android",
// "kotlin", "compose", etc. -- those remain outside this batch's defined
// scope for fallback (non-explicit) resolution; see
// reports/v1.2.0-batch-2-profile-implementation-report.txt for the reasoning.
const MOBILE_HINT_RE = /\b(mobile|phone app|phone-app)\b/i;

const WEB_HINT_RE = /\b(web|browser|next\.?js|react|frontend|dashboard)\b/i;
const PYTHON_HINT_RE = /\bpython\b/i;
const CLI_HINT_RE = /\b(cli|command[- ]line(?: tool| application)?)\b/i;
const SERVER_HINT_RE = /\b(api|server|backend|full[- ]stack|fastapi|django|flask)\b/i;

export function resolveGreenfieldProfile(
  normalized: NormalizedGreenfieldBrief,
): GreenfieldProfileSelection {
  if (normalized.preferredProfile) {
    return resolveExplicitProfile(normalized, normalized.preferredProfile);
  }
  return resolveFallbackProfile(normalized);
}

/**
 * v1.3.0 Batch 1: validates the current built-in registry (SUPPORTED_PROFILES
 * and PROFILE_ALIASES above) with the shared profile/registry validator. This
 * is the registry-boundary integration point Batch 0 assigned to Batch 1; it
 * does not change resolveGreenfieldProfile's resolution behavior and is not
 * yet wired into any command, status, or check surface (that integration is
 * Batch 4's shared artifact/contract-checking scope).
 */
export function validateSupportedGreenfieldProfileRegistry(): ProfileRegistryValidationResult {
  const entries = Object.values(SUPPORTED_PROFILES);
  const aliases = Object.entries(PROFILE_ALIASES).map(([alias, profileId]) => ({ alias, profileId }));
  return validateGreenfieldProfileRegistry(entries, aliases);
}

function resolveExplicitProfile(
  normalized: NormalizedGreenfieldBrief,
  requested: string,
): GreenfieldProfileSelection {
  const normalizedId = normalizeGreenfieldProfileIdentifier(requested);

  if (AMBIGUOUS_MOBILE_PROFILE_IDS.has(normalizedId)) {
    return {
      status: 'unresolved',
      requestedProfileId: requested,
      reason:
        `Requested profile "${requested}" is a generic mobile request and does not name a specific ` +
        'supported platform. Android Compose is supported; set preferredProfile to "android-compose" ' +
        '(or a recognized alias, e.g. "android") to select it explicitly. iOS, Flutter, and React ' +
        'Native are not supported. This request is preserved as unresolved rather than defaulted.',
      stackDecisionNotes: [],
    };
  }

  const aliasedId = PROFILE_ALIASES[normalizedId];
  const profile = SUPPORTED_PROFILES[normalizedId as GreenfieldProfileId] ??
    (aliasedId ? SUPPORTED_PROFILES[aliasedId] : undefined);

  if (!profile) {
    return {
      status: 'unsupported',
      requestedProfileId: requested,
      reason:
        `Requested profile "${requested}" is not in the supported v1.2.0 catalog ` +
        `(supported: ${Object.keys(SUPPORTED_PROFILES).join(', ')}). ` +
        'This request is preserved as unsupported rather than mapped to a default.',
      stackDecisionNotes: [],
    };
  }

  const incompatibility = findProjectDimensionIncompatibility(normalized, profile);
  if (incompatibility) {
    return {
      status: 'unsupported',
      requestedProfileId: requested,
      reason: incompatibility,
      stackDecisionNotes: [],
    };
  }

  const reason = aliasedId
    ? `Requested profile "${requested}" was resolved via a known alias to "${aliasedId}" and selected.`
    : `Explicit profile "${requested}" was found in the supported catalog and selected.`;

  return {
    status: 'selected',
    profile,
    requestedProfileId: requested,
    reason,
    stackDecisionNotes: buildStackDecisionNotes(normalized, profile),
  };
}

// v1.3.1 Batch 1: checks an explicitly requested projectType/webFramework
// (orthogonal to preferredProfile) against the requested profile's declared
// GreenfieldProfile.compatibleProjectTypes/compatibleWebFrameworks. Absence
// of either dimension on the brief means that dimension is not evaluated, so
// legacy briefs and non-web profile requests are unaffected. Returns a
// human-readable incompatibility reason, or undefined when compatible (or
// when the request supplies neither dimension).
function findProjectDimensionIncompatibility(
  normalized: NormalizedGreenfieldBrief,
  profile: GreenfieldProfile,
): string | undefined {
  if (
    normalized.projectType &&
    !profile.compatibleProjectTypes.includes(normalized.projectType as GreenfieldProjectType)
  ) {
    return (
      `Requested project type "${normalized.projectType}" is not compatible with profile "${profile.id}" ` +
      `(profile declares compatibility with: ${profile.compatibleProjectTypes.join(', ') || 'none'}). ` +
      'This request is preserved as unsupported rather than silently reinterpreted as another profile.'
    );
  }

  if (
    normalized.webFramework &&
    !profile.compatibleWebFrameworks.includes(normalized.webFramework as GreenfieldWebFramework)
  ) {
    return (
      `Requested web framework "${normalized.webFramework}" is not compatible with profile "${profile.id}" ` +
      `(profile declares compatibility with: ${profile.compatibleWebFrameworks.join(', ') || 'none'}). ` +
      'This request is preserved as unsupported rather than silently reinterpreted as another profile.'
    );
  }

  return undefined;
}

function resolveFallbackProfile(normalized: NormalizedGreenfieldBrief): GreenfieldProfileSelection {
  const signals = [normalized.platformTarget, ...normalized.preferredStack].filter(
    (value): value is string => Boolean(value),
  );

  const looksMobileAmbiguous = signals.some((signal) => MOBILE_HINT_RE.test(signal));
  if (looksMobileAmbiguous) {
    return {
      status: 'unresolved',
      reason:
        'The brief signals a mobile project but does not name a specific platform or profile. ' +
        'Android Compose is supported; set preferredProfile to "android-compose" to select it ' +
        'explicitly. iOS, Flutter, and React Native are not supported. This request is preserved ' +
        'as unresolved rather than silently defaulted.',
      stackDecisionNotes: [],
    };
  }

  const looksWebFacing = signals.some((signal) => WEB_HINT_RE.test(signal));
  const looksPython = signals.some((signal) => PYTHON_HINT_RE.test(signal));

  if (looksPython) {
    const hasIncompatiblePythonIntent =
      looksWebFacing ||
      signals.some((signal) => SERVER_HINT_RE.test(signal)) ||
      Boolean(normalized.projectType || normalized.webFramework);

    if (hasIncompatiblePythonIntent) {
      return {
        status: 'unsupported',
        reason:
          'The brief requests Python together with web, API, server, or full-stack intent, but the only ' +
          'supported Python profile is python-cli. This request is preserved as unsupported rather than ' +
          'silently mapped to python-cli or nextjs-app.',
        stackDecisionNotes: [],
      };
    }

    const looksCommandLine = signals.some((signal) => CLI_HINT_RE.test(signal));
    if (looksCommandLine) {
      return {
        status: 'selected',
        profile: PYTHON_CLI_PROFILE,
        reason:
          'No explicit profile preference provided; Python and command-line intent were both explicit, ' +
          'so the deterministic fallback selected python-cli.',
        stackDecisionNotes: buildStackDecisionNotes(normalized, PYTHON_CLI_PROFILE),
      };
    }

    return {
      status: 'unresolved',
      reason:
        'The brief requests Python but does not establish command-line intent. Python may describe several ' +
        'unsupported project kinds, so this request is preserved as unresolved rather than defaulted to ' +
        'python-cli or typescript-cli.',
      stackDecisionNotes: [],
    };
  }

  const profile = looksWebFacing ? NEXTJS_APP_PROFILE : TYPESCRIPT_CLI_PROFILE;
  const reason = looksWebFacing
    ? 'No explicit profile preference provided; platformTarget/preferredStack indicated a ' +
      'web-facing project, so the deterministic fallback selected nextjs-app.'
    : 'No explicit profile preference provided; deterministic fallback selected typescript-cli ' +
      'because it requires the fewest structural assumptions of the supported profiles.';

  return {
    status: 'selected',
    profile,
    reason,
    stackDecisionNotes: buildStackDecisionNotes(normalized, profile),
  };
}

function buildStackDecisionNotes(
  normalized: NormalizedGreenfieldBrief,
  profile: GreenfieldProfile,
): string[] {
  const notes: string[] = [`Selected profile stack assumptions: ${profile.stackAssumptions.join(', ')}.`];
  if (normalized.preferredStack.length > 0) {
    notes.push(`Brief-preferred stack entries: ${normalized.preferredStack.join(', ')}.`);
  }
  return notes;
}
