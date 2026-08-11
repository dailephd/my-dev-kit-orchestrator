import {
  GREENFIELD_AGENTS_ADAPTER_CONTENT,
  GREENFIELD_CLAUDE_ADAPTER_CONTENT,
  GREENFIELD_PROJECT_INSTRUCTION_PATHS,
  type GreenfieldProjectInstructionBundle,
  type GreenfieldProjectInstructionValidationIssue,
  type GreenfieldProjectInstructionValidationIssueCode,
  type GreenfieldProjectInstructionValidationResult,
} from './projectInstructionTypes';

const AUTONOMOUS_EXECUTION_CLAIM =
  /\b(?:my-dev-kit-orchestrator|the orchestrator)\s+(?:ran|executed|completed|passed|validated|built|tested|published)\b/i;

/** Validate the bounded four-target in-memory family without repairing it or performing I/O. */
export function validateGreenfieldProjectInstructionBundle(
  value: unknown,
): GreenfieldProjectInstructionValidationResult {
  const issues: GreenfieldProjectInstructionValidationIssue[] = [];
  if (!isRecord(value) || !Array.isArray(value.targets) || !isRecord(value.model)) {
    issues.push(
      issue(
        'GF_AGENT_INSTRUCTIONS_INVALID_RESULT',
        'bundle',
        'The value must contain an object model and a targets array.',
        'Pass the result returned by buildGreenfieldProjectInstructionBundle().',
      ),
    );
    return { valid: false, issues };
  }

  const targets = value.targets;
  const byPath = new Map<string, Array<{ index: number; content: string }>>();

  targets.forEach((target, index) => {
    if (!isRecord(target) || typeof target.path !== 'string' || typeof target.content !== 'string') {
      issues.push(
        issue(
          'GF_AGENT_INSTRUCTIONS_INVALID_TARGET',
          `targets[${index}]`,
          'Each target must contain string path and content fields.',
          'Replace the malformed entry with a generated project-instruction target.',
        ),
      );
      return;
    }

    const existing = byPath.get(target.path) ?? [];
    existing.push({ index, content: target.content });
    byPath.set(target.path, existing);

    if (!GREENFIELD_PROJECT_INSTRUCTION_PATHS.some((path) => path === target.path)) {
      issues.push(
        issue(
          'GF_AGENT_INSTRUCTIONS_UNEXPECTED_TARGET',
          `targets[${index}].path`,
          `Unexpected project-instruction target "${target.path}".`,
          'Remove it from this Batch 1 bundle; only the four approved paths belong here.',
        ),
      );
    }
    if (!target.content.trim()) {
      issues.push(
        issue(
          'GF_AGENT_INSTRUCTIONS_BLANK_CONTENT',
          target.path,
          `Project-instruction target "${target.path}" has blank content.`,
          'Render nonblank deterministic instruction content for the target.',
        ),
      );
    }
  });

  for (const [expectedIndex, path] of GREENFIELD_PROJECT_INSTRUCTION_PATHS.entries()) {
    const entries = byPath.get(path) ?? [];
    if (entries.length === 0) {
      issues.push(
        issue(
          'GF_AGENT_INSTRUCTIONS_MISSING_TARGET',
          path,
          `Required project-instruction target "${path}" is missing.`,
          `Generate exactly one "${path}" target.`,
        ),
      );
      continue;
    }
    if (entries.length > 1) {
      issues.push(
        issue(
          'GF_AGENT_INSTRUCTIONS_DUPLICATE_TARGET',
          path,
          `Project-instruction target "${path}" occurs ${entries.length} times.`,
          `Keep exactly one "${path}" target.`,
        ),
      );
    }
    if (entries[0].index !== expectedIndex) {
      issues.push(
        issue(
          'GF_AGENT_INSTRUCTIONS_TARGET_ORDER',
          path,
          `Project-instruction target "${path}" is not at canonical index ${expectedIndex}.`,
          'Order targets as agents.txt, claude.txt, AGENTS.md, CLAUDE.md.',
        ),
      );
    }
  }

  validateAdapter(byPath, 'AGENTS.md', GREENFIELD_AGENTS_ADAPTER_CONTENT, issues);
  validateAdapter(byPath, 'CLAUDE.md', GREENFIELD_CLAUDE_ADAPTER_CONTENT, issues);

  const claudeContent = byPath.get('claude.txt')?.[0]?.content;
  if (claudeContent !== undefined && !/read\s+[`'"@]?agents\.txt/i.test(claudeContent)) {
    issues.push(
      issue(
        'GF_AGENT_INSTRUCTIONS_CLAUDE_HANDOFF_MISSING',
        'claude.txt',
        'claude.txt must direct Claude Code to read agents.txt.',
        'Add a compact, explicit agents.txt handoff derived from the shared model.',
      ),
    );
  }

  for (const path of ['agents.txt', 'claude.txt'] as const) {
    const content = byPath.get(path)?.[0]?.content;
    if (content && AUTONOMOUS_EXECUTION_CLAIM.test(content)) {
      issues.push(
        issue(
          'GF_AGENT_INSTRUCTIONS_AUTONOMOUS_EXECUTION_CLAIM',
          path,
          `${path} contains an unsupported assertion that the orchestrator performed project work.`,
          'Describe commands as coding-agent/user guidance and report execution only from real external evidence.',
        ),
      );
    }
  }

  validateProfileState(value.model, issues);

  return { valid: issues.length === 0, issues };
}

function validateAdapter(
  targets: ReadonlyMap<string, Array<{ index: number; content: string }>>,
  path: 'AGENTS.md' | 'CLAUDE.md',
  expectedContent: string,
  issues: GreenfieldProjectInstructionValidationIssue[],
): void {
  const content = targets.get(path)?.[0]?.content;
  if (content !== undefined && content !== expectedContent) {
    issues.push(
      issue(
        'GF_AGENT_INSTRUCTIONS_ADAPTER_MISMATCH',
        path,
        `${path} does not match its deterministic adapter contract.`,
        'Restore the fixed small adapter that references @claude.txt and @agents.txt.',
      ),
    );
  }
}

function validateProfileState(
  model: Record<string, unknown>,
  issues: GreenfieldProjectInstructionValidationIssue[],
): void {
  const profile = model.profile;
  if (!isRecord(profile) || profile.status === 'selected') return;

  const hasSelectedFacts =
    typeof profile.profileId === 'string' ||
    typeof profile.displayName === 'string' ||
    nonemptyArray(profile.stackAssumptions) ||
    nonemptyArray(profile.setupCommands) ||
    nonemptyArray(profile.validationCommands) ||
    nonemptyArray(model.selectedStack);

  if (hasSelectedFacts) {
    issues.push(
      issue(
        'GF_AGENT_INSTRUCTIONS_PROFILE_STATE_MISMATCH',
        'model.profile',
        `Profile status "${String(profile.status)}" cannot carry selected-profile identity, stack, or commands.`,
        'Preserve the unresolved/unsupported reason and remove fabricated selected-profile facts.',
      ),
    );
  }
}

function nonemptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(
  code: GreenfieldProjectInstructionValidationIssueCode,
  affectedContract: string,
  reason: string,
  correctiveAction: string,
): GreenfieldProjectInstructionValidationIssue {
  return { code, affectedContract, reason, correctiveAction };
}

export type { GreenfieldProjectInstructionBundle };
