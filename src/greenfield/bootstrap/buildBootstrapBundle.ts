// Builds a platform-neutral GreenfieldBootstrapBundle from a normalized
// brief and a resolved profile selection.
//
// This deliberately does not port my-dev-kit-alpha's buildBootstrapBundle.ts
// (REWRITE_FOR_ORCHESTRATOR, see artifacts/greenfield-porting-map.txt): that
// function reads template files from disk, embeds a non-deterministic
// `Date.now()`-based id/timestamp, and returns a BootstrapBundle that extends
// TaskBundle (my-dev-kit-alpha's own LLM-orchestration infra). This module
// takes only in-memory inputs, performs no filesystem I/O, and is fully
// deterministic for the same inputs.

import { NormalizedGreenfieldBrief } from '../brief/briefTypes';
import { GreenfieldProfileSelection } from '../profiles/profileTypes';
import {
  GreenfieldBootstrapBundle,
  GreenfieldBundleValidationRule,
  GreenfieldDocGenerationInstructions,
  GreenfieldScaffoldPlanningInputs,
  GreenfieldStackDecision,
  GreenfieldStarterProfileSummary,
  GreenfieldTemplateTargetCategory,
  GreenfieldUnresolvedDecision,
} from './bootstrapBundleTypes';

export function buildGreenfieldBootstrapBundle(
  normalizedBrief: NormalizedGreenfieldBrief,
  selectedProfile: GreenfieldProfileSelection,
): GreenfieldBootstrapBundle {
  const starterProfile = buildStarterProfileSummary(selectedProfile);
  const stackDecision = buildStackDecision(normalizedBrief, selectedProfile);
  const templateTargets = buildTemplateTargets();
  const docGenerationInstructions = buildDocGenerationInstructions(
    normalizedBrief,
    selectedProfile,
    stackDecision,
  );
  const scaffoldPlanningInputs = buildScaffoldPlanningInputs(normalizedBrief, selectedProfile);
  const validationRules = buildValidationRules();
  const unresolvedDecisions = buildUnresolvedDecisions(normalizedBrief, selectedProfile);

  return {
    normalizedBrief,
    selectedProfile,
    starterProfile,
    stackDecision,
    templateTargets,
    docGenerationInstructions,
    scaffoldPlanningInputs,
    validationRules,
    unresolvedDecisions,
  };
}

// ─── Internal builders ──────────────────────────────────────────────────────────

function buildStarterProfileSummary(
  selectedProfile: GreenfieldProfileSelection,
): GreenfieldStarterProfileSummary {
  return {
    status: selectedProfile.status,
    profileId: selectedProfile.profile?.id,
    displayName: selectedProfile.profile?.displayName,
    category: selectedProfile.profile?.category,
    requestedProfileId: selectedProfile.requestedProfileId,
    reason: selectedProfile.reason,
  };
}

function buildStackDecision(
  normalizedBrief: NormalizedGreenfieldBrief,
  selectedProfile: GreenfieldProfileSelection,
): GreenfieldStackDecision {
  const userPreferredStack = normalizedBrief.preferredStack;

  if (selectedProfile.status !== 'selected' || !selectedProfile.profile) {
    return {
      status: 'unresolved',
      chosenStack: [],
      userPreferredStack,
      notes: selectedProfile.stackDecisionNotes,
      unsupportedRequests: selectedProfile.requestedProfileId ? [selectedProfile.requestedProfileId] : [],
    };
  }

  const chosenStack = dedupeStable([
    ...selectedProfile.profile.stackAssumptions,
    ...userPreferredStack,
  ]);

  const status = selectedProfile.requestedProfileId ? 'resolved' : 'partially-resolved';

  return {
    status,
    chosenStack,
    userPreferredStack,
    notes: selectedProfile.stackDecisionNotes,
    unsupportedRequests: [],
  };
}

function buildTemplateTargets(): GreenfieldTemplateTargetCategory[] {
  return [
    {
      category: 'project-docs',
      description: 'Top-level project documentation (product boundary, architecture, plan).',
      applicable: true,
    },
    {
      category: 'component-docs',
      description:
        'Per-component/module documentation guidance. Not applicable in v1.1.0: the brief ' +
        'schema does not capture module/component hints, so component boundaries are left unresolved.',
      applicable: false,
    },
    {
      category: 'scaffold-tree',
      description: 'Directory/file scaffold for the new project. Planning inputs only; no scaffold is generated in this batch.',
      applicable: false,
    },
  ];
}

