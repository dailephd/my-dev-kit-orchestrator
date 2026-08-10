// v1.3.1 Batch 3: tests for the full-stack environment/database/Docker
// capability contract (resolution + structural validation), and regression
// coverage proving Batch 1/Batch 2 behavior and the CLI/stage surface are
// unaffected.

import { normalizeProjectBrief } from '../../src/greenfield/brief/normalizeProjectBrief';
import { resolveGreenfieldProfile } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { buildGreenfieldBootstrapBundle } from '../../src/greenfield/bootstrap/buildBootstrapBundle';
import { resolveFullstackCapability } from '../../src/greenfield/fullstack/resolveFullstackCapability';
import {
  FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
  GreenfieldFullstackCapability,
} from '../../src/greenfield/fullstack/fullstackCapabilityTypes';
import { validateFullstackCapability } from '../../src/greenfield/fullstack/validateFullstackCapability';

function buildBundleFor(rawIdea: string, overrides: Record<string, unknown> = {}) {
  const normalizedBrief = normalizeProjectBrief({ rawIdea, ...overrides } as any).normalized;
  const selection = resolveGreenfieldProfile(normalizedBrief);
  return buildGreenfieldBootstrapBundle(normalizedBrief, selection);
}

function fullstackBrief(overrides: Record<string, unknown> = {}) {
  return {
    preferredProfile: 'nextjs-app',
    projectType: 'fullstack-web',
    webFramework: 'nextjs',
    ...overrides,
  };
}

describe('resolveFullstackCapability - resolution (v1.3.1 Batch 3)', () => {
  // TST-B3-001: supported combination resolves to the one supported capability.
  it('TST-B3-001: fullstack-web + nextjs + nextjs-app resolves the supported capability', () => {
    const bundle = buildBundleFor('A full-stack web app for tracking inventory.', fullstackBrief());
    const selection = resolveFullstackCapability(bundle.normalizedBrief, bundle.selectedProfile);
    expect(selection.status).toBe('selected');
    expect(selection.capability).toBe(FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY);
    expect(selection.capability?.databaseEngine.engine).toBe('postgresql');
    expect(selection.capability?.databaseToolkit.toolkit).toBe('prisma');
    expect(selection.capability?.containerRuntime.runtime).toBe('docker');
  });

  // TST-B3-002: ordinary nextjs-app without the dimensions stays non-full-stack.
  it('TST-B3-002: ordinary nextjs-app without projectType/webFramework does not receive the capability', () => {
    const bundle = buildBundleFor('A web dashboard for analytics.', { preferredProfile: 'nextjs-app' });
    expect(bundle.fullstackCapability.status).toBe('not-applicable');
    expect(bundle.fullstackCapability.capability).toBeUndefined();
  });

  // TST-B3-003: other profiles never resolve the full-stack Next.js capability.
  // Status is 'not-applicable' here because Batch 1's own profile resolution
  // already rejects the incompatible explicit combination (status:
  // 'unsupported' on the profile selection) before capability resolution
  // runs; either way, no capability is ever attached to a non-nextjs-app profile.
  it('TST-B3-003: typescript-cli does not resolve the full-stack capability even if requested', () => {
    const bundle = buildBundleFor('A CLI tool.', fullstackBrief({ preferredProfile: 'typescript-cli' }));
    expect(bundle.selectedProfile.status).toBe('unsupported');
    expect(bundle.fullstackCapability.status).not.toBe('selected');
    expect(bundle.fullstackCapability.capability).toBeUndefined();
  });

  it('TST-B3-003: android-compose does not resolve the full-stack capability even if requested', () => {
    const bundle = buildBundleFor('An Android app.', fullstackBrief({ preferredProfile: 'android-compose' }));
    expect(bundle.selectedProfile.status).toBe('unsupported');
    expect(bundle.fullstackCapability.status).not.toBe('selected');
    expect(bundle.fullstackCapability.capability).toBeUndefined();
  });

  // TST-B3-004: closed supported vocabulary; unsupported values rejected deterministically.
  // With an explicit preferredProfile of nextjs-app, Batch 1's own
  // compatibility check already rejects the mismatched dimension at profile
  // resolution; capability resolution independently guards the same
  // invariant for paths where profile resolution alone would not catch it
  // (see the dedicated resolveFullstackCapability unit test below).
  it('TST-B3-004: an unsupported webFramework value does not resolve the capability', () => {
    const bundle = buildBundleFor(
      'A full-stack web app.',
      fullstackBrief({ webFramework: 'remix' }),
    );
    expect(bundle.fullstackCapability.status).not.toBe('selected');
    expect(bundle.fullstackCapability.capability).toBeUndefined();
  });

  it('TST-B3-004: an unsupported projectType value does not resolve the capability', () => {
    const bundle = buildBundleFor(
      'A full-stack web app.',
      fullstackBrief({ projectType: 'mobile-app' }),
    );
    expect(bundle.fullstackCapability.status).not.toBe('selected');
    expect(bundle.fullstackCapability.capability).toBeUndefined();
  });

  it('TST-B3-004: resolveFullstackCapability independently rejects an unsupported webFramework even when the upstream profile selection is (hypothetically) selected', () => {
    const normalized = normalizeProjectBrief({
      rawIdea: 'A full-stack web app.',
      preferredProfile: 'nextjs-app',
      projectType: 'fullstack-web',
      webFramework: 'sveltekit',
    }).normalized;
    // Bypass Batch 1's own profile-level compatibility check to exercise
    // resolveFullstackCapability's independent dimension guard directly.
    const fakeSelectedProfile = resolveGreenfieldProfile(
      normalizeProjectBrief({ rawIdea: 'A full-stack web app.', preferredProfile: 'nextjs-app' }).normalized,
    );
    const selection = resolveFullstackCapability(normalized, fakeSelectedProfile);
    expect(selection.status).toBe('unsupported');
    expect(selection.capability).toBeUndefined();
  });

  it('does not silently substitute the capability for an incompatible explicit combination', () => {
    const bundle = buildBundleFor(
      'A CLI tool that happens to request full-stack web.',
      fullstackBrief({ preferredProfile: 'typescript-cli' }),
    );
    expect(bundle.fullstackCapability.capability).toBeUndefined();
    expect(bundle.fullstackCapability.reason.length).toBeGreaterThan(0);
  });
});

