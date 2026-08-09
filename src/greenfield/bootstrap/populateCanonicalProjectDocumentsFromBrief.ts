// Generates the v1.3.1 Batch 2 standardized common canonical project-document
// targets from a GreenfieldBootstrapBundle.
//
// Mirrors populateProjectDocsFromBrief.ts's approach (structured in-memory
// sections built directly from bundle fields; no disk templates, no
// filesystem writes) but targets the ecosystem-standard 15-file canonical
// inventory (GREENFIELD_CANONICAL_DOCUMENTS) instead of the nine legacy
// v1.1.0 doc categories. Content never claims database, Docker, deployment,
// release automation, or security guarantees the bundle does not actually
// supply (see reports/v1.3.1-planning-documentation-report.txt). The same
// generic population logic runs for every selected profile; profile-owned
// fields (documentationExpectations, unsupportedConditions, setupCommands,
// validationCommands) are the additive overlay -- no profile-id branching.

import { GreenfieldBootstrapBundle } from './bootstrapBundleTypes';
import { GreenfieldCanonicalDocumentTarget } from './projectDocBootstrapTypes';
import { GREENFIELD_ENVIRONMENT_SCOPES, GreenfieldFullstackCapability } from '../fullstack/fullstackCapabilityTypes';
import { GreenfieldProfileCommand } from '../profiles/profileTypes';

/**
 * v1.3.1 Batch 4: the resolved full-stack capability, when the bundle's
 * `fullstackCapability.status === 'selected'`. `undefined` for every
 * ordinary non-full-stack bundle, in which case every builder below
 * produces exactly its pre-Batch-4 content -- no profile-id branching, only
 * capability-presence branching.
 */
function resolveCapability(bundle: GreenfieldBootstrapBundle): GreenfieldFullstackCapability | undefined {
  return bundle.fullstackCapability.status === 'selected' ? bundle.fullstackCapability.capability : undefined;
}

export function populateCanonicalProjectDocumentsFromBrief(
  bundle: GreenfieldBootstrapBundle,
): GreenfieldCanonicalDocumentTarget[] {
  return [
    buildReadme(bundle),
    buildChangelog(bundle),
    buildProjectOverview(bundle),
    buildCurrentState(bundle),
    buildArchitecture(bundle),
    buildContracts(bundle),
    buildCommands(bundle),
    buildWorkflows(bundle),
    buildQuickstart(bundle),
    buildDevelopment(bundle),
    buildCiCd(bundle),
    buildRoadmap(bundle),
    buildRelease(bundle),
    buildSecurity(bundle),
    buildDocumentationPreservationPolicy(bundle),
  ];
}

// ─── Individual canonical document builders ─────────────────────────────────

function buildReadme(bundle: GreenfieldBootstrapBundle): GreenfieldCanonicalDocumentTarget {
  const { normalizedBrief, starterProfile } = bundle;
  const capability = resolveCapability(bundle);
  const projectName = normalizedBrief.candidateProjectName ?? '(project name not yet provided)';
  const hasIdentity = Boolean(normalizedBrief.candidateProjectName && normalizedBrief.productGoal);
  const sections = [
    { heading: 'Project', content: projectName },
    { heading: 'Summary', content: bundle.docGenerationInstructions.productBoundary },
    { heading: 'Quickstart', content: 'See docs/QUICKSTART.md for the shortest first-use path.' },
    {
      heading: 'Current state',
      content: `Newly bootstrapped project. Starter profile: ${starterProfile.displayName ?? '(unresolved)'} (${starterProfile.status}).`,
    },
    { heading: 'Limitations', content: listOrNone(normalizedBrief.unresolved.map((u) => u.field)) },
    {
      heading: 'Documentation',
      content: 'See docs/PROJECT_OVERVIEW.md, docs/ARCHITECTURE.md, docs/CONTRACTS.md, and docs/DEVELOPMENT.md.',
    },
  ];
  if (capability) {
    sections.push({
      heading: 'Shape',
      content:
        `Full-stack ${capability.webFramework} application with a ${capability.databaseEngine.engine} database ` +
        `via ${capability.databaseToolkit.toolkit}, running in ${capability.containerRuntime.runtime} for local ` +
        'infrastructure. See docs/ARCHITECTURE.md and docs/CONTRACTS.md for details.',
    });
  }
  return {
    path: 'README.md',
    status: hasIdentity ? 'generated' : 'partial',
    sections,
    unresolvedNotes: hasIdentity ? [] : ['project name or product goal not yet provided in the brief'],
  };
}

