// Normalizes a raw GreenfieldProjectBrief into a stable NormalizedGreenfieldBrief.
//
// Adapted from my-dev-kit-alpha's src/newProject/normalizeProjectBrief.ts
// (PORT_FROM_MY_DEV_KIT, see artifacts/greenfield-porting-map.txt). This
// module is deterministic and bounded:
// - it never invents confident structure from sparse text
// - it emits explicit warnings when the brief lacks specificity
// - it preserves unresolved fields explicitly rather than guessing
// - it does not generate scaffold, docs, or profile decisions (those are
//   handled by src/greenfield/profiles/ and later batches)

import {
  GreenfieldProjectBrief,
  GreenfieldBriefNormalizationResult,
  GreenfieldBriefUnresolved,
  GreenfieldBriefWarning,
  GreenfieldBriefWarningKind,
  NormalizedGreenfieldBrief,
} from './briefTypes';

export function normalizeProjectBrief(
  brief: GreenfieldProjectBrief,
): GreenfieldBriefNormalizationResult {
  const warnings: GreenfieldBriefWarning[] = [];
  const unresolved: GreenfieldBriefUnresolved[] = [];

  if (brief.rawIdea.trim().split(/\s+/).length < 8) {
    warn(warnings, 'sparse-idea',
      'Project idea is very short. Adding more detail improves later doc and scaffold specificity.');
  }

  // --- Candidate project name ---
  let candidateProjectName: string | undefined;
  if (brief.projectName) {
    candidateProjectName = brief.projectName;
  } else {
    const inferred = inferProjectName(brief.rawIdea);
    if (inferred) {
      candidateProjectName = inferred;
      warn(warnings, 'candidate-name-inferred',
        `Project name was not provided; inferred "${inferred}" from the idea text. ` +
        'Set projectName for an authoritative name.');
    } else {
      warn(warnings, 'missing-project-name',
        'No project name provided and none could be inferred. Set projectName.');
      unresolved.push({ field: 'projectName', reason: 'not provided and not inferable from rawIdea' });
    }
  }

  if (!brief.productGoal) {
    warn(warnings, 'missing-product-goal', 'No product goal provided.');
    unresolved.push({ field: 'productGoal', reason: 'not provided' });
  }

  if (!brief.usersOrAudience) {
    warn(warnings, 'missing-users-or-audience', 'No users or audience provided.');
    unresolved.push({ field: 'usersOrAudience', reason: 'not provided' });
  }

  if (!brief.coreWorkflow) {
    warn(warnings, 'missing-core-workflow', 'No core workflow provided.');
    unresolved.push({ field: 'coreWorkflow', reason: 'not provided' });
  }

  const preferredStack = brief.preferredStack ?? [];
  if (preferredStack.length === 0) {
    warn(warnings, 'missing-stack',
      'No preferred technology stack provided. Set preferredStack to improve profile resolution.');
    unresolved.push({ field: 'preferredStack', reason: 'not provided' });
  }

  if (!brief.preferredProfile) {
    warn(warnings, 'missing-profile-preference',
      'No preferred starter profile provided. Profile resolution will use deterministic fallback.');
    unresolved.push({ field: 'preferredProfile', reason: 'not provided; fallback resolution will apply' });
  }

  const normalized: NormalizedGreenfieldBrief = {
    rawIdea: brief.rawIdea.trim(),
    candidateProjectName,
    productGoal: brief.productGoal,
    usersOrAudience: brief.usersOrAudience,
    coreWorkflow: brief.coreWorkflow,
    constraints: brief.constraints ?? [],
    nonGoals: brief.nonGoals ?? [],
    preferredStack,
    preferredProfile: brief.preferredProfile,
    platformTarget: brief.platformTarget,
    documentationPreferences: brief.documentationPreferences ?? [],
    testingExpectations: brief.testingExpectations ?? [],
    unresolved,
  };

  return { normalized, warnings };
}

// ─── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Attempts to infer a candidate project name from the idea text.
 * Looks for patterns like "a <Name> app", "the <Name> platform", or a quoted name.
 * Returns undefined when no clear name can be extracted.
 */
function inferProjectName(rawIdea: string): string | undefined {
  const namedMatch = rawIdea.match(
    /\b(?:a|an|the)\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)\s+(?:application|app|platform|system|service|tool|library|api|cli)\b/i,
  );
  if (namedMatch) {
    return namedMatch[1].trim();
  }

  const quotedMatch = rawIdea.match(/["']([A-Za-z][A-Za-z0-9\s-]{2,40})["']/);
  if (quotedMatch) {
    return quotedMatch[1].trim();
  }

  return undefined;
}

function warn(
  warnings: GreenfieldBriefWarning[],
  kind: GreenfieldBriefWarningKind,
  message: string,
): void {
  warnings.push({ kind, message });
}
