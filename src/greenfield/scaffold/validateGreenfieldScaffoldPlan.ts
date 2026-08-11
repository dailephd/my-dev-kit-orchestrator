// v1.3.0 Batch 3 (PseudocodePacket PSE-019): validates a generated
// GreenfieldScaffoldPlan against the selected profile's approved target and
// command expectations. Lexical-only: no filesystem access, no command
// execution, no project generation. Does not mutate its inputs. Reuses the
// shared Batch 1 issue model (ProfileValidationIssue / finalizeProfileValidationResult)
// -- this is not a second issue architecture.
//
// Not wired into lifecycle/status/check/RunIntegrityGate; that integration
// is Batch 4 scope. This function is a pure, self-contained boundary Batch 4
// can call once that wiring is designed.
//
// v1.3.1 Batch 4: accepts an optional resolved GreenfieldFullstackCapability.
// When present, its targetExpectations/setupCommands/validationCommands are
// composed additively with the selected profile's own (never replacing
// them), and the same target/command validation logic below runs over the
// composed sets -- this is why GF_TARGET_REQUIRED_MISSING and
// GF_PLAN_COMMAND_MISSING already cover "missing full-stack target/command"
// without a second issue family. One new profile/capability-alignment check
// and one destructive-command guard are added; both reuse the existing
// GF_FULLSTACK_ prefix from Batch 3.
import { GreenfieldProfile, GreenfieldProfileCommand, GreenfieldTargetExpectation } from '../profiles/profileTypes';
import { GreenfieldFullstackCapability } from '../fullstack/fullstackCapabilityTypes';
import { ProfileValidationIssue, ScaffoldPlanValidationResult } from '../profiles/profileValidationTypes';
import { finalizeProfileValidationResult } from '../profiles/profileValidationOrdering';
import { normalizeTargetPath, isAbsolutePathFailure } from '../profiles/targetPathSafety';
import { matchesBoundedPattern, matchesExact, validateBoundedPatternSyntax } from '../profiles/targetPatternMatching';
import { SUPPORTED_PROFILES } from '../profiles/resolveGreenfieldProfile';
import { GreenfieldScaffoldPlan } from './scaffoldPlanTypes';
import { composeEffectiveGreenfieldTargetExpectations } from './effectiveTargetExpectations';

export interface ValidateGreenfieldScaffoldPlanOptions {
  /** Other known profiles used for cross-profile target-ownership detection. Defaults to the built-in registry minus the selected profile. */
  readonly registryProfiles?: readonly GreenfieldProfile[];
  /**
   * v1.3.1 Batch 4: the resolved full-stack capability, when the bundle's
   * `fullstackCapability.status === 'selected'`. Omitted (or undefined) for
   * every ordinary non-full-stack plan, which then validates exactly as
   * before Batch 4.
   */
  readonly capability?: GreenfieldFullstackCapability;
}

interface NormalizedPlanTarget {
  readonly raw: string;
  readonly normalized: string;
  readonly contract: string;
}

export function validateGreenfieldScaffoldPlan(
  profile: GreenfieldProfile,
  plan: GreenfieldScaffoldPlan,
  options: ValidateGreenfieldScaffoldPlanOptions = {},
): ScaffoldPlanValidationResult {
  const issues: ProfileValidationIssue[] = [];
  const profileId = profile.id;
  const capability = options.capability;

  validatePlanProfileIdentity(profile, plan, profileId, issues);
  validateCapabilityProfileAlignment(profile, capability, profileId, issues);
  validateNoDestructiveProductionPlanCommands(capability, profileId, issues);

  const ownTargetExpectations = composeEffectiveGreenfieldTargetExpectations(profile, capability);
  const ownSetupCommands = composeCommands(profile.setupCommands, capability?.setupCommands);
  const ownValidationCommands = composeCommands(profile.validationCommands, capability?.validationCommands);

  const normalizedTargets = normalizePlanTargets(plan, profileId, issues);
  validateRequiredAndAmbiguousTargets(ownTargetExpectations, normalizedTargets, profileId, issues);
  validateUnsupportedCrossProfileTargets(profile, ownTargetExpectations, normalizedTargets, profileId, options, issues);
  validateDuplicatePlanTargets(normalizedTargets, profileId, issues);

  validateRequiredCommands(ownSetupCommands, plan.setupCommands, 'setupCommands', profileId, issues);
  validateRequiredCommands(ownValidationCommands, plan.validationCommands, 'validationCommands', profileId, issues);
  validateCommandClassificationContradictions(ownSetupCommands, ownValidationCommands, plan, profileId, issues);
  validateContradictoryCompletionClaims(plan, profileId, issues);

  return finalizeProfileValidationResult(issues);
}