function buildChangelog(_bundle: GreenfieldBootstrapBundle): GreenfieldCanonicalDocumentTarget {
  return {
    path: 'CHANGELOG.md',
    status: 'generated',
    sections: [
      {
        heading: 'Unreleased',
        content: 'Initial greenfield bootstrap. No prior releases exist yet for this new project.',
      },
    ],
    unresolvedNotes: [],
  };
}

function buildProjectOverview(bundle: GreenfieldBootstrapBundle): GreenfieldCanonicalDocumentTarget {
  const { normalizedBrief } = bundle;
  const capability = resolveCapability(bundle);
  const hasCore = Boolean(normalizedBrief.productGoal && normalizedBrief.usersOrAudience);
  const sections = [
    { heading: 'Product goal', content: normalizedBrief.productGoal ?? '(not provided in the brief)' },
    { heading: 'Users or audience', content: normalizedBrief.usersOrAudience ?? '(not provided in the brief)' },
    { heading: 'Core workflow', content: normalizedBrief.coreWorkflow ?? '(not provided in the brief)' },
    { heading: 'Project type', content: normalizedBrief.projectType ?? '(not specified)' },
    { heading: 'Web framework', content: normalizedBrief.webFramework ?? '(not specified)' },
    { heading: 'Non-goals', content: listOrNone(normalizedBrief.nonGoals) },
    { heading: 'Constraints', content: listOrNone(normalizedBrief.constraints) },
  ];
  if (capability) {
    sections.push({
      heading: 'Persistence',
      content:
        `This project requires persistence: ${capability.databaseEngine.engine} as the database engine, ` +
        `${capability.databaseToolkit.toolkit} as the database toolkit, and ${capability.containerRuntime.runtime} ` +
        'for local infrastructure containerization.',
    });
  }
  return {
    path: 'docs/PROJECT_OVERVIEW.md',
    status: hasCore ? 'generated' : 'partial',
    sections,
    unresolvedNotes: hasCore ? [] : ['productGoal or usersOrAudience not provided'],
  };
}

function buildCurrentState(bundle: GreenfieldBootstrapBundle): GreenfieldCanonicalDocumentTarget {
  const { starterProfile, stackDecision } = bundle;
  const capability = resolveCapability(bundle);
  const resolved = starterProfile.status === 'selected';
  const sections = [
    {
      heading: 'Starter profile',
      content: `${starterProfile.displayName ?? '(none selected)'} -- ${starterProfile.reason}`,
    },
    { heading: 'Stack decision', content: `${stackDecision.status}: ${listOrNone(stackDecision.chosenStack)}` },
    {
      heading: 'Next planned direction',
      content: 'Scaffold planning and first vertical slice have not been implemented yet.',
    },
  ];
  if (capability) {
    sections.push({
      heading: 'Full-stack capability',
      content:
        `A ${capability.databaseEngine.engine}/${capability.databaseToolkit.toolkit}/${capability.containerRuntime.runtime} ` +
        'full-stack capability is resolved for this project. Its infrastructure, database, and container ' +
        'behavior have not been generated, started, or otherwise verified yet -- selecting the capability is a ' +
        'planning decision, not runtime evidence.',
    });
  }
  return {
    path: 'docs/CURRENT_STATE.md',
    status: resolved ? 'generated' : 'partial',
    sections,
    unresolvedNotes: resolved ? [] : [`starter profile not selected: ${starterProfile.reason}`],
  };
}

