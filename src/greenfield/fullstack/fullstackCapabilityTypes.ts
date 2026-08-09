// v1.3.1 Batch 3: the first structured full-stack environment/database/Docker
// capability contract, attached to the already-supported
// `projectType = fullstack-web` + `webFramework = nextjs` +
// `starterProfile = nextjs-app` combination established by Batch 1
// (src/greenfield/profiles/profileTypes.ts) and consumed alongside the
// standardized project-document contract established by Batch 2
// (src/greenfield/bootstrap/projectDocBootstrapTypes.ts).
//
// This module only *models* the capability -- deterministic, in-memory,
// structured data describing requirements and invariants. It generates no
// files, runs no commands, and proves no runtime behavior. See
// reports/greenfield-nextjs-fullstack-environment-reference.txt and
// reports/greenfield-nextjs-database-lifecycle-reference.txt for the
// evidence basis; gaps those reports left unresolved (safe reset, database-
// aware readiness, a singleton pre-traffic production migration owner, an
// explicit "no seed" default) are modeled here as deliberate invariants
// rather than inherited as unproven behavior.
//
// Concrete Dockerfile/Compose/Prisma-schema/env-template generation, scaffold
// composition, and verification-evidence parsing are explicitly out of scope
// (Batches 4 and 5).

import {
  GreenfieldProfileCommand,
  GreenfieldProjectType,
  GreenfieldTargetExpectation,
  GreenfieldWebFramework,
} from '../profiles/profileTypes';

// ─── Closed vocabularies ──────────────────────────────────────────────────────
//
// Each vocabulary describes only implemented support. Extending any of these
// to a new value (e.g. a second database engine) requires a separately
// approved contract, mirroring the GREENFIELD_PROJECT_TYPE/
// GREENFIELD_WEB_FRAMEWORK precedent from Batch 1.

export const GREENFIELD_DATABASE_ENGINE = {
  POSTGRESQL: 'postgresql',
} as const;

export type GreenfieldDatabaseEngine = (typeof GREENFIELD_DATABASE_ENGINE)[keyof typeof GREENFIELD_DATABASE_ENGINE];

export const GREENFIELD_DATABASE_ENGINES: readonly GreenfieldDatabaseEngine[] =
  Object.values(GREENFIELD_DATABASE_ENGINE);

export const GREENFIELD_DATABASE_TOOLKIT = {
  PRISMA: 'prisma',
} as const;

export type GreenfieldDatabaseToolkit = (typeof GREENFIELD_DATABASE_TOOLKIT)[keyof typeof GREENFIELD_DATABASE_TOOLKIT];

export const GREENFIELD_DATABASE_TOOLKITS: readonly GreenfieldDatabaseToolkit[] =
  Object.values(GREENFIELD_DATABASE_TOOLKIT);

export const GREENFIELD_CONTAINER_RUNTIME = {
  DOCKER: 'docker',
} as const;

export type GreenfieldContainerRuntime =
  (typeof GREENFIELD_CONTAINER_RUNTIME)[keyof typeof GREENFIELD_CONTAINER_RUNTIME];

export const GREENFIELD_CONTAINER_RUNTIMES: readonly GreenfieldContainerRuntime[] =
  Object.values(GREENFIELD_CONTAINER_RUNTIME);

// ─── Environment scopes and variable contract ─────────────────────────────────

export type GreenfieldEnvironmentScope = 'development' | 'test' | 'production';

export const GREENFIELD_ENVIRONMENT_SCOPES: readonly GreenfieldEnvironmentScope[] = [
  'development',
  'test',
  'production',
];

/**
 * One environment input's structural identity. Never carries a real value --
 * only the shape a later scaffold/document/verification batch needs to
 * generate `.env.example`-style templates and validation, without
 * generating them here.
 */
export interface GreenfieldEnvironmentVariableRequirement {
  name: string;
  purpose: string;
  scopes: readonly GreenfieldEnvironmentScope[];
  consumer: string;
  required: boolean;
  secret: boolean;
  sourceExpectation: string;
  absentValueBehavior: string;
}

export type GreenfieldAddressContext = 'host' | 'container';

