// Builds a platform-neutral GreenfieldScaffoldPlan from a GreenfieldBootstrapBundle.
//
// Pure and deterministic: no files are written, no dependencies are
// installed, no commands are executed. Preserves unresolved decisions and
// non-goals from the bundle rather than inventing structure the brief does
// not support (section 10.2).

import { GreenfieldBootstrapBundle } from '../bootstrap/bootstrapBundleTypes';
import { GreenfieldProfile, GreenfieldProfileCommand } from '../profiles/profileTypes';
import { GreenfieldFullstackCapability } from '../fullstack/fullstackCapabilityTypes';
import {
  GreenfieldFirstRunnableBehavior,
  GreenfieldScaffoldFileGroup,
  GreenfieldScaffoldPlan,
} from './scaffoldPlanTypes';

export function buildScaffoldPlan(bundle: GreenfieldBootstrapBundle): GreenfieldScaffoldPlan {
  const profile = bundle.selectedProfile.profile;
  // v1.3.1 Batch 4: present only when Batch 3 resolved the full-stack
  // capability for this bundle (status 'selected'); undefined for every
  // ordinary non-full-stack bundle, which then composes exactly as before.
  const capability =
    bundle.fullstackCapability.status === 'selected' ? bundle.fullstackCapability.capability : undefined;

  return {
    profileId: profile?.id,
    plannedFileGroups: profile ? buildFileGroups(profile, capability) : [],
    firstRunnableBehavior: buildFirstRunnableBehavior(bundle, profile, capability),
    // v1.2.0: sourced directly from the profile's own command fields, added
    // in Batch 2, rather than a hardcoded npm assumption. This is what makes
    // android-compose's [] setupCommands and Gradle-based validationCommands
    // (instead of npm install / npm run build / npm test) flow through
    // correctly (see artifacts/v1.2.0-android-compose-profile-contract.txt).
    // v1.3.1 Batch 4: the resolved full-stack capability's own commands are
    // composed additively -- never a replacement for the profile's commands.
    setupCommands: composeCommands(profile?.setupCommands, capability?.setupCommands),
    validationCommands: composeCommands(profile?.validationCommands, capability?.validationCommands),
    testExpectations: bundle.docGenerationInstructions.testingExpectations,
    documentationExpectations: bundle.normalizedBrief.documentationPreferences,
    unresolvedDecisions: bundle.unresolvedDecisions.map((d) => `${d.field}: ${d.reason}`),
    nonGoals: bundle.normalizedBrief.nonGoals,
    unsupportedClaims: buildUnsupportedClaims(bundle),
  };
}

// ─── Internal builders ──────────────────────────────────────────────────────────

function buildFileGroups(
  profile: GreenfieldProfile,
  capability: GreenfieldFullstackCapability | undefined,
): GreenfieldScaffoldFileGroup[] {
  const configFiles = profile.templateTargets.filter((f) => !f.includes('/'));
  const sourceFiles = profile.templateTargets.filter((f) => f.includes('/'));

  const groups: GreenfieldScaffoldFileGroup[] = [];
  if (configFiles.length > 0) {
    groups.push({
      name: 'configuration',
      description: 'Root-level project configuration and documentation files.',
      filePaths: configFiles,
    });
  }
  if (sourceFiles.length > 0) {
    groups.push({
      name: 'source',
      description: 'Source files implementing the starter profile.',
      filePaths: sourceFiles,
    });
  }

  if (capability) {
    const fullstackPaths = capability.targetExpectations
      .filter((expectation) => expectation.matcher.kind === 'exact')
      .map((expectation) => expectation.matcher.value);
    if (fullstackPaths.length > 0) {
      groups.push({
        name: 'full-stack-infrastructure',
        description:
          'Full-stack environment/database/Docker infrastructure files required by the resolved ' +
          'fullstack-web + nextjs + PostgreSQL + Prisma + Docker capability.',
        filePaths: fullstackPaths,
      });
    }
  }

  return groups;
}

function buildFirstRunnableBehavior(
  bundle: GreenfieldBootstrapBundle,
  profile: GreenfieldProfile | undefined,
  capability: GreenfieldFullstackCapability | undefined,
): GreenfieldFirstRunnableBehavior {
  if (!profile) {
    return {
      description:
        'No profile was selected, so no first runnable behavior can be planned yet. ' +
        `Reason: ${bundle.selectedProfile.reason}`,
    };
  }

  if (capability) {
    return {
      description:
        `${profile.notesForBootstrapBundle} Product boundary: ${bundle.docGenerationInstructions.productBoundary} ` +
        'First runnable behavior crosses the full-stack boundary: the Next.js application calls the canonical ' +
        'Prisma database client, which reaches PostgreSQL, and returns an observable result (see ' +
        'app/api/health/route.ts), rather than only rendering a static page.',
      entryPoint: 'app/api/health/route.ts',
    };
  }

  const entryPoint = profile.templateTargets.find((f) => /\.(ts|tsx|kt)$/.test(f) && f.includes('/'));
  return {
    description: `${profile.notesForBootstrapBundle} Product boundary: ${bundle.docGenerationInstructions.productBoundary}`,
    entryPoint,
  };
}

function composeCommands(
  profileCommands: readonly GreenfieldProfileCommand[] | undefined,
  capabilityCommands: readonly GreenfieldProfileCommand[] | undefined,
): GreenfieldProfileCommand[] {
  const base = profileCommands ? [...profileCommands] : [];
  if (!capabilityCommands || capabilityCommands.length === 0) {
    return base;
  }
  // Capability commands are additive; a capability command whose text
  // already exists on the profile (none do today) would be redundant but
  // harmless -- de-duplicated here by command text to keep the plan clean.
  const existingText = new Set(base.map((c) => c.command));
  const additive = capabilityCommands.filter((c) => !existingText.has(c.command));
  return [...base, ...additive];
}

function buildUnsupportedClaims(bundle: GreenfieldBootstrapBundle): string[] {
  const claims: string[] = [];
  if (bundle.selectedProfile.status !== 'selected') {
    claims.push(
      `Scaffold plan is incomplete: profile selection status is "${bundle.selectedProfile.status}" (${bundle.selectedProfile.reason}).`,
    );
  }
  return claims;
}