function buildArchitecture(bundle: GreenfieldBootstrapBundle): GreenfieldCanonicalDocumentTarget {
  const profile = bundle.selectedProfile.profile;
  const capability = resolveCapability(bundle);
  const sections = [
    { heading: 'Stack assumptions', content: listOrNone(profile?.stackAssumptions ?? []) },
    { heading: 'Category', content: profile?.category ?? '(no profile selected)' },
    { heading: 'Supported project kind', content: profile?.supportedProjectKind ?? '(no profile selected)' },
    { heading: 'Notes', content: profile?.notesForBootstrapBundle ?? '(no profile selected)' },
  ];
  if (capability) {
    sections.push(
      {
        heading: 'Development topology',
        content:
          `${capability.developmentEnvironment.hostApplicationDevelopment.description} ` +
          capability.developmentEnvironment.containerizedProductionLikeSmoke.description,
      },
      {
        heading: 'Database ownership',
        content:
          `${capability.databaseEngine.engine} runs as Docker-managed infrastructure. The application accesses ` +
          `it through one canonical ${capability.databaseToolkit.toolkit} client; no other code path owns the ` +
          'connection.',
      },
      {
        heading: 'Schema/client relationship',
        content:
          `The ${capability.databaseToolkit.toolkit} schema owns the logical design; the generated client is ` +
          'derived output, not the source of truth.',
      },
      {
        heading: 'Container topology',
        content: listOrNone(capability.containerRuntime.responsibilities),
      },
      {
        heading: 'Environment separation',
        content: `Development, test, and production database identities are kept distinct (scopes: ${listOrNone(
          [...GREENFIELD_ENVIRONMENT_SCOPES],
        )}).`,
      },
      {
        heading: 'Liveness, health, and readiness',
        content: listOrNone(capability.healthReadiness.distinctConcerns),
      },
      {
        heading: 'Production migration responsibility',
        content:
          `Production migration is a distinct pre-traffic operation (${capability.productionMigration.responsibility}), ` +
          'not something every application replica performs independently on startup.',
      },
    );
  }
  return {
    path: 'docs/ARCHITECTURE.md',
    status: profile ? 'generated' : 'partial',
    sections,
    unresolvedNotes: profile ? [] : ['no profile selected; architecture shape is unresolved'],
  };
}

function buildContracts(bundle: GreenfieldBootstrapBundle): GreenfieldCanonicalDocumentTarget {
  const profile = bundle.selectedProfile.profile;
  const capability = resolveCapability(bundle);
  const sections = [
    { heading: 'Validation expectations', content: listOrNone(profile?.validationExpectations ?? []) },
    { heading: 'Test expectations', content: listOrNone(profile?.testExpectations ?? []) },
    {
      heading: 'Future contracts',
      content: capability
        ? 'The full-stack environment/database/container contract below is resolved. Later capability ' +
          'contracts (when supported) will be layered into this document rather than creating a parallel ' +
          'contract map.'
        : 'Additional resolved project-type/framework/capability contracts (when supported) will be layered ' +
          'into this document rather than creating a parallel contract map.',
    },
  ];
  if (capability) {
    sections.push(
      {
        heading: 'Environment scopes',
        content: `Distinct scopes: ${listOrNone([...GREENFIELD_ENVIRONMENT_SCOPES])}.`,
      },
      {
        heading: 'Database ownership',
        content: `${capability.databaseEngine.engine} is the one supported database engine; distinct scope identities are required.`,
      },
      {
        heading: 'Migration lifecycle',
        content:
          'Migration creation and migration deploy/replay are distinct operations; committed SQL migrations ' +
          'own database evolution.',
      },
      {
        heading: 'Test database isolation',
        content: 'Test database identity is distinct from development and production; database-backed tests use test state.',
      },
      {
        heading: 'Reset safety',
        content: `Reset is allowed only for: ${listOrNone([...capability.resetRecovery.allowedScopes])}. Target identity must be parsed and validated; ambiguous or production-like targets fail closed; credentials are redacted from failure reporting.`,
      },
      {
        heading: 'Readiness',
        content: `Distinct concerns: ${listOrNone([...capability.healthReadiness.distinctConcerns])}.`,
      },
      {
        heading: 'Seed policy',
        content: `${capability.databaseToolkit.seedPolicy.kind}: ${capability.databaseToolkit.seedPolicy.description}`,
      },
      {
        heading: 'Production migration ownership',
        content: `${capability.productionMigration.responsibility}, exposed as an explicit migration-deploy responsibility separate from application startup.`,
      },
    );
  }
  return {
    path: 'docs/CONTRACTS.md',
    status: profile ? 'generated' : 'partial',
    sections,
    unresolvedNotes: profile ? [] : ['no profile selected; contract expectations are unresolved'],
  };
}

