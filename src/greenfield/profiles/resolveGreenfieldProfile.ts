// Resolves a starter profile from a normalized greenfield brief.
//
// No historical source has a profile catalog or resolution mechanism
// (REWRITE_FOR_ORCHESTRATOR, see artifacts/greenfield-porting-map.txt). Both
// historical sources only infer app-type/stack heuristically from free text;
// this module additionally supports an explicit, versioned profile catalog
// and never silently substitutes an unsupported request with a default
// (section 9.5: "preserve unknown profile requests as unresolved or
// unsupported; do not silently map them to a random default").
//
// Only two profiles are supported in v1.1.0: typescript-cli and nextjs-app.
// Mobile/Android profiles (e.g. "android-compose", "react-native", "flutter",
// "ios") are explicitly out of scope for v1.1.0 and belong to v1.2.0+; any
// such request falls through to the 'unsupported' branch below like any other
// unrecognized profile id, with no Android/mobile-specific behavior.

import { NormalizedGreenfieldBrief } from '../brief/briefTypes';
import {
  GreenfieldProfile,
  GreenfieldProfileId,
  GreenfieldProfileSelection,
} from './profileTypes';
import { TYPESCRIPT_CLI_PROFILE } from './typescriptCliProfile';
import { NEXTJS_APP_PROFILE } from './nextjsAppProfile';

const SUPPORTED_PROFILES: Record<GreenfieldProfileId, GreenfieldProfile> = {
  'typescript-cli': TYPESCRIPT_CLI_PROFILE,
  'nextjs-app': NEXTJS_APP_PROFILE,
};

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
  const profile = SUPPORTED_PROFILES[normalizedId as GreenfieldProfileId];

  if (!profile) {
    return {
      status: 'unsupported',
      requestedProfileId: requested,
      reason:
        `Requested profile "${requested}" is not in the supported v1.1.0 catalog ` +
        `(supported: ${Object.keys(SUPPORTED_PROFILES).join(', ')}). ` +
        'This request is preserved as unsupported rather than mapped to a default.',
      stackDecisionNotes: [],
    };
  }

  return {
    status: 'selected',
    profile,
    requestedProfileId: requested,
    reason: `Explicit profile "${requested}" was found in the supported catalog and selected.`,
    stackDecisionNotes: buildStackDecisionNotes(normalized, profile),
  };
}

function resolveFallbackProfile(normalized: NormalizedGreenfieldBrief): GreenfieldProfileSelection {
  const signals = [normalized.platformTarget, ...normalized.preferredStack].filter(
    (value): value is string => Boolean(value),
  );
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
