import type { GreenfieldBootstrapBundle } from '../bootstrapBundleTypes';
import type { GreenfieldProfileCommand } from '../../profiles/profileTypes';
import {
  GREENFIELD_AGENTS_ADAPTER_CONTENT,
  GREENFIELD_CLAUDE_ADAPTER_CONTENT,
  type GreenfieldProjectInstructionBundle,
  type GreenfieldProjectInstructionCapabilityModel,
  type GreenfieldProjectInstructionModel,
  type GreenfieldProjectInstructionProfileModel,
} from './projectInstructionTypes';

const NOT_PROVIDED = 'Not provided; resolve this uncertainty before making assumptions.';

/** Build the one normalized fact source used by every generated instruction target. */
export function buildGreenfieldProjectInstructionModel(
  bundle: GreenfieldBootstrapBundle,
): GreenfieldProjectInstructionModel {
  const brief = bundle.normalizedBrief;

  return {
    rawIdea: brief.rawIdea,
    projectName: nonblank(brief.candidateProjectName),
    productGoal: nonblank(brief.productGoal),
    usersOrAudience: nonblank(brief.usersOrAudience),
    coreWorkflow: nonblank(brief.coreWorkflow),
    constraints: dedupeStable(brief.constraints),
    nonGoals: dedupeStable(brief.nonGoals),
    documentationPreferences: dedupeStable(brief.documentationPreferences),
    testingExpectations: dedupeStable(bundle.docGenerationInstructions.testingExpectations),
    validationExpectations: dedupeStable(bundle.docGenerationInstructions.validationExpectations),
    unresolvedDecisions: dedupeStable(
      bundle.unresolvedDecisions.map((decision) => `${decision.field}: ${decision.reason}`),
    ),
    selectedStack:
      bundle.selectedProfile.status === 'selected' ? dedupeStable(bundle.stackDecision.chosenStack) : [],
    profile: buildProfileModel(bundle),
    capability: buildCapabilityModel(bundle),
  };
}

/** Generate exactly four deterministic, in-memory generated-project targets. */
export function buildGreenfieldProjectInstructionBundle(
  bundle: GreenfieldBootstrapBundle,
): GreenfieldProjectInstructionBundle {
  const model = buildGreenfieldProjectInstructionModel(bundle);

  return {
    model,
    targets: [
      { path: 'agents.txt', content: renderGreenfieldAgentsTxt(model) },
      { path: 'claude.txt', content: renderGreenfieldClaudeTxt(model) },
      { path: 'AGENTS.md', content: GREENFIELD_AGENTS_ADAPTER_CONTENT },
      { path: 'CLAUDE.md', content: GREENFIELD_CLAUDE_ADAPTER_CONTENT },
    ],
  };
}

export function renderGreenfieldAgentsTxt(model: GreenfieldProjectInstructionModel): string {
  const lines = [
    '# Coding-agent operating manual',
    '',
    ...renderSection('Project identity and purpose', [
      `Project: ${model.projectName ?? NOT_PROVIDED}`,
      `Purpose: ${model.productGoal ?? NOT_PROVIDED}`,
      `Users or audience: ${model.usersOrAudience ?? NOT_PROVIDED}`,
      `Original approved idea: ${nonblank(model.rawIdea) ?? NOT_PROVIDED}`,
    ]),
    ...renderSection('Current approved scope and workflow', [
      `Core workflow: ${model.coreWorkflow ?? NOT_PROVIDED}`,
      'Constraints:',
      ...renderList(model.constraints, 'No explicit constraints were provided.'),
      'Non-goals:',
      ...renderList(model.nonGoals, 'No explicit non-goals were provided; do not invent exclusions.'),
    ]),
    ...renderSection('Profile, stack, and project boundaries', renderProfileSummary(model)),
    ...renderCapabilitySection(model.capability),
    ...renderSection('Tool and execution boundaries', [
      '- Use my-dev-kit for bounded repository retrieval and graph-guided context when it is available.',
      '- Use my-dev-kit-orchestrator for workflow guidance, artifacts, integrity gates, and reporting.',
      '- Neither tool is a coding agent or application runtime.',
      '- The orchestrator does not execute setup or validation commands, build the application, run tests, perform security validation, publish the project, or execute my-dev-kit automatically.',
      '- A listed command is guidance, never evidence that it ran or passed.',
    ]),
    ...renderSection('Repository retrieval and implementation discipline', [
      '- Start from current repository evidence and the selected profile facts; do not reinterpret the raw request to choose a different stack.',
      '- Prefer bounded search, symbol lookup, graph slices, and exact source retrieval before broad file reads.',
      '- Reuse established owners and contracts. Do not create parallel profile, scaffold, readiness, artifact, or lifecycle systems.',
      '- Keep changes scoped, deterministic, reviewable, and free of unrelated cleanup.',
    ]),
    ...renderSection('Testing and failure handling', [
      'Testing expectations:',
      ...renderList(model.testingExpectations, 'No project-specific testing expectations were provided.'),
      'Validation expectations:',
      ...renderList(model.validationExpectations, 'No additional validation expectations were provided.'),
      '- Treat failures as evidence: report the failing command or contract, preserve error details, and do not claim success.',
      '- Do not weaken tests, validators, or safety boundaries to make a change pass.',
    ]),
    ...renderSection('Setup guidance', renderCommands(composedCommands(model, 'setup'))),
    ...renderSection('Validation guidance', renderCommands(composedCommands(model, 'validation'))),
    ...renderSection('Git safety', [
      '- Preserve unrelated work and inspect repository status before editing or committing.',
      '- Do not use destructive reset, restore, clean, rebase, force-push, or broad staging commands without explicit authorization.',
      '- Stage only intended files and review the staged diff before committing.',
    ]),
    ...renderSection('Documentation and final reporting', [
      '- Keep documentation aligned with implemented behavior and preserve historical/current/planned distinctions.',
      '- Report files changed, behavior implemented, tests and validation commands with outcomes, remaining risks, and the exact next action.',
      '- Never report validation, publication, or release success without direct evidence.',
    ]),
    ...renderSection('Uncertainty and stop rules', [
      ...renderList(model.unresolvedDecisions, 'No unresolved decisions were recorded in the bootstrap bundle.'),
      '- When required facts remain unresolved or existing contracts conflict, stop and report the gap instead of guessing or broadening scope.',
    ]),
  ];

  return normalizeRenderedLines(lines);
}