// ─── v1.3.1 Batch 4: profile + capability composition ────────────────────

function composeCommands(
  profileCommands: readonly GreenfieldProfileCommand[],
  capabilityCommands: readonly GreenfieldProfileCommand[] | undefined,
): readonly GreenfieldProfileCommand[] {
  return capabilityCommands && capabilityCommands.length > 0
    ? [...profileCommands, ...capabilityCommands]
    : profileCommands;
}

// v1.3.1 Batch 4: a resolved capability's `starterProfile` must match the
// plan's selected profile -- defense-in-depth alongside
// resolveFullstackCapability()'s own invariant (Batch 3), which already
// guarantees this in the ordinary bundle-building flow.
function validateCapabilityProfileAlignment(
  profile: GreenfieldProfile,
  capability: GreenfieldFullstackCapability | undefined,
  profileId: string,
  issues: ProfileValidationIssue[],
): void {
  if (!capability || capability.starterProfile === profile.id) {
    return;
  }
  issues.push({
    code: 'GF_FULLSTACK_PROFILE_MISMATCH',
    severity: 'error',
    profileId,
    affectedContract: 'capability.starterProfile',
    reason: `Resolved full-stack capability declares starterProfile "${capability.starterProfile}", which does not match the selected profile "${profile.id}".`,
    correctiveAction: 'Only compose the full-stack capability for the profile it was resolved for.',
    evidenceKey: 'capability.starterProfile',
    expected: profile.id,
    actual: capability.starterProfile,
  });
}

// v1.3.1 Batch 4: defense-in-depth mirror of
// validateFullstackCapability()'s equivalent check, re-run here so a plan
// composed with an externally-constructed/malformed capability cannot slip
// a destructive production command past scaffold-plan validation even if
// validateFullstackCapability() was skipped by the caller.
function validateNoDestructiveProductionPlanCommands(
  capability: GreenfieldFullstackCapability | undefined,
  profileId: string,
  issues: ProfileValidationIssue[],
): void {
  if (!capability) {
    return;
  }
  const allCommands = [...capability.setupCommands, ...capability.validationCommands];
  for (const command of allCommands) {
    if (command.destructive === true && command.lifecyclePhase === 'production') {
      issues.push({
        code: 'GF_FULLSTACK_UNSAFE_RESET_POLICY',
        severity: 'error',
        profileId,
        affectedContract: 'setupCommands,validationCommands',
        reason: `Command "${command.command}" is destructive and scoped to the production lifecycle phase, which is never a valid target.`,
        correctiveAction: 'Restrict destructive commands to development/test lifecycle phases only.',
        evidenceKey: `command:destructive-production:${command.command}`,
        actual: command.command,
      });
    }
  }
}

// ─── Profile identity ────────────────────────────────────────────────────

function validatePlanProfileIdentity(
  profile: GreenfieldProfile,
  plan: GreenfieldScaffoldPlan,
  profileId: string,
  issues: ProfileValidationIssue[],
): void {
  if (plan.profileId === profile.id) {
    return;
  }
  issues.push({
    code: 'GF_PLAN_PROFILE_MISMATCH',
    severity: 'error',
    profileId,
    affectedContract: 'plan.profileId',
    reason: plan.profileId
      ? `Scaffold plan declares profile "${plan.profileId}", which does not match the selected profile "${profile.id}".`
      : `Scaffold plan does not declare a profile id, but the selected profile is "${profile.id}".`,
    correctiveAction: 'Regenerate the scaffold plan for the selected profile, or select the profile the plan actually describes.',
    evidenceKey: 'plan.profileId',
    expected: profile.id,
    actual: plan.profileId ?? '(none)',
  });
}

