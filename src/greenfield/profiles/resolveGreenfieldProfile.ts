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
} from './profileTypes';
import { TYPESCRIPT_CLI_PROFILE } from './typescriptCliProfile';
import { NEXTJS_APP_PROFILE } from './nextjsAppProfile';
import { ANDROID_COMPOSE_PROFILE } from './androidComposeProfile';

const SUPPORTED_PROFILES: Record<GreenfieldProfileId, GreenfieldProfile> = {
  'typescript-cli': TYPESCRIPT_CLI_PROFILE,
  'nextjs-app': NEXTJS_APP_PROFILE,
  'android-compose': ANDROID_COMPOSE_PROFILE,
};

// Small, explicit, bounded alias table -- never fuzzy matching. Each key is
// already normalized (trimmed, lowercased, spaces replaced with dashes) the
// same way an incoming preferredProfile request is normalized below.
// "android compose" and "kotlin compose"/"jetpack compose" (spaced) already
// normalize to their exact catalog/alias key via the existing
// lowercase+dash-join step, so they do not need separate entries here.
const PROFILE_ALIASES: Record<string, GreenfieldProfileId> = {
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

export function resolveGreenfieldProfile(
  normalized: NormalizedGreenfieldBrief,
): GreenfieldProfileSelection {
  if (normalized.preferredProfile) {
    return resolveExplicitProfile(normalized, normalized.preferredProfile);
  }
  return resolveFallbackProfile(normalized);
}

function resolveExplicitProfile(
  normalized: NormalizedGreenfieldBrief,
  requested: string,
): GreenfieldProfileSelection {
  const normalizedId = requested.trim().toLowerCase().replace(/\s+/g, '-');

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