export function renderGreenfieldClaudeTxt(model: GreenfieldProjectInstructionModel): string {
  const lines = [
    '# Claude Code operating guide',
    '',
    'Read `agents.txt` before making changes; it is the detailed operating manual derived from the same project facts as this guide.',
    '',
    ...renderSection('Project and scope', [
      `Project: ${model.projectName ?? NOT_PROVIDED}`,
      `Purpose: ${model.productGoal ?? NOT_PROVIDED}`,
      `Core workflow: ${model.coreWorkflow ?? NOT_PROVIDED}`,
      'Non-goals:',
      ...renderList(model.nonGoals, 'No explicit non-goals were provided; do not invent them.'),
    ]),
    ...renderSection('Critical boundaries', [
      '- Follow existing architecture and the selected profile; do not choose a stack by reparsing the raw request.',
      '- Use my-dev-kit for bounded retrieval and my-dev-kit-orchestrator for workflow guidance when those tools are available.',
      '- The orchestrator does not run project commands or prove that setup, tests, validation, security checks, or publication succeeded.',
      '- Preserve unrelated Git work and stop rather than guessing across an unresolved product or architecture boundary.',
    ]),
    ...renderSection('First working steps', [
      '1. Read agents.txt and current project documentation.',
      '2. Inspect repository status and retrieve the narrow owners/contracts involved.',
      '3. Implement the smallest cohesive change through existing architecture.',
      '4. Run applicable setup, test, and validation guidance yourself; record real outcomes.',
      '5. Review the diff and report files, behavior, evidence, risks, and the next action.',
    ]),
    ...renderSection('Selected profile and stack', renderProfileSummary(model)),
    ...renderCapabilitySection(model.capability),
    ...renderSection('Setup guidance', renderCommands(composedCommands(model, 'setup'))),
    ...renderSection('Validation and testing', [
      ...renderCommands(composedCommands(model, 'validation')),
      'Testing expectations:',
      ...renderList(model.testingExpectations, 'No project-specific testing expectations were provided.'),
    ]),
    ...renderSection('Reporting and uncertainty', [
      '- Report actual command outcomes; never convert guidance into a success claim.',
      '- Record unresolved facts and stop for required decisions rather than fabricating project capabilities.',
      ...renderList(model.unresolvedDecisions, 'No unresolved decisions were recorded in the bootstrap bundle.'),
    ]),
  ];

  return normalizeRenderedLines(lines);
}

function buildProfileModel(bundle: GreenfieldBootstrapBundle): GreenfieldProjectInstructionProfileModel {
  const selection = bundle.selectedProfile;
  const profile = selection.status === 'selected' ? selection.profile : undefined;

  return {
    status: selection.status,
    requestedProfileId: nonblank(selection.requestedProfileId),
    reason: selection.reason,
    profileId: profile?.id,
    displayName: profile?.displayName,
    category: profile?.category,
    supportedProjectKind: profile?.supportedProjectKind,
    stackAssumptions: profile ? dedupeStable(profile.stackAssumptions) : [],
    setupCommands: profile ? copyCommands(profile.setupCommands) : [],
    validationCommands: profile ? copyCommands(profile.validationCommands) : [],
    unsupportedConditions: profile ? dedupeStable(profile.unsupportedConditions) : [],
    notesForBootstrapBundle: nonblank(profile?.notesForBootstrapBundle),
  };
}

