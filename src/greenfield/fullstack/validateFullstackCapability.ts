// v1.3.1 Batch 3: structural, deterministic validation of a
// GreenfieldFullstackCapability value, reusing the existing v1.3.0 GF_*
// issue model (ProfileValidationIssue/ProfileValidationResult,
// finalizeProfileValidationResult) rather than creating a second validation
// architecture. Never throws for malformed/externally-constructed input;
// never mutates the value it validates. New issue codes use the
// `GF_FULLSTACK_` prefix, following the same one-prefix-per-domain
// precedent already established by `GF_TARGET_`, `GF_PLAN_`, `GF_DOC_`, and
// `GF_PROFILE_`.

import {
  GREENFIELD_CONTAINER_RUNTIMES,
  GREENFIELD_DATABASE_ENGINES,
  GREENFIELD_DATABASE_TOOLKITS,
  GREENFIELD_ENVIRONMENT_SCOPES,
  GreenfieldFullstackCapability,
} from './fullstackCapabilityTypes';
import { ProfileValidationIssue, ProfileValidationResult } from '../profiles/profileValidationTypes';
import { finalizeProfileValidationResult } from '../profiles/profileValidationOrdering';

export function validateFullstackCapability(capability: GreenfieldFullstackCapability): ProfileValidationResult {
  const issues: ProfileValidationIssue[] = [];
  const contractId = capability?.starterProfile ?? 'unresolved-profile';

  validateSupportedValue(
    contractId,
    'databaseEngine.engine',
    capability?.databaseEngine?.engine,
    GREENFIELD_DATABASE_ENGINES,
    issues,
  );
  validateSupportedValue(
    contractId,
    'databaseToolkit.toolkit',
    capability?.databaseToolkit?.toolkit,
    GREENFIELD_DATABASE_TOOLKITS,
    issues,
  );
  validateSupportedValue(
    contractId,
    'containerRuntime.runtime',
    capability?.containerRuntime?.runtime,
    GREENFIELD_CONTAINER_RUNTIMES,
    issues,
  );

  validateEnvironmentScopeCoverage(contractId, capability, issues);
  validateDevTestAddressDistinction(contractId, capability, issues);
  validateResetPolicySafety(contractId, capability, issues);
  validateProductionMigrationOwnership(contractId, capability, issues);
  validateEnvironmentVariableIdentitiesAndClassification(contractId, capability, issues);
  validateNoDestructiveProductionCommands(contractId, capability, issues);

  return finalizeProfileValidationResult(issues);
}

// v1.3.1 Batch 4: no command this capability declares may be both
// destructive and scoped to production -- production is never a valid
// reset/destructive target (mirrors validateResetPolicySafety's invariant,
// applied to the concrete command list scaffold-plan composition consumes).
function validateNoDestructiveProductionCommands(
  contractId: string,
  capability: GreenfieldFullstackCapability,
  issues: ProfileValidationIssue[],
): void {
  const allCommands = [...(capability?.setupCommands ?? []), ...(capability?.validationCommands ?? [])];
  for (const command of allCommands) {
    if (command.destructive === true && command.lifecyclePhase === 'production') {
      issues.push({
        code: 'GF_FULLSTACK_UNSAFE_RESET_POLICY',
        severity: 'error',
        profileId: contractId,
        affectedContract: 'setupCommands,validationCommands',
        reason: `Command "${command.command}" is destructive and scoped to the production lifecycle phase, which is never a valid target.`,
        correctiveAction: 'Restrict destructive commands to development/test lifecycle phases only.',
        evidenceKey: `command:destructive-production:${command.command}`,
        actual: command.command,
      });
    }
  }
}

function validateSupportedValue(
  contractId: string,
  contract: string,
  actual: unknown,
  supported: readonly string[],
  issues: ProfileValidationIssue[],
): void {
  if (typeof actual !== 'string' || !supported.includes(actual)) {
    issues.push({
      code: 'GF_FULLSTACK_UNSUPPORTED_VALUE',
      severity: 'error',
      profileId: contractId,
      affectedContract: contract,
      reason: `${contract} value "${String(actual)}" is not part of the implemented full-stack vocabulary.`,
      correctiveAction: `Use one of the supported values (${supported.join(', ')}).`,
      evidenceKey: contract,
      expected: supported.join(', '),
      actual: String(actual),
    });
  }
}