/** Host and container database addresses are never the same environment endpoint (TST-B3-007). */
export interface GreenfieldDatabaseAddress {
  scope: GreenfieldEnvironmentScope;
  context: GreenfieldAddressContext;
  description: string;
}

// ─── Development environment contract ─────────────────────────────────────────

export interface GreenfieldDevelopmentTopologyDescriptor {
  applicationExecution: GreenfieldAddressContext;
  hotReload: boolean;
  description: string;
}

export interface GreenfieldDevelopmentEnvironmentContract {
  hostApplicationDevelopment: GreenfieldDevelopmentTopologyDescriptor;
  containerizedProductionLikeSmoke: GreenfieldDevelopmentTopologyDescriptor;
  databaseTopology: 'docker-managed-infrastructure-service';
  dockerEngineReadinessRequired: true;
  windowsDockerDesktopReadinessRecognized: true;
  ordinaryShutdownPreservesDevelopmentData: true;
  addresses: readonly GreenfieldDatabaseAddress[];
}

// ─── Database engine contract (PostgreSQL) ─────────────────────────────────────

export interface GreenfieldDatabaseEngineContract {
  engine: GreenfieldDatabaseEngine;
  distinctScopeIdentities: true;
  developmentDataPersistsAcrossRestart: true;
  testDataIsolatedFromDevelopmentAndProduction: true;
  productionNeverAValidResetTarget: true;
  processHealthDoesNotProveSchemaReadiness: true;
}

// ─── Database toolkit contract (Prisma) + seed policy ─────────────────────────

export type GreenfieldSeedPolicyKind = 'none' | 'development-sample' | 'required-bootstrap';

export interface GreenfieldSeedPolicy {
  kind: GreenfieldSeedPolicyKind;
  description: string;
}

export type GreenfieldClientGenerationTrigger = 'setup' | 'build' | 'test';

export interface GreenfieldDatabaseToolkitContract {
  toolkit: GreenfieldDatabaseToolkit;
  schemaOwnsLogicalDesign: true;
  generatedClientIsDerivedOutput: true;
  canonicalApplicationClientRequired: true;
  migrationCreateAndDeployAreDistinctOperations: true;
  committedSqlMigrationsOwnEvolution: true;
  clientGenerationRequiredAt: readonly GreenfieldClientGenerationTrigger[];
  testAndProductionReplayCommittedMigrations: true;
  seedPolicy: GreenfieldSeedPolicy;
}

// ─── Test database contract ────────────────────────────────────────────────────

export interface GreenfieldTestDatabaseContract {
  identityDistinctFromDevelopment: true;
  identityDistinctFromProduction: true;
  migrationsReplayable: true;
  databaseBackedTestsUseTestState: true;
  resetDeterministic: true;
  resetGuarded: true;
  noOpCommandCannotCountAsEvidence: true;
}

// ─── Docker/container runtime contract ─────────────────────────────────────────

export type GreenfieldDockerResponsibility =
  | 'engine-readiness'
  | 'image-build'
  | 'infrastructure-service-startup'
  | 'service-health'
  | 'dependency-ordering'
  | 'development-persistence'
  | 'test-isolation'
  | 'container-networking'
  | 'application-startup'
  | 'controlled-shutdown'
  | 'production-oriented-runtime';

export const GREENFIELD_DOCKER_RESPONSIBILITIES: readonly GreenfieldDockerResponsibility[] = [
  'engine-readiness',
  'image-build',
  'infrastructure-service-startup',
  'service-health',
  'dependency-ordering',
  'development-persistence',
  'test-isolation',
  'container-networking',
  'application-startup',
  'controlled-shutdown',
  'production-oriented-runtime',
];

export interface GreenfieldProductionImageContract {
  multiStageBuild: true;
  deterministicDependencyInstall: true;
  prismaClientGenerationBeforeBuildWhenRequired: true;
  nextjsProductionBuild: true;
  standaloneRuntimeOutputWhenSupported: true;
  nonRootRuntimePreferred: true;
  buildContextAwareDockerignore: true;
}

export interface GreenfieldContainerRuntimeContract {
  runtime: GreenfieldContainerRuntime;
  responsibilities: readonly GreenfieldDockerResponsibility[];
  productionImage: GreenfieldProductionImageContract;
}

