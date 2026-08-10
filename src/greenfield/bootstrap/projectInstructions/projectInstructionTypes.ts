import type { GreenfieldProfileCommand, GreenfieldProfileResolutionStatus } from '../../profiles/profileTypes';
import type { GreenfieldFullstackCapabilityStatus } from '../../fullstack/resolveFullstackCapability';

/** Generated-project coding-agent files. These are not canonical public project documents. */
export const GREENFIELD_PROJECT_INSTRUCTION_PATHS = [
  'agents.txt',
  'claude.txt',
  'AGENTS.md',
  'CLAUDE.md',
] as const;

export type GreenfieldProjectInstructionPath = (typeof GREENFIELD_PROJECT_INSTRUCTION_PATHS)[number];

export const GREENFIELD_AGENTS_ADAPTER_CONTENT =
  '# Coding Agents project instructions\n\nRead and follow:\n\n@claude.txt\n@agents.txt\n';

export const GREENFIELD_CLAUDE_ADAPTER_CONTENT =
  '# Claude Code project instructions\n\nRead and follow:\n\n@claude.txt\n@agents.txt\n';

export interface GreenfieldProjectInstructionProfileModel {
  status: GreenfieldProfileResolutionStatus;
  requestedProfileId?: string;
  reason: string;
  profileId?: string;
  displayName?: string;
  category?: string;
  supportedProjectKind?: string;
  stackAssumptions: readonly string[];
  setupCommands: readonly GreenfieldProfileCommand[];
  validationCommands: readonly GreenfieldProfileCommand[];
  unsupportedConditions: readonly string[];
  notesForBootstrapBundle?: string;
}

export interface GreenfieldProjectInstructionCapabilityModel {
  status: GreenfieldFullstackCapabilityStatus;
  reason: string;
  projectType?: string;
  webFramework?: string;
  starterProfile?: string;
  setupCommands: readonly GreenfieldProfileCommand[];
  validationCommands: readonly GreenfieldProfileCommand[];
  lifecycleResponsibilities: readonly string[];
  documentResponsibilities: readonly string[];
}

/** The single normalized fact source used by both lower-case instruction renderers. */
export interface GreenfieldProjectInstructionModel {
  rawIdea: string;
  projectName?: string;
  productGoal?: string;
  usersOrAudience?: string;
  coreWorkflow?: string;
  constraints: readonly string[];
  nonGoals: readonly string[];
  documentationPreferences: readonly string[];
  testingExpectations: readonly string[];
  validationExpectations: readonly string[];
  unresolvedDecisions: readonly string[];
  selectedStack: readonly string[];
  profile: GreenfieldProjectInstructionProfileModel;
  capability: GreenfieldProjectInstructionCapabilityModel;
}

export interface GreenfieldProjectInstructionTarget {
  path: GreenfieldProjectInstructionPath;
  content: string;
}

/** Pure in-memory generated-project content; not an orchestrator native artifact. */
export interface GreenfieldProjectInstructionBundle {
  model: GreenfieldProjectInstructionModel;
  targets: readonly GreenfieldProjectInstructionTarget[];
}

export type GreenfieldProjectInstructionValidationIssueCode =
  | 'GF_AGENT_INSTRUCTIONS_INVALID_RESULT'
  | 'GF_AGENT_INSTRUCTIONS_INVALID_TARGET'
  | 'GF_AGENT_INSTRUCTIONS_MISSING_TARGET'
  | 'GF_AGENT_INSTRUCTIONS_DUPLICATE_TARGET'
  | 'GF_AGENT_INSTRUCTIONS_UNEXPECTED_TARGET'
  | 'GF_AGENT_INSTRUCTIONS_TARGET_ORDER'
  | 'GF_AGENT_INSTRUCTIONS_BLANK_CONTENT'
  | 'GF_AGENT_INSTRUCTIONS_ADAPTER_MISMATCH'
  | 'GF_AGENT_INSTRUCTIONS_CLAUDE_HANDOFF_MISSING'
  | 'GF_AGENT_INSTRUCTIONS_AUTONOMOUS_EXECUTION_CLAIM'
  | 'GF_AGENT_INSTRUCTIONS_PROFILE_STATE_MISMATCH';

export interface GreenfieldProjectInstructionValidationIssue {
  code: GreenfieldProjectInstructionValidationIssueCode;
  affectedContract: string;
  reason: string;
  correctiveAction: string;
}

export interface GreenfieldProjectInstructionValidationResult {
  valid: boolean;
  issues: readonly GreenfieldProjectInstructionValidationIssue[];
}