function buildCapabilityModel(bundle: GreenfieldBootstrapBundle): GreenfieldProjectInstructionCapabilityModel {
  const selection = bundle.fullstackCapability;
  const capability = selection.status === 'selected' ? selection.capability : undefined;

  return {
    status: selection.status,
    reason: selection.reason,
    projectType: capability?.projectType,
    webFramework: capability?.webFramework,
    starterProfile: capability?.starterProfile,
    setupCommands: capability ? copyCommands(capability.setupCommands) : [],
    validationCommands: capability ? copyCommands(capability.validationCommands) : [],
    lifecycleResponsibilities:
      capability?.lifecycleResponsibilities.map(
        (responsibility) =>
          `${responsibility.operation} (${responsibility.phase}): ${responsibility.description}`,
      ) ?? [],
    documentResponsibilities:
      capability?.documentResponsibilities.map(
        (responsibility) => `${responsibility.document}: ${responsibility.responsibility}`,
      ) ?? [],
  };
}

function renderProfileSummary(model: GreenfieldProjectInstructionModel): string[] {
  const profile = model.profile;
  if (profile.status !== 'selected' || !profile.profileId) {
    return [
      `Profile selection: ${profile.status}.`,
      `Reason: ${profile.reason}`,
      profile.requestedProfileId ? `Requested profile: ${profile.requestedProfileId}` : 'Requested profile: not provided.',
      'No profile-specific stack or command guidance is assumed.',
    ];
  }

  return [
    `Selected profile: ${profile.displayName ?? profile.profileId} (${profile.profileId}).`,
    `Supported project kind: ${profile.supportedProjectKind ?? NOT_PROVIDED}`,
    'Selected stack:',
    ...renderList(model.selectedStack, 'The selected profile did not declare a stack.'),
    'Profile stack assumptions:',
    ...renderList(profile.stackAssumptions, 'The selected profile did not declare additional stack assumptions.'),
    'Unsupported conditions:',
    ...renderList(profile.unsupportedConditions, 'The selected profile did not declare unsupported conditions.'),
  ];
}

function renderCapabilitySection(capability: GreenfieldProjectInstructionCapabilityModel): string[] {
  if (capability.status !== 'selected' || !capability.projectType) {
    if (capability.status === 'unsupported') {
      return renderSection('Optional capability boundary', [
        'Capability status: unsupported.',
        `Reason: ${capability.reason}`,
        'Do not claim or implement the unsupported capability without a new approved design.',
      ]);
    }
    return [];
  }

  return renderSection('Selected optional capability', [
    `Project type: ${capability.projectType}`,
    `Web framework: ${capability.webFramework ?? NOT_PROVIDED}`,
    `Starter profile contract: ${capability.starterProfile ?? NOT_PROVIDED}`,
    'Lifecycle responsibilities:',
    ...renderList(capability.lifecycleResponsibilities, 'No lifecycle responsibilities were declared.'),
    'Documentation responsibilities:',
    ...renderList(capability.documentResponsibilities, 'No documentation responsibilities were declared.'),
  ]);
}

function composedCommands(
  model: GreenfieldProjectInstructionModel,
  kind: 'setup' | 'validation',
): readonly GreenfieldProfileCommand[] {
  const profileCommands = kind === 'setup' ? model.profile.setupCommands : model.profile.validationCommands;
  const capabilityCommands =
    kind === 'setup' ? model.capability.setupCommands : model.capability.validationCommands;
  const seen = new Set<string>();

  return [...profileCommands, ...capabilityCommands].filter((entry) => {
    if (seen.has(entry.command)) return false;
    seen.add(entry.command);
    return true;
  });
}

function renderCommands(commands: readonly GreenfieldProfileCommand[]): string[] {
  if (commands.length === 0) {
    return ['No commands are declared for this category; do not invent a default command.'];
  }

  return [
    'These are instructions for a coding agent or user to run and verify; they are not orchestrator execution evidence.',
    ...commands.map((entry) => {
      const requirement = entry.required ? 'required' : 'optional';
      const environment = entry.environmentNotes ? ` Environment: ${entry.environmentNotes}` : '';
      return `- \`${entry.command}\` (${requirement}) — ${entry.purpose}.${environment}`;
    }),
  ];
}

function renderSection(title: string, content: readonly string[]): string[] {
  return [`## ${title}`, '', ...content, ''];
}

function renderList(values: readonly string[], emptyMessage: string): string[] {
  return values.length > 0 ? values.map((value) => `- ${value}`) : [`- ${emptyMessage}`];
}

function normalizeRenderedLines(lines: readonly string[]): string {
  return `${lines.join('\n').trim()}\n`;
}

function copyCommands(commands: readonly GreenfieldProfileCommand[]): GreenfieldProfileCommand[] {
  return commands.map((entry) => ({ ...entry }));
}

function nonblank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function dedupeStable(values: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const rawValue of values) {
    const value = rawValue.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}