describe('GreenfieldFullstackCapability - structural contract content (v1.3.1 Batch 3)', () => {
  let capability: GreenfieldFullstackCapability;

  beforeAll(() => {
    const bundle = buildBundleFor('A full-stack web app for tracking inventory.', fullstackBrief());
    const selection = resolveFullstackCapability(bundle.normalizedBrief, bundle.selectedProfile);
    capability = selection.capability!;
  });

  // TST-B3-005: development topology.
  it('TST-B3-005: distinguishes host development, Docker-managed PostgreSQL, optional container smoke, and persistence', () => {
    expect(capability.developmentEnvironment.hostApplicationDevelopment.applicationExecution).toBe('host');
    expect(capability.developmentEnvironment.hostApplicationDevelopment.hotReload).toBe(true);
    expect(capability.developmentEnvironment.containerizedProductionLikeSmoke.applicationExecution).toBe('container');
    expect(capability.developmentEnvironment.databaseTopology).toBe('docker-managed-infrastructure-service');
    expect(capability.developmentEnvironment.ordinaryShutdownPreservesDevelopmentData).toBe(true);
    expect(capability.developmentEnvironment.dockerEngineReadinessRequired).toBe(true);
    expect(capability.developmentEnvironment.windowsDockerDesktopReadinessRecognized).toBe(true);
  });

  // TST-B3-006: environment scopes.
  it('TST-B3-006: development/test/production scopes are represented distinctly with deterministic metadata', () => {
    const allScopes = new Set(capability.environmentVariables.flatMap((v) => v.scopes));
    expect(allScopes).toEqual(new Set(['development', 'test', 'production']));
    const databaseUrl = capability.environmentVariables.find((v) => v.name === 'DATABASE_URL')!;
    expect(databaseUrl.required).toBe(true);
    expect(databaseUrl.secret).toBe(true);
    expect(databaseUrl.consumer.length).toBeGreaterThan(0);
  });

  // TST-B3-007: host/container address distinction.
  it('TST-B3-007: host and container database addresses are not the same environment endpoint', () => {
    const hostDev = capability.developmentEnvironment.addresses.find(
      (a) => a.scope === 'development' && a.context === 'host',
    )!;
    const containerDev = capability.developmentEnvironment.addresses.find(
      (a) => a.scope === 'development' && a.context === 'container',
    )!;
    expect(hostDev.description).not.toBe(containerDev.description);
  });

  // TST-B3-008: PostgreSQL ownership.
  it('TST-B3-008: PostgreSQL is the supported engine with distinct scope responsibilities', () => {
    expect(capability.databaseEngine.engine).toBe('postgresql');
    expect(capability.databaseEngine.distinctScopeIdentities).toBe(true);
    expect(capability.databaseEngine.developmentDataPersistsAcrossRestart).toBe(true);
    expect(capability.databaseEngine.testDataIsolatedFromDevelopmentAndProduction).toBe(true);
    expect(capability.databaseEngine.productionNeverAValidResetTarget).toBe(true);
    expect(capability.databaseEngine.processHealthDoesNotProveSchemaReadiness).toBe(true);
  });

  // TST-B3-009: Prisma ownership.
  it('TST-B3-009: captures schema ownership, client responsibility, and migration create-vs-deploy distinction', () => {
    expect(capability.databaseToolkit.toolkit).toBe('prisma');
    expect(capability.databaseToolkit.schemaOwnsLogicalDesign).toBe(true);
    expect(capability.databaseToolkit.generatedClientIsDerivedOutput).toBe(true);
    expect(capability.databaseToolkit.canonicalApplicationClientRequired).toBe(true);
    expect(capability.databaseToolkit.migrationCreateAndDeployAreDistinctOperations).toBe(true);
    expect(capability.databaseToolkit.committedSqlMigrationsOwnEvolution).toBe(true);
    expect(capability.databaseToolkit.clientGenerationRequiredAt).toEqual(
      expect.arrayContaining(['setup', 'build', 'test']),
    );
  });

  // TST-B3-010: no-seed default.
  it('TST-B3-010: defaults to no seed requirement without inventing product/sample data', () => {
    expect(capability.databaseToolkit.seedPolicy.kind).toBe('none');
    expect(capability.databaseToolkit.seedPolicy.description.toLowerCase()).not.toMatch(/workspace|literature|biolit/);
  });

  // TST-B3-011: test database isolation.
  it('TST-B3-011: requires test database isolation from development and production', () => {
    expect(capability.testDatabase.identityDistinctFromDevelopment).toBe(true);
    expect(capability.testDatabase.identityDistinctFromProduction).toBe(true);
    expect(capability.testDatabase.resetGuarded).toBe(true);
    expect(capability.testDatabase.noOpCommandCannotCountAsEvidence).toBe(true);
  });

  // TST-B3-012: Docker lifecycle responsibilities.
  it('TST-B3-012: distinguishes engine readiness, service startup/health, image build, app startup, and shutdown', () => {
    const responsibilities = capability.containerRuntime.responsibilities;
    for (const expected of [
      'engine-readiness',
      'infrastructure-service-startup',
      'service-health',
      'image-build',
      'application-startup',
      'controlled-shutdown',
    ]) {
      expect(responsibilities).toContain(expected);
    }
  });

  // TST-B3-013: production image requirements.
  it('TST-B3-013: records production-oriented image expectations', () => {
    const image = capability.containerRuntime.productionImage;
    expect(image.multiStageBuild).toBe(true);
    expect(image.deterministicDependencyInstall).toBe(true);
    expect(image.prismaClientGenerationBeforeBuildWhenRequired).toBe(true);
    expect(image.nextjsProductionBuild).toBe(true);
    expect(image.standaloneRuntimeOutputWhenSupported).toBe(true);
    expect(image.nonRootRuntimePreferred).toBe(true);
    expect(image.buildContextAwareDockerignore).toBe(true);
  });

  // TST-B3-014: liveness versus readiness.
  it('TST-B3-014: distinguishes process liveness, PostgreSQL health, and application/database readiness', () => {
    expect(capability.healthReadiness.distinctConcerns).toEqual(
      expect.arrayContaining(['process-liveness', 'postgresql-health', 'application-database-readiness']),
    );
    expect(capability.healthReadiness.processLivenessProvesDatabaseReachability).toBe(false);
    expect(capability.healthReadiness.postgresqlHealthProvesSchemaReadiness).toBe(false);
  });

  // TST-B3-015: production migration ownership.
  it('TST-B3-015: production migration is a distinct pre-traffic operation, not per-replica startup', () => {
    expect(capability.productionMigration.responsibility).toBe('pre-traffic-singleton-operation');
    expect(capability.productionMigration.everyReplicaIndependentlyMigratesOnStartup).toBe(false);
    expect(capability.productionMigration.dockerEntrypointSideEffect).toBe(false);
    expect(capability.productionMigration.exposesExplicitMigrationDeployResponsibility).toBe(true);
  });

  // TST-B3-016: safe reset.
  it('TST-B3-016: reset is explicitly non-production-only with validated identity requirements', () => {
    expect(capability.resetRecovery.allowedScopes).toEqual(expect.arrayContaining(['development', 'test']));
    expect(capability.resetRecovery.allowedScopes).not.toContain('production');
    expect(capability.resetRecovery.productionAllowed).toBe(false);
    expect(capability.resetRecovery.targetIdentityMustBeParsedAndValidated).toBe(true);
    expect(capability.resetRecovery.ambiguousTargetFailsClosed).toBe(true);
    expect(capability.resetRecovery.productionLikeTargetFailsClosed).toBe(true);
  });

  // TST-B3-017: redacted unsafe-target failure semantics.
  it('TST-B3-017: does not require or expose credentials in the reset contract', () => {
    expect(capability.resetRecovery.credentialsRedactedFromFailureReporting).toBe(true);
    const serialized = JSON.stringify(capability.resetRecovery);
    expect(serialized.toLowerCase()).not.toMatch(/password|secret|<redacted>/);
  });

  // TST-B3-018: migration replay after reset.
  it('TST-B3-018: reset requires migration replay and only replays seed when policy requires it', () => {
    expect(capability.resetRecovery.migrationsReplayedAfterReset).toBe(true);
    expect(capability.resetRecovery.seedReplayedOnlyWhenPolicyRequiresIt).toBe(true);
  });

  it('models conceptual lifecycle operations across development/test/production without concrete shell text', () => {
    const operationsByPhase = {
      development: capability.lifecycleResponsibilities.filter((r) => r.phase === 'development').map((r) => r.operation),
      test: capability.lifecycleResponsibilities.filter((r) => r.phase === 'test').map((r) => r.operation),
      production: capability.lifecycleResponsibilities.filter((r) => r.phase === 'production').map((r) => r.operation),
    };
    expect(operationsByPhase.development).toEqual(
      expect.arrayContaining(['dependency-install', 'docker-readiness', 'database-up', 'database-wait-health']),
    );
    expect(operationsByPhase.test).toEqual(
      expect.arrayContaining(['test-database-up', 'migration-deploy-replay', 'reset', 'database-backed-test-execution']),
    );
    expect(operationsByPhase.production).toEqual(
      expect.arrayContaining(['production-image-build', 'production-migration-deploy', 'liveness-readiness-verification']),
    );
    // no concrete shell command text anywhere in the lifecycle model
    const serialized = JSON.stringify(capability.lifecycleResponsibilities);
    expect(serialized).not.toMatch(/npm run|docker compose|prisma migrate/i);
  });

  // TST-B3-030-equivalent: Batch 2 document-overlay extension point, structural only.
  it('exposes structured document-responsibility mappings without producing document content', () => {
    const documents = capability.documentResponsibilities.map((d) => d.document);
    expect(documents).toEqual(
      expect.arrayContaining([
        'docs/ARCHITECTURE.md',
        'docs/CONTRACTS.md',
        'docs/COMMANDS.md',
        'docs/WORKFLOWS.md',
        'docs/DEVELOPMENT.md',
        'docs/CI_CD.md',
        'docs/SECURITY.md',
      ]),
    );
    expect(documents).not.toContain('docs/DATABASE.md');
    expect(documents).not.toContain('docs/ENVIRONMENT.md');
    expect(documents).not.toContain('docs/TESTING.md');
    expect(documents).not.toContain('docs/DEPLOYMENT.md');
  });
});

