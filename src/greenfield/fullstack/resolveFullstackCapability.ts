// v1.3.1 Batch 3: deterministic resolution of the full-stack capability from
// an already-normalized brief and an already-resolved Batch 1
// GreenfieldProfileSelection. Never fuzzy-matches, never uses LLM inference,
// and never resolves at the CLI layer -- it is a pure function over the same
// stage-owned inputs Batch 1's resolveGreenfieldProfile() already produces.

import { NormalizedGreenfieldBrief } from '../brief/briefTypes';
import { GREENFIELD_PROJECT_TYPE, GREENFIELD_WEB_FRAMEWORK, GreenfieldProfileSelection } from '../profiles/profileTypes';
import {
  FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
  GreenfieldFullstackCapability,
} from './fullstackCapabilityTypes';

export type GreenfieldFullstackCapabilityStatus = 'selected' | 'not-applicable' | 'unsupported';

/**
 * The result of resolving a full-stack capability from a normalized brief
 * and profile selection. `capability` is present only when
 * `status === 'selected'`, mirroring GreenfieldProfileSelection's existing
 * "payload only when selected" convention.
 */
export interface GreenfieldFullstackCapabilitySelection {
  status: GreenfieldFullstackCapabilityStatus;
  capability?: GreenfieldFullstackCapability;
  reason: string;
}

export function resolveFullstackCapability(
  normalized: NormalizedGreenfieldBrief,
  profileSelection: GreenfieldProfileSelection,
): GreenfieldFullstackCapabilitySelection {
  const requestsFullstackDimension = Boolean(normalized.projectType || normalized.webFramework);

  if (!requestsFullstackDimension) {
    return {
      status: 'not-applicable',
      reason: 'The brief requests neither a project type nor a web framework; no full-stack capability applies.',
    };
  }

  if (profileSelection.status !== 'selected' || !profileSelection.profile) {
    return {
      status: 'not-applicable',
      reason:
        'No starter profile was selected for this brief, so no full-stack capability can be attached. ' +
        'See the profile selection reason for why resolution did not select a profile.',
    };
  }

  const profile = profileSelection.profile;

  if (normalized.projectType !== GREENFIELD_PROJECT_TYPE.FULLSTACK_WEB) {
    return {
      status: 'unsupported',
      reason:
        `Requested project type "${normalized.projectType ?? '(none)'}" does not match the only implemented ` +
        `full-stack project type ("${GREENFIELD_PROJECT_TYPE.FULLSTACK_WEB}"). This request is preserved as ` +
        'unsupported rather than silently attaching the full-stack contract.',
    };
  }

  if (normalized.webFramework !== GREENFIELD_WEB_FRAMEWORK.NEXTJS) {
    return {
      status: 'unsupported',
      reason:
        `Requested web framework "${normalized.webFramework ?? '(none)'}" does not match the only implemented ` +
        `full-stack web framework ("${GREENFIELD_WEB_FRAMEWORK.NEXTJS}"). This request is preserved as ` +
        'unsupported rather than silently attaching the full-stack contract.',
    };
  }

  if (
    profile.id !== 'nextjs-app' ||
    !profile.compatibleProjectTypes.includes(GREENFIELD_PROJECT_TYPE.FULLSTACK_WEB) ||
    !profile.compatibleWebFrameworks.includes(GREENFIELD_WEB_FRAMEWORK.NEXTJS)
  ) {
    return {
      status: 'unsupported',
      reason:
        `Profile "${profile.id}" does not declare compatibility with the fullstack-web + nextjs full-stack ` +
        'capability. This request is preserved as unsupported rather than silently attaching the contract to ' +
        'an incompatible profile.',
    };
  }

  return {
    status: 'selected',
    capability: FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
    reason:
      'Requested fullstack-web + nextjs matched the selected nextjs-app profile\'s declared compatibility; ' +
      'the PostgreSQL + Prisma + Docker full-stack environment capability was attached.',
  };
}