function validateEnvironmentScopeCoverage(
  contractId: string,
  capability: GreenfieldFullstackCapability,
  issues: ProfileValidationIssue[],
): void {
  const scopesPresent = new Set(
    (capability?.environmentVariables ?? []).flatMap((v) => v?.scopes ?? []),
  );
  for (const scope of GREENFIELD_ENVIRONMENT_SCOPES) {
    if (!scopesPresent.has(scope)) {
      issues.push({
        code: 'GF_FULLSTACK_MISSING_SCOPE',
        severity: 'error',
        profileId: contractId,
        affectedContract: 'environmentVariables',
        reason: `No environment variable requirement covers the required "${scope}" scope.`,
        correctiveAction: `Add at least one environment variable requirement whose scopes include "${scope}".`,
        evidenceKey: `environmentVariables:scope:${scope}`,
        expected: scope,
      });
    }
  }
}

function validateDevTestAddressDistinction(
  contractId: string,
  capability: GreenfieldFullstackCapability,
  issues: ProfileValidationIssue[],
): void {
  const addresses = capability?.developmentEnvironment?.addresses ?? [];
  const devAddress = addresses.find((a) => a.scope === 'development');
  const testAddress = addresses.find((a) => a.scope === 'test');
  if (devAddress && testAddress && devAddress.description === testAddress.description) {
    issues.push({
      code: 'GF_FULLSTACK_IDENTITY_COLLAPSE',
      severity: 'error',
      profileId: contractId,
      affectedContract: 'developmentEnvironment.addresses',
      reason: 'Development and test database addresses collapse to the same description.',
      correctiveAction: 'Give development and test database addresses distinct descriptions/identities.',
      evidenceKey: 'developmentEnvironment.addresses:dev-test-collapse',
    });
  }
}

function validateResetPolicySafety(
  contractId: string,
  capability: GreenfieldFullstackCapability,
  issues: ProfileValidationIssue[],
): void {
  const reset = capability?.resetRecovery as unknown as Record<string, unknown> | undefined;
  const allowedScopes = (reset?.allowedScopes as readonly string[] | undefined) ?? [];
  const allowsProduction = reset?.productionAllowed === true || allowedScopes.includes('production');
  if (allowsProduction) {
    issues.push({
      code: 'GF_FULLSTACK_UNSAFE_RESET_POLICY',
      severity: 'error',
      profileId: contractId,
      affectedContract: 'resetRecovery',
      reason: 'Reset/recovery policy allows a production target, which is never a valid reset target.',
      correctiveAction: 'Restrict resetRecovery.allowedScopes to development/test and set productionAllowed to false.',
      evidenceKey: 'resetRecovery:production-allowed',
    });
  }
}

function validateProductionMigrationOwnership(
  contractId: string,
  capability: GreenfieldFullstackCapability,
  issues: ProfileValidationIssue[],
): void {
  const migration = capability?.productionMigration as unknown as Record<string, unknown> | undefined;
  if (migration?.everyReplicaIndependentlyMigratesOnStartup === true || migration?.dockerEntrypointSideEffect === true) {
    issues.push({
      code: 'GF_FULLSTACK_INVALID_MIGRATION_OWNERSHIP',
      severity: 'error',
      profileId: contractId,
      affectedContract: 'productionMigration',
      reason:
        'Production migration is modeled as an implicit per-replica startup responsibility or Docker ' +
        'ENTRYPOINT side effect, which is not a valid representation of the pre-traffic singleton contract.',
      correctiveAction:
        'Model production migration as a distinct pre-traffic singleton operation, not something every ' +
        'replica or container entrypoint performs independently.',
      evidenceKey: 'productionMigration:implicit-per-replica',
    });
  }
}

function validateEnvironmentVariableIdentitiesAndClassification(
  contractId: string,
  capability: GreenfieldFullstackCapability,
  issues: ProfileValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const variable of capability?.environmentVariables ?? []) {
    if (seen.has(variable.name)) {
      issues.push({
        code: 'GF_FULLSTACK_DUPLICATE_IDENTITY',
        severity: 'error',
        profileId: contractId,
        affectedContract: 'environmentVariables',
        reason: `Environment variable "${variable.name}" is declared more than once.`,
        correctiveAction: 'Remove the duplicate environment variable requirement.',
        evidenceKey: `environmentVariables:duplicate:${variable.name}`,
        actual: variable.name,
      });
    }
    seen.add(variable.name);

    if (variable.secret && variable.scopes.includes('production') && !variable.required) {
      issues.push({
        code: 'GF_FULLSTACK_CONTRADICTORY_CLASSIFICATION',
        severity: 'error',
        profileId: contractId,
        affectedContract: 'environmentVariables',
        reason: `Environment variable "${variable.name}" is a production secret but is marked optional.`,
        correctiveAction: 'Mark production secrets as required, or remove production from its scopes.',
        evidenceKey: `environmentVariables:contradictory:${variable.name}`,
        actual: variable.name,
      });
    }
  }
}