describe('validateFullstackCapability (v1.3.1 Batch 3)', () => {
  it('the built-in supported capability passes validation with no issues', () => {
    const result = validateFullstackCapability(FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('flags an unsupported database engine value', () => {
    const malformed: GreenfieldFullstackCapability = {
      ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
      databaseEngine: { ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.databaseEngine, engine: 'mysql' as never },
    };
    const result = validateFullstackCapability(malformed);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_FULLSTACK_UNSUPPORTED_VALUE', affectedContract: 'databaseEngine.engine' }),
    );
  });

  it('flags an unsupported database toolkit value', () => {
    const malformed: GreenfieldFullstackCapability = {
      ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
      databaseToolkit: { ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.databaseToolkit, toolkit: 'drizzle' as never },
    };
    const result = validateFullstackCapability(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_FULLSTACK_UNSUPPORTED_VALUE', affectedContract: 'databaseToolkit.toolkit' }),
    );
  });

  it('flags an unsupported container runtime value', () => {
    const malformed: GreenfieldFullstackCapability = {
      ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
      containerRuntime: { ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.containerRuntime, runtime: 'podman' as never },
    };
    const result = validateFullstackCapability(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_FULLSTACK_UNSUPPORTED_VALUE', affectedContract: 'containerRuntime.runtime' }),
    );
  });

  it('flags a missing required environment scope', () => {
    const malformed: GreenfieldFullstackCapability = {
      ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
      environmentVariables: FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.environmentVariables.filter(
        (v) => v.name !== 'DATABASE_URL',
      ),
    };
    const result = validateFullstackCapability(malformed);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_FULLSTACK_MISSING_SCOPE' }),
    );
  });

  it('flags development/test database identity collapse', () => {
    const collapsed = FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.developmentEnvironment.addresses.map((a) =>
      a.scope === 'test' ? { ...a, description: FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.developmentEnvironment.addresses.find((x) => x.scope === 'development' && x.context === 'host')!.description } : a,
    );
    const malformed: GreenfieldFullstackCapability = {
      ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
      developmentEnvironment: { ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.developmentEnvironment, addresses: collapsed },
    };
    const result = validateFullstackCapability(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_FULLSTACK_IDENTITY_COLLAPSE' }),
    );
  });

  it('flags an unsafe reset policy that allows production', () => {
    const malformed: GreenfieldFullstackCapability = {
      ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
      resetRecovery: {
        ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.resetRecovery,
        productionAllowed: true as never,
      },
    };
    const result = validateFullstackCapability(malformed);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_FULLSTACK_UNSAFE_RESET_POLICY' }),
    );
  });

  it('flags production migration modeled as an every-replica startup responsibility', () => {
    const malformed: GreenfieldFullstackCapability = {
      ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
      productionMigration: {
        ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.productionMigration,
        everyReplicaIndependentlyMigratesOnStartup: true as never,
      },
    };
    const result = validateFullstackCapability(malformed);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_FULLSTACK_INVALID_MIGRATION_OWNERSHIP' }),
    );
  });

  it('flags a duplicate environment variable identity', () => {
    const malformed: GreenfieldFullstackCapability = {
      ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
      environmentVariables: [
        ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.environmentVariables,
        FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.environmentVariables[0],
      ],
    };
    const result = validateFullstackCapability(malformed);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_FULLSTACK_DUPLICATE_IDENTITY' }),
    );
  });

  it('flags a contradictory secret/required classification for a production variable', () => {
    const malformed: GreenfieldFullstackCapability = {
      ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
      environmentVariables: FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.environmentVariables.map((v) =>
        v.name === 'DATABASE_URL' ? { ...v, required: false } : v,
      ),
    };
    const result = validateFullstackCapability(malformed);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_FULLSTACK_CONTRADICTORY_CLASSIFICATION' }),
    );
  });

  // TST-B3-019: deterministic validation, no mutation.
  it('TST-B3-019: is deterministic and does not mutate the capability it validates', () => {
    const before = JSON.parse(JSON.stringify(FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY));
    const first = validateFullstackCapability(FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY);
    const second = validateFullstackCapability(FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY);
    expect(first).toEqual(second);
    expect(FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY).toEqual(before);
  });

  it('never throws for a malformed capability value', () => {
    const malformed = {} as GreenfieldFullstackCapability;
    expect(() => validateFullstackCapability(malformed)).not.toThrow();
  });
});