// ─── Target normalization ────────────────────────────────────────────────

function normalizePlanTargets(
  plan: GreenfieldScaffoldPlan,
  profileId: string,
  issues: ProfileValidationIssue[],
): NormalizedPlanTarget[] {
  const result: NormalizedPlanTarget[] = [];
  plan.plannedFileGroups.forEach((group) => {
    group.filePaths.forEach((raw, index) => {
      const contract = `plannedFileGroups.${group.name}[${index}]`;
      const normalization = normalizeTargetPath(raw);
      if (!normalization.ok) {
        issues.push(planPathIssue(profileId, contract, raw, normalization.reason!));
        return;
      }
      result.push({ raw, normalized: normalization.normalized!, contract });
    });
  });
  return result;
}

function planPathIssue(
  profileId: string,
  contract: string,
  rawValue: string,
  reason: NonNullable<ReturnType<typeof normalizeTargetPath>['reason']>,
): ProfileValidationIssue {
  if (isAbsolutePathFailure(reason)) {
    return {
      code: 'GF_PATH_ABSOLUTE',
      severity: 'error',
      profileId,
      affectedContract: contract,
      reason: `Plan target "${rawValue}" is absolute or UNC/URI-qualified, which is not allowed.`,
      correctiveAction: 'Use a root-relative path with no drive letter, UNC prefix, URI scheme, or leading slash.',
      evidenceKey: contract,
      actual: rawValue,
    };
  }
  if (reason === 'traversal') {
    return {
      code: 'GF_PATH_TRAVERSAL',
      severity: 'error',
      profileId,
      affectedContract: contract,
      reason: `Plan target "${rawValue}" contains a parent-traversal ("..") segment, which is not allowed.`,
      correctiveAction: 'Remove the ".." segment so the path stays within the root-relative namespace.',
      evidenceKey: contract,
      actual: rawValue,
    };
  }
  return {
    code: 'GF_TARGET_UNSUPPORTED',
    severity: 'error',
    profileId,
    affectedContract: contract,
    reason: `Plan target "${rawValue}" is empty, blank, or malformed (${reason}) and cannot be matched against any expectation.`,
    correctiveAction: 'Remove or correct the malformed plan target.',
    evidenceKey: contract,
    actual: rawValue,
  };
}

// ─── Expectation matcher resolution (defensive re-validation) ───────────

/** Re-normalizes an expectation's own matcher value; returns undefined when malformed (already reported by validateGreenfieldProfile in the normal flow). */
function resolveExpectationNormalizedValue(expectation: GreenfieldTargetExpectation): string | undefined {
  const matcher = expectation?.matcher;
  if (!matcher || typeof matcher.value !== 'string') {
    return undefined;
  }
  if (matcher.kind === 'exact') {
    const normalization = normalizeTargetPath(matcher.value);
    return normalization.ok ? normalization.normalized : undefined;
  }
  if (matcher.kind === 'bounded-pattern') {
    const slashed = matcher.value.replace(/\\/g, '/');
    return validateBoundedPatternSyntax(slashed).ok ? slashed : undefined;
  }
  return undefined;
}

function expectationMatches(expectation: GreenfieldTargetExpectation, normalizedTarget: string): boolean {
  const expectedValue = resolveExpectationNormalizedValue(expectation);
  if (expectedValue === undefined) {
    return false;
  }
  return expectation.matcher.kind === 'exact'
    ? matchesExact(normalizedTarget, expectedValue)
    : matchesBoundedPattern(normalizedTarget, expectedValue);
}

// ─── Required / ambiguous target matching (PSE-007) ──────────────────────