// ─── Health / liveness / readiness contract ────────────────────────────────────

export type GreenfieldReadinessConcern = 'process-liveness' | 'postgresql-health' | 'application-database-readiness';

export const GREENFIELD_READINESS_CONCERNS: readonly GreenfieldReadinessConcern[] = [
  'process-liveness',
  'postgresql-health',
  'application-database-readiness',
];

/**
 * Three explicitly distinct concepts (never collapsed into one Boolean):
 * a live process, a healthy PostgreSQL service, and an application that has
 * proven it can reach the database and use the expected schema.
 */
export interface GreenfieldHealthReadinessContract {
  distinctConcerns: readonly GreenfieldReadinessConcern[];
  processLivenessProvesDatabaseReachability: false;
  postgresqlHealthProvesSchemaReadiness: false;
}

// ─── Production migration contract ─────────────────────────────────────────────

export interface GreenfieldProductionMigrationContract {
  responsibility: 'pre-traffic-singleton-operation';
  everyReplicaIndependentlyMigratesOnStartup: false;
  dockerEntrypointSideEffect: false;
  exposesExplicitMigrationDeployResponsibility: true;
  deploymentPlatformOwnershipOutOfScope: true;
}

// ─── Safe reset/recovery contract ──────────────────────────────────────────────

export type GreenfieldResetAllowedScope = 'development' | 'test';

export interface GreenfieldResetRecoveryContract {
  allowedScopes: readonly GreenfieldResetAllowedScope[];
  productionAllowed: false;
  targetIdentityMustBeParsedAndValidated: true;
  ambiguousTargetFailsClosed: true;
  productionLikeTargetFailsClosed: true;
  credentialsRedactedFromFailureReporting: true;
  migrationsReplayedAfterReset: true;
  seedReplayedOnlyWhenPolicyRequiresIt: true;
}

// ─── Command/lifecycle responsibility model ────────────────────────────────────
//
// Conceptual operations only -- no concrete shell command text. Batch 4
// composes actual scaffold-plan commands from this responsibility list.

export type GreenfieldLifecyclePhase = 'development' | 'test' | 'production';

export type GreenfieldLifecycleOperation =
  | 'dependency-install'
  | 'environment-validation'
  | 'docker-readiness'
  | 'database-up'
  | 'database-wait-health'
  | 'prisma-generate'
  | 'development-migration-setup'
  | 'application-development-start'
  | 'database-application-shutdown'
  | 'test-database-up'
  | 'test-database-wait-health'
  | 'migration-deploy-replay'
  | 'reset'
  | 'database-backed-test-execution'
  | 'cleanup'
  | 'application-build'
  | 'production-image-build'
  | 'production-migration-deploy'
  | 'container-smoke'
  | 'liveness-readiness-verification';

export interface GreenfieldLifecycleResponsibility {
  operation: GreenfieldLifecycleOperation;
  phase: GreenfieldLifecyclePhase;
  description: string;
}

// ─── Batch 2 standardized-document overlay extension point ────────────────────
//
// Structural responsibility metadata only -- no rendered prose. Batch 4 may
// consume this to layer full-stack content into the existing common
// canonical documents (see populateCanonicalProjectDocumentsFromBrief.ts);
// it does not create docs/DATABASE.md, docs/ENVIRONMENT.md, docs/TESTING.md,
// or docs/DEPLOYMENT.md.

export type GreenfieldFullstackDocumentOwner =
  | 'docs/ARCHITECTURE.md'
  | 'docs/CONTRACTS.md'
  | 'docs/COMMANDS.md'
  | 'docs/WORKFLOWS.md'
  | 'docs/DEVELOPMENT.md'
  | 'docs/CI_CD.md'
  | 'docs/SECURITY.md';

export interface GreenfieldFullstackDocumentResponsibility {
  document: GreenfieldFullstackDocumentOwner;
  responsibility: string;
}

// ─── The resolved capability ────────────────────────────────────────────────────

