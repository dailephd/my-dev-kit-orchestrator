import type { StructuredArtifactIssue } from '../../artifactChecker';

type JsonObject = Record<string, unknown>;

const lifecycleStatuses = new Set(['complete', 'incomplete', 'blocked']);
const profileStatuses = new Set(['selected', 'unresolved', 'unsupported']);

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function missing(field: string): StructuredArtifactIssue {
  return { code: 'MISSING_FIELD', field, message: `Required JSON field "${field}" is missing` };
}

function invalid(field: string, expectation: string): StructuredArtifactIssue {
  return {
    code: 'INVALID_FIELD',
    field,
    message: `JSON field "${field}" must be ${expectation}`,
  };
}

function requireObject(value: unknown, field: string, issues: StructuredArtifactIssue[]): JsonObject | null {
  if (value === undefined) {
    issues.push(missing(field));
    return null;
  }
  if (!isObject(value)) {
    issues.push(invalid(field, 'an object'));
    return null;
  }
  return value;
}

function requireString(
  object: JsonObject,
  key: string,
  field: string,
  issues: StructuredArtifactIssue[],
): void {
  if (!(key in object)) issues.push(missing(field));
  else if (typeof object[key] !== 'string' || !object[key].trim()) {
    issues.push(invalid(field, 'a non-empty string'));
  }
}

function requireArray(
  object: JsonObject,
  key: string,
  field: string,
  issues: StructuredArtifactIssue[],
): void {
  if (!(key in object)) issues.push(missing(field));
  else if (!Array.isArray(object[key])) issues.push(invalid(field, 'an array'));
}

function validateBriefObject(value: unknown, prefix = ''): StructuredArtifactIssue[] {
  const issues: StructuredArtifactIssue[] = [];
  const object = requireObject(value, prefix || '$', issues);
  if (!object) return issues;

  requireString(object, 'rawIdea', `${prefix}rawIdea`, issues);
  for (const field of [
    'constraints',
    'nonGoals',
    'preferredStack',
    'documentationPreferences',
    'testingExpectations',
    'unresolved',
  ]) {
    requireArray(object, field, `${prefix}${field}`, issues);
  }
  return issues;
}

function validateProfileSelectionObject(
  value: unknown,
  prefix: string,
  allowLifecycleStatus: boolean,
): StructuredArtifactIssue[] {
  const issues: StructuredArtifactIssue[] = [];
  const object = requireObject(value, prefix.replace(/\.$/, ''), issues);
  if (!object) return issues;

  requireString(object, 'status', `${prefix}status`, issues);
  const status = object.status;
  const accepted = allowLifecycleStatus
    ? new Set([...profileStatuses, ...lifecycleStatuses])
    : profileStatuses;
  if (typeof status === 'string' && !accepted.has(status)) {
    issues.push(invalid(`${prefix}status`, `one of: ${[...accepted].join(', ')}`));
  }
  requireString(object, 'reason', `${prefix}reason`, issues);
  requireArray(object, 'stackDecisionNotes', `${prefix}stackDecisionNotes`, issues);

  if (status === 'selected' || status === 'complete') {
    const profile = requireObject(object.profile, `${prefix}profile`, issues);
    if (profile) requireString(profile, 'id', `${prefix}profile.id`, issues);
  }
  return issues;
}

export function validateIdeaBriefArtifact(value: unknown): StructuredArtifactIssue[] {
  const issues = validateBriefObject(value);
  if (!isObject(value)) return issues;
  requireString(value, 'status', 'status', issues);
  if (typeof value.status === 'string' && !lifecycleStatuses.has(value.status)) {
    issues.push(invalid('status', 'one of: complete, incomplete, blocked'));
  }
  return issues;
}

export function validateStarterProfileArtifact(value: unknown): StructuredArtifactIssue[] {
  return validateProfileSelectionObject(value, '', true);
}

export function validateBootstrapBundleArtifact(value: unknown): StructuredArtifactIssue[] {
  const issues: StructuredArtifactIssue[] = [];
  const object = requireObject(value, '$', issues);
  if (!object) return issues;

  requireString(object, 'status', 'status', issues);
  if (typeof object.status === 'string' && !lifecycleStatuses.has(object.status)) {
    issues.push(invalid('status', 'one of: complete, incomplete, blocked'));
  }

  issues.push(...validateBriefObject(object.normalizedBrief, 'normalizedBrief.'));
  issues.push(...validateProfileSelectionObject(object.selectedProfile, 'selectedProfile.', false));
  for (const field of ['starterProfile', 'stackDecision', 'docGenerationInstructions', 'scaffoldPlanningInputs', 'fullstackCapability']) {
    requireObject(object[field], field, issues);
  }
  for (const field of ['templateTargets', 'validationRules', 'unresolvedDecisions']) {
    requireArray(object, field, field, issues);
  }
  return issues;
}
