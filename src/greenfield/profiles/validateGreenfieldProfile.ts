// v1.3.0 Batch 1/2 shared profile-local validator. Validates one
// GreenfieldProfile value in isolation: required top-level fields, allowed
// shapes, unsupported extension fields (Batch 1), and setupCommands/
// validationCommands entry-level contracts -- required/blank fields,
// required-vs-optional classification, and duplicate command text (Batch 2).
// Target-pattern/scaffold-plan contracts remain Batch 3 scope -- see
// PseudocodePacket PSE-017 and the v1.3.0 Batch 0 design report, Batch 1/2
// sections. Never throws for expected/malformed input; never mutates the
// profile it validates.
import { GREENFIELD_DOCUMENTATION_TERMINOLOGY_TAGS, GreenfieldProfile, GreenfieldProfileCommand } from './profileTypes';
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

// Required present as an array of strings; may be empty (most profiles use
// no special documentation terminology).
const OPTIONAL_EMPTY_STRING_ARRAY_CONTRACTS: readonly string[] = ['allowedDocumentationTerminology'];

// Required present as an array (each entry is a GreenfieldProfileCommand
// object, not a string); must be non-empty, per PseudocodePacket "required
// arrays are nonempty except explicitly valid empty setupCommands".
const REQUIRED_NONEMPTY_COMMAND_ARRAY_CONTRACTS: readonly string[] = ['validationCommands'];

// Required present as an array; may be empty (e.g. android-compose declares
// no setup step because the Gradle wrapper needs none).
const OPTIONAL_EMPTY_COMMAND_ARRAY_CONTRACTS: readonly string[] = ['setupCommands'];

const COMMAND_ARRAY_CONTRACTS: readonly string[] = [
  ...REQUIRED_NONEMPTY_COMMAND_ARRAY_CONTRACTS,
  ...OPTIONAL_EMPTY_COMMAND_ARRAY_CONTRACTS,
];

const KNOWN_COMMAND_FIELDS: ReadonlySet<string> = new Set(['command', 'purpose', 'required', 'environmentNotes']);

// v1.3.0 Batch 2 correction: TypeScript's GreenfieldDocumentationTerminologyTag
// union protects built-in profile literals at compile time but not runtime/
// externally-constructed profile objects; this closed-set membership check
// covers that gap. Derived from the single canonical declaration in
// profileTypes.ts -- do not duplicate the tag list here.
const KNOWN_DOCUMENTATION_TERMINOLOGY_TAGS: ReadonlySet<string> = new Set(GREENFIELD_DOCUMENTATION_TERMINOLOGY_TAGS);

const KNOWN_PROFILE_FIELDS: ReadonlySet<string> = new Set([
  ...REQUIRED_TEXT_CONTRACTS,
  ...REQUIRED_NONEMPTY_STRING_ARRAY_CONTRACTS,
  ...OPTIONAL_EMPTY_STRING_ARRAY_CONTRACTS,
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

  for (const contract of OPTIONAL_EMPTY_STRING_ARRAY_CONTRACTS) {
    validateOptionalStringArray(record, contract, profileId, issues);
  }

  validateDocumentationTerminology(record, profileId, issues);

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

  validateCommandArrays(record, profileId, issues);

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

function validateOptionalStringArray(
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
  if (!Array.isArray(value)) {
    issues.push(emptyFieldIssue(profileId, contract));
    return;
  }
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      issues.push(emptyFieldIssue(profileId, `${contract}[${index}]`));
    }
  });
}

// v1.3.0 Batch 2 correction: rejects unsupported and duplicate
// allowedDocumentationTerminology entries. Blank/non-string entries are
// already reported by validateOptionalStringArray above and are skipped
// here to avoid a redundant issue for the same malformed entry.
function validateDocumentationTerminology(
  record: Record<string, unknown>,
  profileId: string,
  issues: ProfileValidationIssue[],
): void {
  const value = record['allowedDocumentationTerminology'];
  if (!Array.isArray(value)) {
    return; // already reported by validateOptionalStringArray
  }

  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      return; // already reported by validateOptionalStringArray
    }
    if (!KNOWN_DOCUMENTATION_TERMINOLOGY_TAGS.has(entry)) {
      issues.push(unsupportedTerminologyTagIssue(profileId, index, entry));
    }
    if (seen.has(entry)) {
      issues.push(duplicateTerminologyTagIssue(profileId, index, entry));
    }
    seen.add(entry);
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

// Reuses GF_PROFILE_UNSUPPORTED_FIELD (no Batch 0-approved terminology-
// specific code exists) rather than inventing a new issue code.
function unsupportedTerminologyTagIssue(profileId: string, index: number, value: string): ProfileValidationIssue {
  const supported = GREENFIELD_DOCUMENTATION_TERMINOLOGY_TAGS.join(', ');
  return {
    code: 'GF_PROFILE_UNSUPPORTED_FIELD',
    severity: 'warning',
    profileId,
    affectedContract: 'allowedDocumentationTerminology',
    reason: `Documentation terminology tag "${value}" is not part of the supported vocabulary.`,
    correctiveAction: `Use one of the supported tags (${supported}), or extend GREENFIELD_DOCUMENTATION_TERMINOLOGY in profileTypes.ts for a genuinely new documentation domain.`,
    evidenceKey: `allowedDocumentationTerminology[${index}]:unsupported:${value}`,
    expected: supported,
    actual: value,
  };
}

function duplicateTerminologyTagIssue(profileId: string, index: number, value: string): ProfileValidationIssue {
  return {
    code: 'GF_PROFILE_UNSUPPORTED_FIELD',
    severity: 'warning',
    profileId,
    affectedContract: 'allowedDocumentationTerminology',
    reason: `Documentation terminology tag "${value}" is declared more than once.`,
    correctiveAction: 'Remove the duplicate tag so each terminology tag appears at most once.',
    evidenceKey: `allowedDocumentationTerminology[${index}]:duplicate:${value}`,
    actual: value,
  };
}