function buildCommands(bundle: GreenfieldBootstrapBundle): GreenfieldCanonicalDocumentTarget {
  const profile = bundle.selectedProfile.profile;
  const capability = resolveCapability(bundle);
  // Mirrors buildScaffoldPlan.ts's composition exactly (profile commands
  // first, then additive capability commands, deduplicated by command text)
  // so this document never documents a command the composed scaffold plan
  // does not actually define.
  const setupCommands = composeCommandsForDocs(profile?.setupCommands, capability?.setupCommands);
  const validationCommands = composeCommandsForDocs(profile?.validationCommands, capability?.validationCommands);
  const setup = setupCommands.map((c) => `${c.command} -- ${c.purpose}`);
  const validation = validationCommands.map((c) => `${c.command} -- ${c.purpose}`);
  return {
    path: 'docs/COMMANDS.md',
    status: profile ? 'generated' : 'partial',
    sections: [
      { heading: 'Setup commands', content: listOrNone(setup) },
      { heading: 'Validation commands', content: listOrNone(validation) },
    ],
    unresolvedNotes: profile ? [] : ['no profile selected; no commands are available yet'],
  };
}

function composeCommandsForDocs(
  profileCommands: readonly GreenfieldProfileCommand[] | undefined,
  capabilityCommands: readonly GreenfieldProfileCommand[] | undefined,
): GreenfieldProfileCommand[] {
  const base = profileCommands ? [...profileCommands] : [];
  if (!capabilityCommands || capabilityCommands.length === 0) {
    return base;
  }
  const existingText = new Set(base.map((c) => c.command));
  return [...base, ...capabilityCommands.filter((c) => !existingText.has(c.command))];
}

function buildWorkflows(bundle: GreenfieldBootstrapBundle): GreenfieldCanonicalDocumentTarget {
  const hints = bundle.scaffoldPlanningInputs.scaffoldPlanningHints;
  const capability = resolveCapability(bundle);
  const sections = [
    { heading: 'Scaffold planning hints', content: listOrNone(hints) },
    { heading: 'Documentation preferences', content: listOrNone(bundle.normalizedBrief.documentationPreferences) },
  ];
  if (capability) {
    for (const phase of ['development', 'test', 'production'] as const) {
      const operations = capability.lifecycleResponsibilities
        .filter((r) => r.phase === phase)
        .map((r) => `${r.operation}: ${r.description}`);
      sections.push({
        heading: phase === 'development' ? 'Development workflow' : phase === 'test' ? 'Testing workflow' : 'Production-like workflow',
        content: listOrNone(operations),
      });
    }
  }
  return {
    path: 'docs/WORKFLOWS.md',
    status: hints.length > 0 ? 'generated' : 'partial',
    sections,
    unresolvedNotes: hints.length > 0 ? [] : ['no scaffold planning hints available (no profile selected)'],
  };
}

function buildQuickstart(bundle: GreenfieldBootstrapBundle): GreenfieldCanonicalDocumentTarget {
  const profile = bundle.selectedProfile.profile;
  const capability = resolveCapability(bundle);
  const firstSetup = profile?.setupCommands[0]?.command;
  const firstValidation = profile?.validationCommands[0]?.command;
  const sections = [
    { heading: 'First setup command', content: firstSetup ?? '(no profile selected)' },
    { heading: 'First validation command', content: firstValidation ?? '(no profile selected)' },
  ];
  if (capability) {
    const requiredDevSetup = composeCommandsForDocs(profile?.setupCommands, capability.setupCommands).filter(
      (c) => c.required && c.lifecyclePhase !== 'test' && c.lifecyclePhase !== 'production',
    );
    sections.push({
      heading: 'Shortest local full-stack start',
      content: listOrNone(requiredDevSetup.map((c) => c.command)),
    });
  }
  return {
    path: 'docs/QUICKSTART.md',
    status: profile ? 'generated' : 'partial',
    sections,
    unresolvedNotes: profile ? [] : ['no profile selected; shortest first-use path is unresolved'],
  };
}

function buildDevelopment(bundle: GreenfieldBootstrapBundle): GreenfieldCanonicalDocumentTarget {
  const profile = bundle.selectedProfile.profile;
  const capability = resolveCapability(bundle);
  const sections = [
    { heading: 'Category', content: profile?.category ?? '(no profile selected)' },
    { heading: 'Testing expectations', content: listOrNone(profile?.testExpectations ?? []) },
    { heading: 'Documentation expectations', content: listOrNone(profile?.documentationExpectations ?? []) },
  ];
  if (capability) {
    sections.push(
      {
        heading: 'Local service expectations',
        content: capability.developmentEnvironment.hostApplicationDevelopment.description,
      },
      {
        heading: 'Safe database workflow',
        content:
          `Guarded reset is available for development/test scopes only (${listOrNone([
            ...capability.resetRecovery.allowedScopes,
          ])}); production is never a valid reset target.`,
      },
    );
  }
  return {
    path: 'docs/DEVELOPMENT.md',
    status: profile ? 'generated' : 'partial',
    sections,
    unresolvedNotes: profile ? [] : ['no profile selected; contributor setup guidance is unresolved'],
  };
}