describe('v1.3.1 Batch 3 regression - Batch 1/Batch 2 unaffected', () => {
  // TST-B3-020: Batch 1 project-type/framework/profile compatibility unchanged.
  it('TST-B3-020: Batch 1 dimension/profile compatibility is unchanged', () => {
    const selected = resolveGreenfieldProfile(
      normalizeProjectBrief({
        rawIdea: 'A full-stack app.',
        preferredProfile: 'nextjs-app',
        projectType: 'fullstack-web',
        webFramework: 'nextjs',
      }).normalized,
    );
    expect(selected.status).toBe('selected');
    expect(selected.profile?.id).toBe('nextjs-app');

    const incompatible = resolveGreenfieldProfile(
      normalizeProjectBrief({
        rawIdea: 'A CLI tool.',
        preferredProfile: 'typescript-cli',
        projectType: 'fullstack-web',
        webFramework: 'nextjs',
      }).normalized,
    );
    expect(incompatible.status).toBe('unsupported');
  });

  // TST-B3-021: Batch 2 standardized 15-file canonical document baseline unchanged.
  it('TST-B3-021: the standardized 15-file canonical document baseline is unchanged', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GREENFIELD_CANONICAL_DOCUMENT_PATHS } = require('../../src/greenfield/bootstrap/projectDocBootstrapTypes');
    expect(GREENFIELD_CANONICAL_DOCUMENT_PATHS).toHaveLength(15);
    expect(GREENFIELD_CANONICAL_DOCUMENT_PATHS).toContain('README.md');
    expect(GREENFIELD_CANONICAL_DOCUMENT_PATHS).toContain('docs/DOCUMENTATION_PRESERVATION_POLICY.md');
  });

  // TST-B3-022: no scaffold implementation leakage.
  it('TST-B3-022: does not introduce concrete scaffold target files or command execution', () => {
    const bundle = buildBundleFor('A full-stack web app.', fullstackBrief());
    // scaffoldPlanningInputs remains sourced only from the selected profile, unmodified by Batch 3
    expect(bundle.scaffoldPlanningInputs.templateTargets).toEqual(
      bundle.selectedProfile.profile?.templateTargets ?? [],
    );
  });

  // TST-B3-023: no default specialized full-stack docs.
  it('TST-B3-023: does not introduce default DATABASE/ENVIRONMENT/TESTING/DEPLOYMENT documents', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GREENFIELD_CANONICAL_DOCUMENT_PATHS } = require('../../src/greenfield/bootstrap/projectDocBootstrapTypes');
    expect(GREENFIELD_CANONICAL_DOCUMENT_PATHS).not.toContain('docs/DATABASE.md');
    expect(GREENFIELD_CANONICAL_DOCUMENT_PATHS).not.toContain('docs/ENVIRONMENT.md');
    expect(GREENFIELD_CANONICAL_DOCUMENT_PATHS).not.toContain('docs/TESTING.md');
    expect(GREENFIELD_CANONICAL_DOCUMENT_PATHS).not.toContain('docs/DEPLOYMENT.md');
  });

  // TST-B3-024: no CLI/stage regression.
  it('TST-B3-024: no new CLI flag, workflow mode, profile, or native stage was introduced', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createProgram } = require('../../src/program');
    const startCommand = createProgram().commands.find((c: { name: () => string }) => c.name() === 'start');
    const flags = (startCommand?.options ?? []).map((o: { long: string }) => o.long);
    expect(flags).not.toContain('--database-engine');
    expect(flags).not.toContain('--database-toolkit');
    expect(flags).not.toContain('--container-runtime');
    expect(flags).not.toContain('--profile');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SUPPORTED_PROFILES } = require('../../src/greenfield/profiles/resolveGreenfieldProfile');
    expect(Object.keys(SUPPORTED_PROFILES).sort()).toEqual([
      'android-compose',
      'nextjs-app',
      'python-cli',
      'typescript-cli',
    ]);
  });
});
