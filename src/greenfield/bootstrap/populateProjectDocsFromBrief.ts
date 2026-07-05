// Generates the nine required v1.1.0 project-doc targets from a
// GreenfieldBootstrapBundle.
//
// Unlike my-dev-kit-alpha's populateProjectDocsFromBrief.ts, this does not
// fill placeholder tokens in markdown template files loaded from disk; it
// builds structured doc sections directly from the bundle's own fields
// (REWRITE_FOR_ORCHESTRATOR, see artifacts/greenfield-porting-map.txt and
// artifacts/greenfield-do-not-port-list.txt). Content never claims
// implementation, testing, security, release, or publication completion
// (section 9.3). Doc content mentions Android/Jetpack/Gradle whenever the
// selected profile is android-compose (v1.2.0); whether that is a
// legitimate claim or a violation is decided by validateBootstrapDocs.ts's
// profile-aware check, not by this generator.

import { GreenfieldBootstrapBundle } from './bootstrapBundleTypes';
import { GreenfieldDocTarget } from './projectDocBootstrapTypes';

export function populateProjectDocsFromBrief(bundle: GreenfieldBootstrapBundle): GreenfieldDocTarget[] {
  return [
    buildProductBoundaryDoc(bundle),
    buildStackDecisionDoc(bundle),
    buildStarterProfileSummaryDoc(bundle),
    buildDevelopmentWorkflowDoc(bundle),
    buildTestingExpectationsDoc(bundle),
    buildValidationExpectationsDoc(bundle),
    buildScaffoldPlanningNotesDoc(bundle),
    buildUnresolvedDecisionsDoc(bundle),
    buildNonGoalsDoc(bundle),
  ];
}

// ─── Individual doc builders ────────────────────────────────────────────────────

function buildProductBoundaryDoc(bundle: GreenfieldBootstrapBundle): GreenfieldDocTarget {
  const { normalizedBrief } = bundle;
  const hasCore = Boolean(
    normalizedBrief.productGoal && normalizedBrief.usersOrAudience && normalizedBrief.coreWorkflow,
  );
  return {
    docName: 'product-boundary',
    status: hasCore ? 'generated' : 'partial',
    sections: [
      { heading: 'Idea', content: normalizedBrief.rawIdea },
      { heading: 'Project name', content: normalizedBrief.candidateProjectName ?? '(not provided in the brief)' },
      { heading: 'Product goal', content: normalizedBrief.productGoal ?? '(not provided in the brief)' },
      { heading: 'Users or audience', content: normalizedBrief.usersOrAudience ?? '(not provided in the brief)' },
      { heading: 'Core workflow', content: normalizedBrief.coreWorkflow ?? '(not provided in the brief)' },
      { heading: 'Constraints', content: listOrNone(normalizedBrief.constraints) },
      { heading: 'Summary', content: bundle.docGenerationInstructions.productBoundary },
    ],
    unresolvedNotes: hasCore ? [] : ['productGoal, usersOrAudience, or coreWorkflow not provided'],
  };
}

function buildStackDecisionDoc(bundle: GreenfieldBootstrapBundle): GreenfieldDocTarget {
  const { stackDecision } = bundle;
  return {
    docName: 'stack-decision',
    status: stackDecision.status === 'unresolved' ? 'skipped' : stackDecision.status === 'resolved' ? 'generated' : 'partial',
    sections: [
      { heading: 'Status', content: stackDecision.status },
      { heading: 'Chosen stack', content: listOrNone(stackDecision.chosenStack) },
      { heading: 'User-preferred stack', content: listOrNone(stackDecision.userPreferredStack) },
      { heading: 'Notes', content: listOrNone(stackDecision.notes) },
      { heading: 'Unsupported requests', content: listOrNone(stackDecision.unsupportedRequests) },
    ],
    unresolvedNotes: stackDecision.status === 'unresolved' ? ['stack could not be resolved from the brief'] : [],
  };
}