export interface GreenfieldFullstackCapability {
  projectType: GreenfieldProjectType;
  webFramework: GreenfieldWebFramework;
  starterProfile: 'nextjs-app';
  developmentEnvironment: GreenfieldDevelopmentEnvironmentContract;
  environmentVariables: readonly GreenfieldEnvironmentVariableRequirement[];
  databaseEngine: GreenfieldDatabaseEngineContract;
  databaseToolkit: GreenfieldDatabaseToolkitContract;
  testDatabase: GreenfieldTestDatabaseContract;
  containerRuntime: GreenfieldContainerRuntimeContract;
  healthReadiness: GreenfieldHealthReadinessContract;
  productionMigration: GreenfieldProductionMigrationContract;
  resetRecovery: GreenfieldResetRecoveryContract;
  lifecycleResponsibilities: readonly GreenfieldLifecycleResponsibility[];
  documentResponsibilities: readonly GreenfieldFullstackDocumentResponsibility[];
  /**
   * v1.3.1 Batch 4: additive scaffold-plan target expectations for this
   * capability, in the exact shape profile.targetExpectations already uses
   * (see profileTypes.ts and validateGreenfieldScaffoldPlan.ts). Composed
   * with the selected nextjs-app profile's own targetExpectations by
   * buildScaffoldPlan.ts -- never a replacement for them.
   */
  targetExpectations: readonly GreenfieldTargetExpectation[];
  /**
   * v1.3.1 Batch 4: additive scaffold-plan setup commands for this
   * capability, composed with the selected profile's own setupCommands.
   * Commands already covered by the base nextjs-app profile (dependency
   * install, build, test) are not repeated here.
   */
  setupCommands: readonly GreenfieldProfileCommand[];
  /** v1.3.1 Batch 4: additive scaffold-plan validation commands, composed with the selected profile's own validationCommands. */
  validationCommands: readonly GreenfieldProfileCommand[];
}

// ─── The one supported capability instance ─────────────────────────────────────

