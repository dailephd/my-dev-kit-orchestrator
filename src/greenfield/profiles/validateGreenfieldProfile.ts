// v1.3.0 Batch 1 shared profile-local validator. Validates one GreenfieldProfile
// value in isolation (required top-level fields, allowed shapes, unsupported
// extension fields). Command-level and target-pattern contracts (duplicate
// commands, classification, target expectations) are Batch 2/3 scope --
// see PseudocodePacket PSE-017 and the v1.3.0 Batch 0 design report, Batch 1
// section. Never throws for expected/malformed input; never mutates the
// profile it validates.
import { GreenfieldProfile } from './profileTypes';
import { ProfileValidationIssue, ProfileValidationResult } from './profileValidationTypes';
import { finalizeProfileValidationResult } from './profileValidationOrdering';

const UNKNOWN_PROFILE_ID_SENTINEL = 'unresolved-profile';

const REQUIRED_TEXT_CONTRACTS: readonly string[] = [
  'id',
  'displayName',
  'category',
  'supportedProjectKind',
  'notesForBootstrapBundle',
];

// Required, must be a non-empty array of non-blank strings.
const REQUIRED_NONEMPTY_STRING_ARRAY_CONTRACTS: readonly string[] = [
  'stackAssumptions',
  'templateTargets',
  'documentationExpectations',
  'testExpectations',
  'validationExpectations',
  'scaffoldPlanningHints',
  'unsupportedConditions',
];

// Required present as an array (each entry is a GreenfieldProfileCommand
// object, not a string); must be non-empty, per PseudocodePacket "required
// arrays are nonempty except explicitly valid empty setupCommands".
const REQUIRED_NONEMPTY_COMMAND_ARRAY_CONTRACTS: readonly string[] = ['validationCommands'];

// Required present as an array; may be empty (e.g. android-compose declares
// no setup step because the Gradle wrapper needs none).
const OPTIONAL_EMPTY_COMMAND_ARRAY_CONTRACTS: readonly string[] = ['setupCommands'];

const KNOWN_PROFILE_FIELDS: ReadonlySet<string> = new Set([
  ...REQUIRED_TEXT_CONTRACTS,
  ...REQUIRED_NONEMPTY_STRING_ARRAY_CONTRACTS,
  ...REQUIRED_NONEMPTY_COMMAND_ARRAY_CONTRACTS,
  ...OPTIONAL_EMPTY_COMMAND_ARRAY_CONTRACTS,
]);

export function validateGreenfieldProfile(profile: GreenfieldProfile): ProfileValidationResult {
  const issues: ProfileValidationIssue[] = [];
  const record = profile as unknown as Record<string, unknown>;
  const profileId = resolveProfileIdForIssues(record);

  for (const contract of REQUIRED_TEXT_CONTRACTS) {
    validateRequiredText(record, contract, profileId, issues);
  }

  for (const contract of REQUIRED_NONEMPTY_STRING_ARRAY_CONTRACTS) {
    validateRequiredStringArray(record, contract, profileId, issues);
  }

  for (const contract of REQUIRED_NONEMPTY_COMMAND_ARRAY_CONTRACTS) {
    validateRequiredArrayPresence(record, contract, profileId, issues, { allowEmpty: false });
  }

  for (const contract of OPTIONAL_EMPTY_COMMAND_ARRAY_CONTRACTS) {
    validateRequiredArrayPresence(record, contract, profileId, issues, { allowEmpty: true });
  }

  for (const key of Object.keys(record ?? {})) {
    if (!KNOWN_PROFILE_FIELDS.has(key)) {
      issues.push(unsupportedFieldIssue(profileId, key));
    }
  }

  return finalizeProfileValidationResult(issues);
}

function resolveProfileIdForIssues(record: Record<string, unknown> | null | undefined): string {
  const id = record?.['id'];
  return typeof id === 'string' && id.trim().length > 0 ? id : UNKNOWN_PROFILE_ID_SENTINEL;
}

function validateRequiredText(
  record: Record<string, unknown>,
  contract: string,
  profileId: string,
  issues: ProfileValidationIssue[],
): void {
  const value = record[contract];
  if (value === undefined || value === null) {
    issues.push(missingFieldIssue(profileId, contract));
    return;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(emptyFieldIssue(profileId, contract));
  }
}

function validateRequiredStringArray(
  record: Record<string, unknown>,
  contract: string,
  profileId: string,
  issues: ProfileValidationIssue[],
): void {
  const value = record[contract];
  if (value === undefined || value === null) {
    issues.push(missingFieldIssue(profileId, contract));
    return;
  }
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(emptyFieldIssue(profileId, contract));
    return;
  }
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      issues.push(emptyFieldIssue(profileId, `${contract}[${index}]`));
    }
  });
}

function validateRequiredArrayPresence(
  record: Record<string, unknown>,
  contract: string,
  profileId: string,
  issues: ProfileValidationIssue[],
  options: { allowEmpty: boolean },
): void {
  const value = record[contract];
  if (value === undefined || value === null) {
    issues.push(missingFieldIssue(profileId, contract));
    return;
  }
  if (!Array.isArray(value)) {
    issues.push(emptyFieldIssue(profileId, contract));
    return;
  }
  if (!options.allowEmpty && value.length === 0) {
    issues.push(emptyFieldIssue(profileId, contract));
  }
}

function missingFieldIssue(profileId: string, contract: string): ProfileValidationIssue {
  return {
    code: 'GF_PROFILE_MISSING_FIELD',
    severity: 'error',
    profileId,
    affectedContract: contract,
    reason: `Profile is missing required field "${contract}".`,
    correctiveAction: `Add a value for "${contract}" to the profile definition.`,
    evidenceKey: contract,
  };
}

function emptyFieldIssue(profileId: string, contract: string): ProfileValidationIssue {
  return {
    code: 'GF_PROFILE_EMPTY_FIELD',
    severity: 'error',
    profileId,
    affectedContract: contract,
    reason: `Profile field "${contract}" is blank, empty, or the wrong shape.`,
    correctiveAction: `Provide a non-blank value with the expected shape for "${contract}".`,
    evidenceKey: contract,
  };
}

function unsupportedFieldIssue(profileId: string, fieldName: string): ProfileValidationIssue {
  return {
    code: 'GF_PROFILE_UNSUPPORTED_FIELD',
    severity: 'warning',
    profileId,
    affectedContract: fieldName,
    reason: `Profile declares field "${fieldName}", which is not part of the current profile contract.`,
    correctiveAction: `Remove "${fieldName}" or register it in the shared profile extension allowlist.`,
    evidenceKey: fieldName,
  };
}