function buildStarterProfileSummaryDoc(bundle: GreenfieldBootstrapBundle): GreenfieldDocTarget {
  const { starterProfile } = bundle;
  const generated = starterProfile.status === 'selected';
  return {
    docName: 'starter-profile-summary',
    status: generated ? 'generated' : 'skipped',
    sections: [
      { heading: 'Status', content: starterProfile.status },
      { heading: 'Profile', content: starterProfile.displayName ?? '(no profile selected)' },
      { heading: 'Category', content: starterProfile.category ?? '(none)' },
      { heading: 'Requested profile id', content: starterProfile.requestedProfileId ?? '(none requested)' },
      { heading: 'Reason', content: starterProfile.reason },
    ],
    unresolvedNotes: generated ? [] : [`profile not selected: ${starterProfile.reason}`],
  };
}

function buildDevelopmentWorkflowDoc(bundle: GreenfieldBootstrapBundle): GreenfieldDocTarget {
  const hints = bundle.scaffoldPlanningInputs.scaffoldPlanningHints;
  return {
    docName: 'development-workflow',
    status: hints.length > 0 ? 'generated' : 'partial',
    sections: [
      { heading: 'Scaffold planning hints', content: listOrNone(hints) },
      {
        heading: 'Documentation preferences',
        content: listOrNone(bundle.normalizedBrief.documentationPreferences),
      },
    ],
    unresolvedNotes: hints.length > 0 ? [] : ['no scaffold planning hints available (no profile selected)'],
  };
}

function buildTestingExpectationsDoc(bundle: GreenfieldBootstrapBundle): GreenfieldDocTarget {
  const expectations = bundle.docGenerationInstructions.testingExpectations;
  return {
    docName: 'testing-expectations',
    status: expectations.length > 0 ? 'generated' : 'partial',
    sections: [{ heading: 'Testing expectations', content: listOrNone(expectations) }],
    unresolvedNotes: expectations.length > 0 ? [] : ['no testing expectations provided or implied by profile'],
  };
}

function buildValidationExpectationsDoc(bundle: GreenfieldBootstrapBundle): GreenfieldDocTarget {
  const expectations = bundle.docGenerationInstructions.validationExpectations;
  return {
    docName: 'validation-expectations',
    status: expectations.length > 0 ? 'generated' : 'partial',
    sections: [{ heading: 'Validation expectations', content: listOrNone(expectations) }],
    unresolvedNotes: expectations.length > 0 ? [] : ['no validation expectations available (no profile selected)'],
  };
}

function buildScaffoldPlanningNotesDoc(bundle: GreenfieldBootstrapBundle): GreenfieldDocTarget {
  const { scaffoldPlanningInputs } = bundle;
  return {
    docName: 'scaffold-planning-notes',
    status: scaffoldPlanningInputs.profileId ? 'generated' : 'skipped',
    sections: [
      { heading: 'Profile id', content: scaffoldPlanningInputs.profileId ?? '(none)' },
      { heading: 'Template targets', content: listOrNone(scaffoldPlanningInputs.templateTargets) },
      {
        heading: 'Note',
        content: 'These are planning inputs only. Scaffold generation is out of scope for this batch.',
      },
    ],
    unresolvedNotes: scaffoldPlanningInputs.profileId ? [] : ['no profile selected; scaffold planning inputs incomplete'],
  };
}

function buildUnresolvedDecisionsDoc(bundle: GreenfieldBootstrapBundle): GreenfieldDocTarget {
  const decisions = bundle.unresolvedDecisions;
  return {
    docName: 'unresolved-decisions',
    status: decisions.length > 0 ? 'generated' : 'generated',
    sections: decisions.map((d) => ({ heading: d.field, content: d.reason })),
    unresolvedNotes: decisions.map((d) => `${d.field}: ${d.reason}`),
  };
}

function buildNonGoalsDoc(bundle: GreenfieldBootstrapBundle): GreenfieldDocTarget {
  const nonGoals = bundle.normalizedBrief.nonGoals;
  return {
    docName: 'non-goals',
    status: nonGoals.length > 0 ? 'generated' : 'skipped',
    sections: [{ heading: 'Non-goals', content: listOrNone(nonGoals) }],
    unresolvedNotes: nonGoals.length > 0 ? [] : ['no non-goals provided in the brief'],
  };
}

function listOrNone(values: string[]): string {
  return values.length > 0 ? values.join('; ') : '(none provided)';
}