export const FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY: GreenfieldFullstackCapability = {
  projectType: 'fullstack-web',
  webFramework: 'nextjs',
  starterProfile: 'nextjs-app',

  developmentEnvironment: {
    hostApplicationDevelopment: {
      applicationExecution: 'host',
      hotReload: true,
      description:
        'Next.js development runs directly on the host for fast local development and hot reload, while ' +
        'PostgreSQL runs as a Docker-managed infrastructure service.',
    },
    containerizedProductionLikeSmoke: {
      applicationExecution: 'container',
      hotReload: false,
      description:
        'The application may optionally run fully containerized (production-style image, no source mount) ' +
        'for production-like smoke validation; this is not the primary hot-reload development path.',
    },
    databaseTopology: 'docker-managed-infrastructure-service',
    dockerEngineReadinessRequired: true,
    windowsDockerDesktopReadinessRecognized: true,
    ordinaryShutdownPreservesDevelopmentData: true,
    addresses: [
      {
        scope: 'development',
        context: 'host',
        description:
          'Host-loopback PostgreSQL address (published development port) used by the Next.js dev server ' +
          'running directly on the host.',
      },
      {
        scope: 'development',
        context: 'container',
        description:
          'Docker-network PostgreSQL service address (service DNS name and internal port), used only when ' +
          'the application itself runs inside a container for production-like smoke validation.',
      },
      {
        scope: 'test',
        context: 'host',
        description:
          'Host-loopback PostgreSQL address on a distinct published test port and distinct database name, ' +
          'isolated from the development database.',
      },
      {
        scope: 'production',
        context: 'container',
        description:
          'Externally managed PostgreSQL connection string injected as a platform secret; not a value this ' +
          'contract generates or defaults.',
      },
    ],
  },

  environmentVariables: [
    {
      name: 'DATABASE_URL',
      purpose: 'PostgreSQL connection string used by the canonical application database client and by Prisma migration/generation commands.',
      scopes: ['development', 'test', 'production'],
      consumer: 'canonical application database client (single owner) and Prisma CLI',
      required: true,
      secret: true,
      sourceExpectation:
        'developer-provided host environment file (development); tracked non-secret test template merged ' +
        'with a local override (test); platform secret injection (production)',
      absentValueBehavior:
        'the canonical database client fails fast with an explicit missing-configuration error before any query executes',
    },
    {
      name: 'POSTGRES_USER',
      purpose: 'PostgreSQL service username for the Docker-managed development/test infrastructure container.',
      scopes: ['development', 'test'],
      consumer: 'Docker-managed PostgreSQL service and its health check',
      required: false,
      secret: false,
      sourceExpectation: 'committed non-secret Compose default, overridable locally',
      absentValueBehavior: 'falls back to the committed development default',
    },
    {
      name: 'POSTGRES_PASSWORD',
      purpose: 'PostgreSQL service password for the Docker-managed development/test infrastructure container.',
      scopes: ['development', 'test'],
      consumer: 'Docker-managed PostgreSQL service',
      required: false,
      secret: true,
      sourceExpectation:
        'insecure committed development-only default, overridable locally; must never be reused for production',
      absentValueBehavior: 'falls back to the insecure development-only default, which must never reach production',
    },
    {
      name: 'POSTGRES_DB',
      purpose: 'PostgreSQL database name for the Docker-managed development/test infrastructure container.',
      scopes: ['development', 'test'],
      consumer: 'Docker-managed PostgreSQL service and its health check',
      required: false,
      secret: false,
      sourceExpectation: 'committed non-secret Compose default, distinct per environment scope',
      absentValueBehavior: 'falls back to the committed development default',
    },
  ],

  databaseEngine: {
    engine: 'postgresql',
    distinctScopeIdentities: true,
    developmentDataPersistsAcrossRestart: true,
    testDataIsolatedFromDevelopmentAndProduction: true,
    productionNeverAValidResetTarget: true,
    processHealthDoesNotProveSchemaReadiness: true,
  },

  databaseToolkit: {
    toolkit: 'prisma',
    schemaOwnsLogicalDesign: true,
    generatedClientIsDerivedOutput: true,
    canonicalApplicationClientRequired: true,
    migrationCreateAndDeployAreDistinctOperations: true,
    committedSqlMigrationsOwnEvolution: true,
    clientGenerationRequiredAt: ['setup', 'build', 'test'],
    testAndProductionReplayCommittedMigrations: true,
    seedPolicy: {
      kind: 'none',
      description:
        'No seed data by default. Development sample data and required bootstrap data remain distinct, ' +
        'typed classifications for a future project to opt into explicitly; this capability does not invent one.',
    },
  },

  testDatabase: {
    identityDistinctFromDevelopment: true,
    identityDistinctFromProduction: true,
    migrationsReplayable: true,
    databaseBackedTestsUseTestState: true,
    resetDeterministic: true,
    resetGuarded: true,
    noOpCommandCannotCountAsEvidence: true,
  },

  containerRuntime: {
    runtime: 'docker',
    responsibilities: GREENFIELD_DOCKER_RESPONSIBILITIES,
    productionImage: {
      multiStageBuild: true,
      deterministicDependencyInstall: true,
      prismaClientGenerationBeforeBuildWhenRequired: true,
      nextjsProductionBuild: true,
      standaloneRuntimeOutputWhenSupported: true,
      nonRootRuntimePreferred: true,
      buildContextAwareDockerignore: true,
    },
  },

  healthReadiness: {
    distinctConcerns: GREENFIELD_READINESS_CONCERNS,
    processLivenessProvesDatabaseReachability: false,
    postgresqlHealthProvesSchemaReadiness: false,
  },

  productionMigration: {
    responsibility: 'pre-traffic-singleton-operation',
    everyReplicaIndependentlyMigratesOnStartup: false,
    dockerEntrypointSideEffect: false,
    exposesExplicitMigrationDeployResponsibility: true,
    deploymentPlatformOwnershipOutOfScope: true,
  },

  resetRecovery: {
    allowedScopes: ['development', 'test'],
    productionAllowed: false,
    targetIdentityMustBeParsedAndValidated: true,
    ambiguousTargetFailsClosed: true,
    productionLikeTargetFailsClosed: true,
    credentialsRedactedFromFailureReporting: true,
    migrationsReplayedAfterReset: true,
    seedReplayedOnlyWhenPolicyRequiresIt: true,
  },

  lifecycleResponsibilities: [
    { operation: 'dependency-install', phase: 'development', description: 'Deterministic dependency installation from the selected lockfile.' },
    { operation: 'environment-validation', phase: 'development', description: 'Validate required environment variables are documented and present before startup.' },
    { operation: 'docker-readiness', phase: 'development', description: 'Confirm the Docker engine (including Windows Docker Desktop) is ready before any Docker-managed service is started.' },
    { operation: 'database-up', phase: 'development', description: 'Start the Docker-managed PostgreSQL development service with persistent storage.' },
    { operation: 'database-wait-health', phase: 'development', description: 'Wait for PostgreSQL to report healthy before dependent steps proceed.' },
    { operation: 'prisma-generate', phase: 'development', description: 'Generate the Prisma client from the schema.' },
    { operation: 'development-migration-setup', phase: 'development', description: 'Apply or create development migrations against the development database.' },
    { operation: 'application-development-start', phase: 'development', description: 'Start the Next.js application in development mode (host, hot reload).' },
    { operation: 'database-application-shutdown', phase: 'development', description: 'Ordinary shutdown of the application and database service, preserving development data.' },

    { operation: 'test-database-up', phase: 'test', description: 'Start the Docker-managed PostgreSQL test service, isolated from development.' },
    { operation: 'test-database-wait-health', phase: 'test', description: 'Wait for the test PostgreSQL service to report healthy.' },
    { operation: 'prisma-generate', phase: 'test', description: 'Regenerate the Prisma client for the test run.' },
    { operation: 'migration-deploy-replay', phase: 'test', description: 'Replay committed migrations against the test database using the deploy operation, never ad hoc schema creation.' },
    { operation: 'reset', phase: 'test', description: 'Guarded, deterministic reset of test database state before or between test runs.' },
    { operation: 'database-backed-test-execution', phase: 'test', description: 'Run tests that prove real database-backed behavior, not file presence alone.' },
    { operation: 'cleanup', phase: 'test', description: 'Stop test services and report evidence without leaving the environment in a claimed-but-unproven passing state.' },

    { operation: 'application-build', phase: 'production', description: 'Production Next.js build.' },
    { operation: 'production-image-build', phase: 'production', description: 'Multi-stage, deterministic production container image build.' },
    { operation: 'production-migration-deploy', phase: 'production', description: 'Singleton pre-traffic migration replay against the production database, owned separately from application startup.' },
    { operation: 'container-smoke', phase: 'production', description: 'Production-style container startup smoke validation.' },
    { operation: 'liveness-readiness-verification', phase: 'production', description: 'Verify process liveness, PostgreSQL health, and application/database readiness as distinct evidence.' },
  ],

  documentResponsibilities: [
    { document: 'docs/ARCHITECTURE.md', responsibility: 'Application/database/container topology.' },
    { document: 'docs/CONTRACTS.md', responsibility: 'Environment/database/migration/reset/readiness invariants.' },
    { document: 'docs/COMMANDS.md', responsibility: 'Actual generated project command surface.' },
    { document: 'docs/WORKFLOWS.md', responsibility: 'Development/migration/testing/reset procedures.' },
    { document: 'docs/DEVELOPMENT.md', responsibility: 'Contributor setup.' },
    { document: 'docs/CI_CD.md', responsibility: 'Test database and production build/migration lifecycle.' },
    { document: 'docs/SECURITY.md', responsibility: 'Secret and destructive-operation boundaries.' },
  ],

  // ─── v1.3.1 Batch 4: scaffold-plan composition data ────────────────────────
  //
  // Additive to the selected nextjs-app profile's own targetExpectations/
  // setupCommands/validationCommands (see buildScaffoldPlan.ts). All paths
  // use the same flat, root-relative layout the existing nextjs-app profile
  // already uses (package.json, app/layout.tsx, ...), so the Docker build
  // context is the repository root and `.dockerignore` lives there too --
  // deliberately avoiding the Biolit reference's confirmed context/
  // `.dockerignore`-location mismatch (apps/web/.dockerignore under a
  // root-context Compose build).

  targetExpectations: [
    {
      id: 'dockerfile',
      category: 'infrastructure',
      matcher: { kind: 'exact', value: 'Dockerfile' },
      required: true,
      purpose: 'Production-oriented multi-stage Next.js image, built from the repository root context.',
      evidenceKind: 'file',
    },
    {
      id: 'dockerignore',
      category: 'infrastructure',
      matcher: { kind: 'exact', value: '.dockerignore' },
      required: true,
      purpose:
        'Build-context-correct ignore file at the repository root, matching the Dockerfile\'s actual build ' +
        'context (avoids the known apps/web/.dockerignore-under-root-context mismatch).',
      evidenceKind: 'file',
    },
    {
      id: 'compose-development',
      category: 'infrastructure',
      matcher: { kind: 'exact', value: 'compose.yaml' },
      required: true,
      purpose: 'Development/full-stack Compose file: PostgreSQL infrastructure service, health checks, and optional full-container application service.',
      evidenceKind: 'file',
    },
    {
      id: 'compose-test',
      category: 'infrastructure',
      matcher: { kind: 'exact', value: 'compose.test.yaml' },
      required: true,
      purpose: 'Isolated test Compose file with a distinct PostgreSQL service/database identity from development.',
      evidenceKind: 'file',
    },
    {
      id: 'env-example',
      category: 'configuration',
      matcher: { kind: 'exact', value: '.env.example' },
      required: true,
      purpose: 'Committed non-secret environment template covering host and container database addressing.',
      evidenceKind: 'file',
    },
    {
      id: 'env-test-example',
      category: 'configuration',
      matcher: { kind: 'exact', value: '.env.test.example' },
      required: true,
      purpose: 'Committed non-secret test environment template with an isolated test database identity.',
      evidenceKind: 'file',
    },
    {
      id: 'prisma-schema',
      category: 'source',
      matcher: { kind: 'exact', value: 'prisma/schema.prisma' },
      required: true,
      purpose: 'Prisma schema: the canonical logical database design owner.',
      evidenceKind: 'file',
    },
    {
      id: 'prisma-migration-baseline',
      category: 'source',
      matcher: { kind: 'exact', value: 'prisma/migrations/migration_lock.toml' },
      required: true,
      purpose: 'Committed migration baseline anchor proving migrations are tracked as evolution artifacts, not ad hoc schema pushes.',
      evidenceKind: 'file',
    },
    {
      id: 'canonical-db-client',
      category: 'source',
      matcher: { kind: 'exact', value: 'lib/db.ts' },
      required: true,
      purpose: 'The one canonical application database client owner, used by every database-backed code path.',
      evidenceKind: 'file',
    },
    {
      id: 'env-check-helper',
      category: 'source',
      matcher: { kind: 'exact', value: 'scripts/check-env.mjs' },
      required: true,
      purpose: 'Environment-validation helper proving required variables are documented and present before startup.',
      evidenceKind: 'file',
    },
    {
      id: 'docker-ready-helper',
      category: 'source',
      matcher: { kind: 'exact', value: 'scripts/docker-ready.mjs' },
      required: true,
      purpose: 'Docker-engine readiness helper: checks engine availability and waits boundedly (including Windows Docker Desktop startup) before failing with actionable diagnostics.',
      evidenceKind: 'file',
    },
    {
      id: 'wait-for-db-helper',
      category: 'source',
      matcher: { kind: 'exact', value: 'scripts/wait-for-db.mjs' },
      required: true,
      purpose: 'Bounded PostgreSQL health-wait helper, distinct from application readiness.',
      evidenceKind: 'file',
    },
    {
      id: 'db-reset-helper',
      category: 'source',
      matcher: { kind: 'exact', value: 'scripts/db-reset.mjs' },
      required: true,
      purpose: 'Guarded development/test database reset helper: parses and validates target identity, fails closed on ambiguous or production-like targets, redacts credentials, and replays migrations after reset.',
      evidenceKind: 'file',
    },
    {
      id: 'health-readiness-route',
      category: 'source',
      matcher: { kind: 'exact', value: 'app/api/health/route.ts' },
      required: true,
      purpose:
        'Application liveness/readiness endpoint distinguishing process liveness, PostgreSQL health, and ' +
        'application/database readiness; also serves as the minimal database-backed first vertical slice ' +
        '(Next.js -> canonical Prisma client -> PostgreSQL -> observable result).',
      evidenceKind: 'file',
    },
  ],

  setupCommands: [
    {
      command: 'npm run env:check',
      purpose: 'Validate required environment variables are documented and present before any service starts.',
      required: true,
      lifecyclePhase: 'development',
    },
    {
      command: 'npm run docker:ready',
      purpose: 'Confirm the Docker engine (including Windows Docker Desktop) is ready before starting Docker-managed services.',
      required: true,
      lifecyclePhase: 'development',
    },
    {
      command: 'npm run dev:db',
      purpose: 'Start the Docker-managed PostgreSQL development service with persistent storage.',
      required: true,
      lifecyclePhase: 'development',
    },
    {
      command: 'npm run dev:db:wait',
      purpose: 'Wait for the development PostgreSQL service to report healthy.',
      required: true,
      lifecyclePhase: 'development',
    },
    {
      command: 'npm run prisma:generate',
      purpose: 'Generate the Prisma client from the schema; required at setup, build, and test.',
      required: true,
      lifecyclePhase: 'development',
    },
    {
      command: 'npm run prisma:migrate:dev',
      purpose: 'Create/apply development migrations against the development database.',
      required: true,
      lifecyclePhase: 'development',
    },
    {
      command: 'npm run dev',
      purpose: 'Start the Next.js application in development mode (host, hot reload).',
      required: false,
      lifecyclePhase: 'development',
      environmentNotes: 'Long-running development server; not a one-shot verification command.',
    },
    {
      command: 'npm run dev:down',
      purpose: 'Ordinary shutdown of the application and development database service, preserving development data.',
      required: false,
      lifecyclePhase: 'development',
      environmentNotes: 'Optional convenience command; ordinary process/container shutdown is also acceptable.',
    },
    {
      command: 'npm run test:db:up',
      purpose: 'Start the Docker-managed PostgreSQL test service, isolated from development.',
      required: true,
      lifecyclePhase: 'test',
    },
    {
      command: 'npm run test:db:wait',
      purpose: 'Wait for the test PostgreSQL service to report healthy.',
      required: true,
      lifecyclePhase: 'test',
    },
    {
      command: 'npm run test:db:migrate:deploy',
      purpose: 'Replay committed migrations against the test database using the deploy operation, never ad hoc schema creation.',
      required: true,
      lifecyclePhase: 'test',
    },
    {
      command: 'npm run test:db:reset',
      purpose: 'Guarded, deterministic reset of test database state, restricted to the test environment.',
      required: true,
      lifecyclePhase: 'test',
      destructive: true,
    },
  ],

  validationCommands: [
    {
      command: 'npm run test:db:down',
      purpose: 'Stop test services and report evidence without leaving state that could be mistaken for a passing run.',
      required: false,
      lifecyclePhase: 'test',
      environmentNotes: 'Optional cleanup command; some CI environments tear down services by other means.',
    },
    {
      command: 'docker build -t app:fullstack .',
      purpose: 'Deterministic, multi-stage production container image build from the repository-root context.',
      required: true,
      lifecyclePhase: 'production',
    },
    {
      command: 'npm run db:migrate:deploy',
      purpose: 'Singleton pre-traffic production migration replay, owned separately from application startup and never run by every replica independently.',
      required: true,
      lifecyclePhase: 'production',
    },
    {
      command: 'docker compose -f compose.yaml up -d app',
      purpose: 'Start the production-style application container for smoke validation.',
      required: false,
      lifecyclePhase: 'production',
      environmentNotes: 'Production-like local smoke only; not a substitute for an actual deployment platform.',
    },
    {
      command: 'npm run smoke:liveness',
      purpose: 'Verify the application process is alive (liveness only, not database readiness).',
      required: false,
      lifecyclePhase: 'production',
      environmentNotes: 'Optional local smoke check; requires the production-style container to be running.',
    },
    {
      command: 'npm run smoke:readiness',
      purpose: 'Verify the application can reach PostgreSQL and the expected schema/migration state is usable.',
      required: false,
      lifecyclePhase: 'production',
      environmentNotes: 'Optional local smoke check; requires the production-style container to be running.',
    },
    {
      command: 'docker compose -f compose.yaml down',
      purpose: 'Clean shutdown of the production-like smoke environment.',
      required: false,
      lifecyclePhase: 'production',
      environmentNotes: 'Optional cleanup command for the local smoke environment.',
    },
  ],
};
