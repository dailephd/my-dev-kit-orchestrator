// Deterministic instruction-budget accounting.
//
// Character counts are the deterministic budget unit for Batch 1. Any future
// token-based measurement must be clearly labeled as an estimate; it is not
// implemented here. Budget accounting never truncates or silently drops
// required content -- it only reports whether the required content fits.

import {
  BudgetFinding,
  BudgetLimitValidationIssue,
  BudgetLimitValidationResult,
  CatalogEntry,
  InstructionBudgetAccounting,
  InstructionBudgetLimits,
  StageResolutionResult,
} from './catalogTypes';

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify((value as Record<string, unknown>)[key])}`)
    .join(',');
  return `{${body}}`;
}

export function measureEntryCharacters(entry: CatalogEntry): number {
  return canonicalStringify(entry).length;
}

export function validateBudgetLimits(limits: InstructionBudgetLimits): BudgetLimitValidationResult {
  const issues: BudgetLimitValidationIssue[] = [];
  const entries = Object.entries(limits) as Array<[keyof InstructionBudgetLimits, number | null]>;
  for (const [limitName, value] of entries) {
    if (value === null) continue;
    if (!Number.isFinite(value)) {
      issues.push({ limitName, message: `Limit "${limitName}" must be finite.` });
      continue;
    }
    if (!Number.isInteger(value)) {
      issues.push({ limitName, message: `Limit "${limitName}" must be an integer.` });
      continue;
    }
    if (value < 0) {
      issues.push({ limitName, message: `Limit "${limitName}" must not be negative.` });
      continue;
    }
    if (value === 0) {
      issues.push({ limitName, message: `Limit "${limitName}" of zero would make the budget unusable.` });
    }
  }
  return { valid: issues.length === 0, issues };
}

function maxRuleDepthOf(result: StageResolutionResult): number {
  let max = 0;
  for (const entry of result.provenance) {
    if (entry.referenceField === 'ruleRefs' && entry.depth > max) {
      max = entry.depth;
    }
  }
  return max;
}

export function accountForBudget(
  result: StageResolutionResult,
  limits: InstructionBudgetLimits,
): InstructionBudgetAccounting {
  const requiredEntries: CatalogEntry[] = [
    result.workflow,
    result.stage,
    result.reportContract,
    ...result.commands,
    ...result.rules,
  ];
  requiredEntries.sort((a, b) => a.id.localeCompare(b.id));

  const perEntryCharacters: Record<string, number> = {};
  let totalCharacters = 0;
  for (const entry of requiredEntries) {
    const chars = measureEntryCharacters(entry);
    perEntryCharacters[entry.id] = chars;
    totalCharacters += chars;
  }

  const commandCount = result.commands.length;
  const ruleCount = result.rules.length;
  const ruleDepth = maxRuleDepthOf(result);

  const findings: BudgetFinding[] = [];

  const pushFinding = (
    limitName: keyof InstructionBudgetLimits,
    used: number,
    declaredLimit: number | null,
    affectedEntryIds: string[],
  ): void => {
    const overLimit = declaredLimit !== null && used > declaredLimit;
    const available = declaredLimit === null ? null : Math.max(declaredLimit - used, 0);
    const amountExceeded = overLimit ? used - (declaredLimit as number) : 0;
    findings.push({
      limitName,
      declaredLimit,
      used,
      available,
      overLimit,
      amountExceeded,
      affectedEntryIds: overLimit ? [...affectedEntryIds].sort() : [],
    });
  };

  pushFinding('maxCommands', commandCount, limits.maxCommands, result.commands.map((c) => c.id));
  pushFinding('maxRules', ruleCount, limits.maxRules, result.rules.map((r) => r.id));
  pushFinding('maxRuleDepth', ruleDepth, limits.maxRuleDepth, result.rules.map((r) => r.id));

  const overCharacterEntries = requiredEntries
    .filter((entry) => limits.maxEntryCharacters !== null && perEntryCharacters[entry.id] > limits.maxEntryCharacters)
    .map((entry) => entry.id);
  const maxSingleEntryCharacters = requiredEntries.reduce(
    (max, entry) => Math.max(max, perEntryCharacters[entry.id]),
    0,
  );
  pushFinding('maxEntryCharacters', maxSingleEntryCharacters, limits.maxEntryCharacters, overCharacterEntries);

  pushFinding(
    'maxTotalCharacters',
    totalCharacters,
    limits.maxTotalCharacters,
    requiredEntries.map((e) => e.id),
  );

  findings.sort((a, b) => a.limitName.localeCompare(b.limitName));

  const overLimit = findings.some((f) => f.overLimit);

  return {
    findings,
    overLimit,
    adequate: !overLimit,
    totalCharacters,
    perEntryCharacters,
  };
}
