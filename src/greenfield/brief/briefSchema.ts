// Runtime validation for GreenfieldProjectBrief input.
//
// Adapted from my-dev-kit-alpha's src/newProject/briefSchema.ts
// (PORT_FROM_MY_DEV_KIT, see artifacts/greenfield-porting-map.txt). Only
// `rawIdea` is required; every other field is optional planning metadata, so
// this validator must not reject briefs that omit them (section 8.2: "Do not
// fail just because optional planning fields are absent").

import { GreenfieldProjectBrief } from './briefTypes';

export function validateGreenfieldProjectBrief(
  raw: unknown,
  sourceHint: string,
): GreenfieldProjectBrief {
  const obj = expectObject(raw, `greenfield brief from "${sourceHint}"`);

  return {
    rawIdea: validateNonEmptyString(obj.rawIdea, 'brief.rawIdea'),
    projectName: validateOptionalTrimmedString(obj.projectName, 'brief.projectName'),
    productGoal: validateOptionalTrimmedString(obj.productGoal, 'brief.productGoal'),
    usersOrAudience: validateOptionalTrimmedString(obj.usersOrAudience, 'brief.usersOrAudience'),
    coreWorkflow: validateOptionalTrimmedString(obj.coreWorkflow, 'brief.coreWorkflow'),
    constraints: validateOptionalStringArray(obj.constraints, 'brief.constraints'),
    nonGoals: validateOptionalStringArray(obj.nonGoals, 'brief.nonGoals'),
    preferredStack: validateOptionalStringArray(obj.preferredStack, 'brief.preferredStack'),
    preferredProfile: validateOptionalTrimmedString(obj.preferredProfile, 'brief.preferredProfile'),
    platformTarget: validateOptionalTrimmedString(obj.platformTarget, 'brief.platformTarget'),
    projectType: validateOptionalTrimmedString(obj.projectType, 'brief.projectType'),
    webFramework: validateOptionalTrimmedString(obj.webFramework, 'brief.webFramework'),
    documentationPreferences: validateOptionalStringArray(
      obj.documentationPreferences,
      'brief.documentationPreferences',
    ),
    testingExpectations: validateOptionalStringArray(
      obj.testingExpectations,
      'brief.testingExpectations',
    ),
  };
}

function validateOptionalStringArray(raw: unknown, fieldPath: string): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error(`loadProjectBrief: ${fieldPath} must be an array`);
  }
  return raw.map((item, index) => validateNonEmptyString(item, `${fieldPath}[${index}]`));
}

function validateNonEmptyString(raw: unknown, fieldPath: string): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`loadProjectBrief: ${fieldPath} must be a non-empty string`);
  }
  return raw.trim();
}

function validateOptionalTrimmedString(raw: unknown, fieldPath: string): string | undefined {
  if (raw === undefined) return undefined;
  return validateNonEmptyString(raw, fieldPath);
}

function expectObject(raw: unknown, fieldPath: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`loadProjectBrief: ${fieldPath} must be a JSON object`);
  }
  return raw as Record<string, unknown>;
}