function validateRequiredAndAmbiguousTargets(
  targetExpectations: readonly GreenfieldTargetExpectation[],
  normalizedTargets: readonly NormalizedPlanTarget[],
  profileId: string,
  issues: ProfileValidationIssue[],
): void {
  targetExpectations.forEach((expectation, index) => {
    const matches = normalizedTargets.filter((target) => expectationMatches(expectation, target.normalized));
    const contract = `profile.targetExpectations[${index}]:${expectation.id ?? index}`;

    if (expectation.required && matches.length === 0) {
      issues.push({
        code: 'GF_TARGET_REQUIRED_MISSING',
        severity: 'error',
        profileId,
        affectedContract: contract,
        reason: `Required target expectation "${expectation.id}" (purpose: ${expectation.purpose}) has no matching plan target.`,
        correctiveAction: `Add a plan target matching "${expectation.matcher?.value}" (${expectation.matcher?.kind}).`,
        evidenceKey: expectation.id,
        expected: expectation.matcher?.value,
      });
      return;
    }

    if (expectation.required && matches.length > 1) {
      issues.push({
        code: 'GF_TARGET_AMBIGUOUS',
        severity: 'error',
        profileId,
        affectedContract: contract,
        reason: `Required target expectation "${expectation.id}" matches ${matches.length} plan targets (${matches.map((m) => m.raw).join(', ')}); a required singular expectation must match exactly one.`,
        correctiveAction: 'Remove the extra matching plan targets, or declare bounded multiplicity for this expectation if intentional.',
        evidenceKey: expectation.id,
      });
    }
  });
}

// ─── Unsupported cross-profile targets (PSE-009) ─────────────────────────

function validateUnsupportedCrossProfileTargets(
  profile: GreenfieldProfile,
  ownTargetExpectations: readonly GreenfieldTargetExpectation[],
  normalizedTargets: readonly NormalizedPlanTarget[],
  profileId: string,
  options: ValidateGreenfieldScaffoldPlanOptions,
  issues: ProfileValidationIssue[],
): void {
  const otherProfiles =
    options.registryProfiles ?? Object.values(SUPPORTED_PROFILES).filter((entry) => entry.id !== profile.id);

  for (const target of normalizedTargets) {
    const ownMatch = ownTargetExpectations.some((expectation) => expectationMatches(expectation, target.normalized));
    if (ownMatch) {
      continue;
    }

    const claimingProfile = otherProfiles.find((other) =>
      other.targetExpectations.some(
        (expectation) => expectation.matcher?.kind === 'exact' && expectationMatches(expectation, target.normalized),
      ),
    );
    if (!claimingProfile) {
      continue; // PSE-009: supplemental, harmless extra target -- not rejected.
    }

    issues.push({
      code: 'GF_TARGET_UNSUPPORTED',
      severity: 'error',
      profileId,
      affectedContract: target.contract,
      reason: `Plan target "${target.raw}" belongs only to profile "${claimingProfile.id}", not the selected profile "${profile.id}".`,
      correctiveAction: `Remove the target, or select profile "${claimingProfile.id}" if that is the intended profile.`,
      evidenceKey: target.normalized,
      actual: target.raw,
    });
  }
}

// ─── Duplicate plan targets ───────────────────────────────────────────────

function validateDuplicatePlanTargets(
  normalizedTargets: readonly NormalizedPlanTarget[],
  profileId: string,
  issues: ProfileValidationIssue[],
): void {
  const groups = new Map<string, NormalizedPlanTarget[]>();
  for (const target of normalizedTargets) {
    const group = groups.get(target.normalized);
    if (group) {
      group.push(target);
    } else {
      groups.set(target.normalized, [target]);
    }
  }

  for (const group of groups.values()) {
    if (group.length <= 1) {
      continue;
    }
    const contracts = group.map((target) => target.contract).join(', ');
    issues.push({
      code: 'GF_TARGET_DUPLICATE',
      severity: 'error',
      profileId,
      affectedContract: group[0].contract,
      reason: `Plan target "${group[0].normalized}" is declared more than once (${contracts}).`,
      correctiveAction: 'Remove the duplicate plan target.',
      evidenceKey: group[0].normalized,
    });
  }
}

// ─── Command conformance ──────────────────────────────────────────────────

function validateRequiredCommands(
  profileCommands: readonly GreenfieldProfileCommand[],
  planCommands: readonly GreenfieldProfileCommand[],
  contractName: 'setupCommands' | 'validationCommands',
  profileId: string,
  issues: ProfileValidationIssue[],
): void {
  const planCommandTexts = new Set(planCommands.map((c) => c.command));
  for (const profileCommand of profileCommands) {
    if (!profileCommand.required) {
      continue; // 14.3: an omitted optional command must not fail plan validation.
    }
    if (!planCommandTexts.has(profileCommand.command)) {
      issues.push({
        code: 'GF_PLAN_COMMAND_MISSING',
        severity: 'error',
        profileId,
        affectedContract: contractName,
        reason: `Required command "${profileCommand.command}" (${contractName}) is missing from the scaffold plan.`,
        correctiveAction: `Add "${profileCommand.command}" to the plan's ${contractName}.`,
        evidenceKey: `${contractName}:${profileCommand.command}`,
        expected: profileCommand.command,
      });
    }
  }
}