// ─── Command-array validation (Batch 2: TST-009, TST-010, TST-011) ──────────

interface CommandLocation {
  readonly arrayName: string;
  readonly index: number;
  readonly contract: string;
  readonly command: GreenfieldProfileCommand;
}

function validateCommandArrays(
  record: Record<string, unknown>,
  profileId: string,
  issues: ProfileValidationIssue[],
): void {
  const locations: CommandLocation[] = [];

  for (const arrayName of COMMAND_ARRAY_CONTRACTS) {
    const value = record[arrayName];
    if (!Array.isArray(value)) {
      continue; // already reported by validateRequiredArrayPresence
    }
    value.forEach((entry, index) => {
      const contract = `${arrayName}[${index}]`;
      validateCommandShape(entry, arrayName, contract, profileId, issues);
      if (entry && typeof entry === 'object') {
        locations.push({ arrayName, index, contract, command: entry as GreenfieldProfileCommand });
      }
    });
  }

  validateDuplicateCommands(locations, profileId, issues);
}

function validateCommandShape(
  entry: unknown,
  arrayName: string,
  contract: string,
  profileId: string,
  issues: ProfileValidationIssue[],
): void {
  if (entry === null || entry === undefined || typeof entry !== 'object' || Array.isArray(entry)) {
    issues.push(commandMalformedIssue(profileId, contract, 'Command entry is missing or not an object.'));
    return;
  }

  const commandRecord = entry as Record<string, unknown>;

  const commandText = commandRecord['command'];
  if (typeof commandText !== 'string' || commandText.trim().length === 0) {
    issues.push(commandMalformedIssue(profileId, `${contract}.command`, 'Command text is missing or blank.'));
  }

  const purpose = commandRecord['purpose'];
  if (typeof purpose !== 'string' || purpose.trim().length === 0) {
    issues.push(commandMalformedIssue(profileId, `${contract}.purpose`, 'Command purpose is missing or blank.'));
  }

  const required = commandRecord['required'];
  if (typeof required !== 'boolean') {
    issues.push(
      commandClassificationInvalidIssue(
        profileId,
        `${contract}.required`,
        'Command "required" must be an explicit boolean.',
      ),
    );
  } else if (required === false) {
    const environmentNotes = commandRecord['environmentNotes'];
    if (typeof environmentNotes !== 'string' || environmentNotes.trim().length === 0) {
      issues.push(
        commandClassificationInvalidIssue(
          profileId,
          `${contract}.environmentNotes`,
          'An optional command must declare a non-blank environmentNotes explaining the prerequisite that makes it optional.',
        ),
      );
    }
  }

  for (const key of Object.keys(commandRecord)) {
    if (!KNOWN_COMMAND_FIELDS.has(key)) {
      issues.push(unsupportedFieldIssue(profileId, `${arrayName} entry field "${key}" (${contract}.${key})`));
    }
  }
}

function validateDuplicateCommands(
  locations: readonly CommandLocation[],
  profileId: string,
  issues: ProfileValidationIssue[],
): void {
  const groups = new Map<string, CommandLocation[]>();
  for (const location of locations) {
    const commandText = location.command?.command;
    if (typeof commandText !== 'string' || commandText.trim().length === 0) {
      continue; // already reported as GF_COMMAND_MALFORMED
    }
    const key = commandText.trim();
    const group = groups.get(key);
    if (group) {
      group.push(location);
    } else {
      groups.set(key, [location]);
    }
  }

  for (const [commandText, group] of groups) {
    if (group.length <= 1) {
      continue;
    }
    const conflicting = group.some(
      (location) =>
        location.command.purpose !== group[0].command.purpose || location.command.required !== group[0].command.required,
    );
    // TST-010: exactly one GF_COMMAND_DUPLICATE issue per duplicate command
    // group, with a stable evidenceKey -- not one per participant (unlike
    // the registry-wide duplicate-id/alias checks, which must show every
    // participant).
    issues.push(commandDuplicateIssue(profileId, group, commandText, conflicting));
  }
}

function commandMalformedIssue(profileId: string, contract: string, reason: string): ProfileValidationIssue {
  return {
    code: 'GF_COMMAND_MALFORMED',
    severity: 'error',
    profileId,
    affectedContract: contract,
    reason,
    correctiveAction: 'Provide a well-formed { command, purpose, required } command entry.',
    evidenceKey: contract,
  };
}

function commandClassificationInvalidIssue(profileId: string, contract: string, reason: string): ProfileValidationIssue {
  return {
    code: 'GF_COMMAND_CLASSIFICATION_INVALID',
    severity: 'error',
    profileId,
    affectedContract: contract,
    reason,
    correctiveAction:
      'Set "required" to an explicit boolean, and give every optional command a non-blank environmentNotes explaining its prerequisite.',
    evidenceKey: contract,
  };
}

function commandDuplicateIssue(
  profileId: string,
  group: readonly CommandLocation[],
  commandText: string,
  conflicting: boolean,
): ProfileValidationIssue {
  const locations = group.map((location) => location.contract).join(', ');
  return {
    code: 'GF_COMMAND_DUPLICATE',
    severity: conflicting ? 'error' : 'warning',
    profileId,
    affectedContract: group[0].contract,
    reason: conflicting
      ? `Command "${commandText}" is declared ${group.length} times (${locations}) with differing purpose/required values.`
      : `Command "${commandText}" is declared ${group.length} times (${locations}).`,
    correctiveAction: 'Remove the duplicate command entry or consolidate it into a single declaration.',
    evidenceKey: commandText,
  };
}