function buildCiCd(bundle: GreenfieldBootstrapBundle): GreenfieldCanonicalDocumentTarget {
  const capability = resolveCapability(bundle);
  const sections = [
    {
      heading: 'Status',
      content: 'No continuous-integration pipeline exists yet for this newly bootstrapped project.',
    },
  ];
  if (capability) {
    sections.push({
      heading: 'Full-stack responsibilities a future pipeline would need',
      content:
        'Once a continuous-integration pipeline is established (provider unspecified), it would need to run ' +
        'the isolated test-database lifecycle (start, wait for health, migration deploy/replay, guarded reset, ' +
        'database-backed tests, cleanup) and, separately for a production build, the application build, ' +
        'production image build, and production migration-deploy responsibility -- kept distinct from ordinary ' +
        'application startup.',
    });
  }
  return {
    path: 'docs/CI_CD.md',
    status: 'partial',
    sections,
    unresolvedNotes: ['CI/CD automation has not been established for this new project'],
  };
}

function buildRoadmap(bundle: GreenfieldBootstrapBundle): GreenfieldCanonicalDocumentTarget {
  const decisions = bundle.unresolvedDecisions;
  return {
    path: 'docs/ROADMAP.md',
    status: 'generated',
    sections: [
      {
        heading: 'Next planned direction',
        content: 'Scaffold planning, first vertical slice, and verification are the next planned steps.',
      },
      { heading: 'Open decisions', content: listOrNone(decisions.map((d) => `${d.field}: ${d.reason}`)) },
    ],
    unresolvedNotes: [],
  };
}

function buildRelease(_bundle: GreenfieldBootstrapBundle): GreenfieldCanonicalDocumentTarget {
  return {
    path: 'docs/RELEASE.md',
    status: 'partial',
    sections: [
      {
        heading: 'Status',
        content: 'No versioning or publication procedure has been established yet for this new project.',
      },
    ],
    unresolvedNotes: ['versioning/publication procedure has not been established for this new project'],
  };
}

function buildSecurity(bundle: GreenfieldBootstrapBundle): GreenfieldCanonicalDocumentTarget {
  const capability = resolveCapability(bundle);
  const sections = [
    { heading: 'Status', content: 'No security review process has been established yet for this new project.' },
  ];
  if (capability) {
    const secretVariables = capability.environmentVariables.filter((v) => v.secret).map((v) => v.name);
    sections.push(
      {
        heading: 'Secret handling',
        content: `Secret environment variables (${listOrNone(secretVariables)}) are never committed; no hard-coded credentials are used anywhere in the generated project.`,
      },
      {
        heading: 'Destructive-operation boundaries',
        content: `Database reset is restricted to ${listOrNone([
          ...capability.resetRecovery.allowedScopes,
        ])}; production is never a valid reset target. Target identity is parsed and validated, ambiguous or ` +
          'production-like targets fail closed, and credentials are redacted from failure reporting.',
      },
      {
        heading: 'Container/runtime boundaries',
        content: 'The production application image prefers a non-root runtime and uses a build-context-aware ignore file.',
      },
    );
  }
  return {
    path: 'docs/SECURITY.md',
    status: 'partial',
    sections,
    unresolvedNotes: ['security review process has not been established for this new project'],
  };
}

function buildDocumentationPreservationPolicy(
  _bundle: GreenfieldBootstrapBundle,
): GreenfieldCanonicalDocumentTarget {
  return {
    path: 'docs/DOCUMENTATION_PRESERVATION_POLICY.md',
    status: 'generated',
    sections: [
      {
        heading: 'Policy',
        content:
          'This project follows the ecosystem-standard common canonical document baseline. Common documents ' +
          'should be extended in place rather than replaced, renamed, or removed as the project evolves.',
      },
    ],
    unresolvedNotes: [],
  };
}

function listOrNone(values: readonly string[]): string {
  return values.length > 0 ? values.join('; ') : '(none provided)';
}