function buildDocGenerationInstructions(
  normalizedBrief: NormalizedGreenfieldBrief,
  selectedProfile: GreenfieldProfileSelection,
  stackDecision: GreenfieldStackDecision,
): GreenfieldDocGenerationInstructions {
  const productBoundary = buildProductBoundarySummary(normalizedBrief);
  const stackDecisionSummary = buildStackDecisionSummary(selectedProfile, stackDecision);
  const testingExpectations = dedupeStable([
    ...normalizedBrief.testingExpectations,
    ...(selectedProfile.profile?.testExpectations ?? []),
  ]);
  const validationExpectations = dedupeStable(selectedProfile.profile?.validationExpectations ?? []);
  const knownUncertainties = normalizedBrief.unresolved.map(
    (u) => `${u.field}: ${u.reason}`,
  );

  return {
    productBoundary,
    stackDecisionSummary,
    testingExpectations,
    validationExpectations,
    knownUncertainties,
  };
}

function buildProductBoundarySummary(normalizedBrief: NormalizedGreenfieldBrief): string {
  const name = normalizedBrief.candidateProjectName ?? 'This project';
  const goal = normalizedBrief.productGoal ?? '(product goal not provided in the brief)';
  const users = normalizedBrief.usersOrAudience ?? '(users/audience not provided in the brief)';
  const workflow = normalizedBrief.coreWorkflow ?? '(core workflow not provided in the brief)';
  return `${name}: ${goal}. Users/audience: ${users}. Core workflow: ${workflow}.`;
}

function buildStackDecisionSummary(
  selectedProfile: GreenfieldProfileSelection,
  stackDecision: GreenfieldStackDecision,
): string {
  if (stackDecision.status === 'unresolved') {
    return `No stack could be resolved (${selectedProfile.reason})`;
  }
  const displayName = selectedProfile.profile?.displayName ?? 'unknown profile';
  return `Profile: ${displayName}. Stack: ${stackDecision.chosenStack.join(', ') || '(none)'}.`;
}

function buildScaffoldPlanningInputs(
  normalizedBrief: NormalizedGreenfieldBrief,
  selectedProfile: GreenfieldProfileSelection,
): GreenfieldScaffoldPlanningInputs {
  return {
    profileId: selectedProfile.profile?.id,
    scaffoldPlanningHints: selectedProfile.profile?.scaffoldPlanningHints ?? [],
    templateTargets: selectedProfile.profile?.templateTargets ?? [],
    unresolvedDecisions: normalizedBrief.unresolved.map((u) => u.field),
  };
}

function buildValidationRules(): GreenfieldBundleValidationRule[] {
  return [
    { id: 'has-normalized-brief', description: 'The bundle must carry a normalized brief.' },
    { id: 'has-profile-selection', description: 'The bundle must carry a profile selection with a status.' },
    { id: 'stack-decision-present', description: 'The bundle must carry a stack decision, even when unresolved.' },
    {
      id: 'no-android-mobile-claims',
      description: 'Generated docs must not claim Android, iOS, React Native, or Flutter support.',
    },
    {
      id: 'no-release-security-publish-claims',
      description: 'Generated docs must not claim release, security-validation, or publish completion.',
    },
  ];
}

function buildUnresolvedDecisions(
  normalizedBrief: NormalizedGreenfieldBrief,
  selectedProfile: GreenfieldProfileSelection,
): GreenfieldUnresolvedDecision[] {
  const decisions: GreenfieldUnresolvedDecision[] = normalizedBrief.unresolved.map((u) => ({
    field: u.field,
    reason: u.reason,
  }));

  if (selectedProfile.status === 'unsupported') {
    decisions.push({
      field: 'preferredProfile',
      reason: selectedProfile.reason,
    });
  }

  decisions.push({
    field: 'componentBoundaries',
    reason:
      'The v1.1.0 brief schema does not capture module/component hints; component doc ' +
      'generation is deferred rather than invented.',
  });

  return decisions;
}

function dedupeStable(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}
