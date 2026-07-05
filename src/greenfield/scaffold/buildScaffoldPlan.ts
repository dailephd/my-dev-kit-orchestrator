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
    setupCommands: profile ? ['npm install'] : [],
    validationCommands: profile ? buildValidationCommands(profile) : [],
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
  const entryPoint = profile.templateTargets.find((f) => /\.(ts|tsx)$/.test(f) && f.includes('/'));
  return {
    description: `${profile.notesForBootstrapBundle} Product boundary: ${bundle.docGenerationInstructions.productBoundary}`,
    entryPoint,
  };
}

function buildValidationCommands(profile: GreenfieldProfile): string[] {
  return profile.validationExpectations.map((expectation) => {
    const key = expectation.toLowerCase();
    if (key.includes('typecheck')) return 'npm run typecheck';
    if (key.includes('build')) return 'npm run build';
    if (key.includes('test')) return 'npm test';
    return expectation;
  });
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