function validateCommandClassificationContradictions(
  ownSetupCommands: readonly GreenfieldProfileCommand[],
  ownValidationCommands: readonly GreenfieldProfileCommand[],
  plan: GreenfieldScaffoldPlan,
  profileId: string,
  issues: ProfileValidationIssue[],
): void {
  const profileCommandsByText = new Map<string, GreenfieldProfileCommand>();
  for (const command of [...ownSetupCommands, ...ownValidationCommands]) {
    profileCommandsByText.set(command.command, command);
  }

  const emitted = new Set<string>();
  const emitFlip = (planCommand: GreenfieldProfileCommand, contractName: string) => {
    const profileCommand = profileCommandsByText.get(planCommand.command);
    if (!profileCommand || profileCommand.required === planCommand.required) {
      return;
    }
    const key = `${contractName}:${planCommand.command}`;
    if (emitted.has(key)) {
      return;
    }
    emitted.add(key);
    issues.push({
      code: 'GF_PLAN_CONTRADICTORY_CLAIM',
      severity: 'error',
      profileId,
      affectedContract: contractName,
      reason: `Plan classifies command "${planCommand.command}" (${contractName}) as ${planCommand.required ? 'required' : 'optional'}, but the profile declares it ${profileCommand.required ? 'required' : 'optional'}.`,
      correctiveAction: `Match the plan's "required" classification for "${planCommand.command}" to the profile's declaration.`,
      evidenceKey: key,
      expected: String(profileCommand.required),
      actual: String(planCommand.required),
    });
  };

  plan.setupCommands.forEach((c) => emitFlip(c, 'setupCommands'));
  plan.validationCommands.forEach((c) => emitFlip(c, 'validationCommands'));

  // Same command declared in both plan sections with differing "required" values.
  const setupByText = new Map(plan.setupCommands.map((c) => [c.command, c] as const));
  for (const verificationCommand of plan.validationCommands) {
    const setupCommand = setupByText.get(verificationCommand.command);
    if (setupCommand && setupCommand.required !== verificationCommand.required) {
      const key = `cross-section:${verificationCommand.command}`;
      if (emitted.has(key)) {
        continue;
      }
      emitted.add(key);
      issues.push({
        code: 'GF_PLAN_CONTRADICTORY_CLAIM',
        severity: 'error',
        profileId,
        affectedContract: 'setupCommands,validationCommands',
        reason: `Command "${verificationCommand.command}" appears in both setupCommands and validationCommands with conflicting "required" values.`,
        correctiveAction: 'Declare the command in one section with one consistent "required" value.',
        evidenceKey: key,
      });
    }
  }
}

// ─── Contradictory completion/non-goal claims ────────────────────────────

function validateContradictoryCompletionClaims(
  plan: GreenfieldScaffoldPlan,
  profileId: string,
  issues: ProfileValidationIssue[],
): void {
  const nonGoals = new Set(plan.nonGoals.map((entry) => entry.trim()).filter((entry) => entry.length > 0));
  if (nonGoals.size === 0) {
    return;
  }
  const claimedComplete = [...plan.testExpectations, ...plan.documentationExpectations]
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  for (const claim of claimedComplete) {
    if (nonGoals.has(claim)) {
      issues.push({
        code: 'GF_PLAN_CONTRADICTORY_CLAIM',
        severity: 'error',
        profileId,
        affectedContract: 'nonGoals',
        reason: `Plan lists "${claim}" as both a non-goal and a testing/documentation expectation.`,
        correctiveAction: 'Remove the claim from nonGoals, or remove it from testExpectations/documentationExpectations -- it cannot be both.',
        evidenceKey: `nonGoals:${claim}`,
      });
    }
  }
}
