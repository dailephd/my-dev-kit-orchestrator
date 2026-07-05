// Builds a platform-neutral GreenfieldScaffoldPlan from a GreenfieldBootstrapBundle.
//
// Pure and deterministic: no files are written, no dependencies are
// installed, no commands are executed. Preserves unresolved decisions and
// non-goals from the bundle rather than inventing structure the brief does
// not support (section 10.2).

import { GreenfieldBootstrapBundle } from '../bootstrap/bootstrapBundleTypes';
import { GreenfieldProfile } from '../profiles/profileTypes';
import {
  GreenfieldFirstRunnableBehavior,
  GreenfieldScaffoldFileGroup,
  GreenfieldScaffoldPlan,
} from './scaffoldPlanTypes';

export function buildScaffoldPlan(bundle: GreenfieldBootstrapBundle): GreenfieldScaffoldPlan {
  const profile = bundle.selectedProfile.profile;

  return {
    profileId: profile?.id,
    plannedFileGroups: profile ? buildFileGroups(profile) : [],
    firstRunnableBehavior: buildFirstRunnableBehavior(bundle, profile),
    // v1.2.0: sourced directly from the profile's own command fields, added
    // in Batch 2, rather than a hardcoded npm assumption. This is what makes
    // android-compose's [] setupCommands and Gradle-based validationCommands
    // (instead of npm install / npm run build / npm test) flow through
    // correctly (see artifacts/v1.2.0-android-compose-profile-contract.txt).
    setupCommands: profile ? profile.setupCommands : [],
    validationCommands: profile ? profile.validationCommands : [],
    testExpectations: bundle.docGenerationInstructions.testingExpectations,
    documentationExpectations: bundle.normalizedBrief.documentationPreferences,
    unresolvedDecisions: bundle.unresolvedDecisions.map((d) => `${d.field}: ${d.reason}`),
    nonGoals: bundle.normalizedBrief.nonGoals,
    unsupportedClaims: buildUnsupportedClaims(bundle),
  };
}

// ─── Internal builders ──────────────────────────────────────────────────────────

function buildFileGroups(profile: GreenfieldProfile): GreenfieldScaffoldFileGroup[] {
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
  return groups;
}

function buildFirstRunnableBehavior(
  bundle: GreenfieldBootstrapBundle,
  profile: GreenfieldProfile | undefined,
): GreenfieldFirstRunnableBehavior {
  if (!profile) {
    return {
      description:
        'No profile was selected, so no first runnable behavior can be planned yet. ' +
        `Reason: ${bundle.selectedProfile.reason}`,
    };
  }
  const entryPoint = profile.templateTargets.find((f) => /\.(ts|tsx|kt)$/.test(f) && f.includes('/'));
  return {
    description: `${profile.notesForBootstrapBundle} Product boundary: ${bundle.docGenerationInstructions.productBoundary}`,
    entryPoint,
  };
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
