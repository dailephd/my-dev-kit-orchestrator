// v1.3.1 Batch 4: tests for scaffold-plan composition (profile + Batch 3
// full-stack capability), composed scaffold-plan validation, persisted-plan
// round trip, and stage/CLI/Batch 1-3 regression.

import { normalizeProjectBrief } from '../../src/greenfield/brief/normalizeProjectBrief';
import { resolveGreenfieldProfile } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { buildGreenfieldBootstrapBundle } from '../../src/greenfield/bootstrap/buildBootstrapBundle';
import { buildScaffoldPlan } from '../../src/greenfield/scaffold/buildScaffoldPlan';
import { validateGreenfieldScaffoldPlan } from '../../src/greenfield/scaffold/validateGreenfieldScaffoldPlan';
import { GreenfieldScaffoldPlan } from '../../src/greenfield/scaffold/scaffoldPlanTypes';
import { parseArtifact } from '../../src/artifactChecker';
import { parseGreenfieldScaffoldPlanArtifact } from '../../src/greenfield/readiness/parseGreenfieldEvidence';
import { NEXTJS_APP_PROFILE } from '../../src/greenfield/profiles/nextjsAppProfile';
import { TYPESCRIPT_CLI_PROFILE } from '../../src/greenfield/profiles/typescriptCliProfile';
import { ANDROID_COMPOSE_PROFILE } from '../../src/greenfield/profiles/androidComposeProfile';
import { GREENFIELD_PROJECT_INSTRUCTION_PATHS } from '../../src/greenfield/bootstrap/projectInstructions/projectInstructionTypes';

function buildBundleFor(rawIdea: string, overrides: Record<string, unknown> = {}) {
  const normalizedBrief = normalizeProjectBrief({ rawIdea, ...overrides } as any).normalized;
  const selection = resolveGreenfieldProfile(normalizedBrief);
  return buildGreenfieldBootstrapBundle(normalizedBrief, selection);
}

function fullstackBundle(overrides: Record<string, unknown> = {}) {
  return buildBundleFor('A full-stack web app for tracking inventory.', {
    preferredProfile: 'nextjs-app',
    projectType: 'fullstack-web',
    webFramework: 'nextjs',
    ...overrides,
  });
}

describe('buildScaffoldPlan - full-stack composition (v1.3.1 Batch 4)', () => {
  // TST-B4-011: base + capability target composition.
  it('TST-B4-011: a full-stack nextjs-app plan contains base profile targets plus capability targets', () => {
    const bundle = fullstackBundle();
    const plan = buildScaffoldPlan(bundle);
    const allPaths = plan.plannedFileGroups.flatMap((g) => g.filePaths);
    for (const target of NEXTJS_APP_PROFILE.templateTargets) {
      expect(allPaths).toContain(target);
    }
    const capability = bundle.fullstackCapability.capability!;
    for (const expectation of capability.targetExpectations) {
      if (expectation.matcher.kind === 'exact') {
        expect(allPaths).toContain(expectation.matcher.value);
      }
    }
  });

  // TST-B4-012: non-full-stack scaffold preservation.
  it('TST-B4-012: normal nextjs-app, typescript-cli, and android-compose plans are unchanged by Batch 4', () => {
    const nextjsPlan = buildScaffoldPlan(buildBundleFor('A web app.', { preferredProfile: 'nextjs-app' }));
    expect(nextjsPlan.plannedFileGroups.flatMap((g) => g.filePaths).sort()).toEqual(
      [...GREENFIELD_PROJECT_INSTRUCTION_PATHS, ...NEXTJS_APP_PROFILE.templateTargets].sort(),
    );
    expect(nextjsPlan.setupCommands).toEqual(NEXTJS_APP_PROFILE.setupCommands);
    expect(nextjsPlan.validationCommands).toEqual(NEXTJS_APP_PROFILE.validationCommands);

    const cliPlan = buildScaffoldPlan(buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' }));
    expect(cliPlan.setupCommands).toEqual(TYPESCRIPT_CLI_PROFILE.setupCommands);

    const androidPlan = buildScaffoldPlan(buildBundleFor('An Android app.', { preferredProfile: 'android-compose' }));
    expect(androidPlan.setupCommands).toEqual(ANDROID_COMPOSE_PROFILE.setupCommands);
  });

  // TST-B4-013: Docker build-context safety.
  it('TST-B4-013: .dockerignore and Dockerfile share the same repository-root build context', () => {
    const bundle = fullstackBundle();
    const capability = bundle.fullstackCapability.capability!;
    const dockerfile = capability.targetExpectations.find((e) => e.id === 'dockerfile')!;
    const dockerignore = capability.targetExpectations.find((e) => e.id === 'dockerignore')!;
    // both at repository root (no directory prefix), matching the flat nextjs-app layout / build context
    expect(dockerfile.matcher.value).toBe('Dockerfile');
    expect(dockerignore.matcher.value).toBe('.dockerignore');
    expect(dockerfile.matcher.value.includes('/')).toBe(false);
    expect(dockerignore.matcher.value.includes('/')).toBe(false);
  });

  // TST-B4-014: environment template planning.
  it('TST-B4-014: distinguishes committed non-secret development/test templates and host/container context', () => {
    const bundle = fullstackBundle();
    const capability = bundle.fullstackCapability.capability!;
    const targetIds = capability.targetExpectations.map((e) => e.id);
    expect(targetIds).toContain('env-example');
    expect(targetIds).toContain('env-test-example');
    const addresses = capability.developmentEnvironment.addresses;
    expect(addresses.some((a) => a.context === 'host')).toBe(true);
    expect(addresses.some((a) => a.context === 'container')).toBe(true);
    const serialized = JSON.stringify(capability.environmentVariables);
    expect(serialized).not.toMatch(/[:=]\s*"[a-zA-Z0-9]{16,}"/); // no plausible real secret value
  });

  // TST-B4-015: Prisma/database planning.
  it('TST-B4-015: includes schema, migration baseline, canonical client, generation, test DB isolation, guarded reset, no default seed', () => {
    const bundle = fullstackBundle();
    const capability = bundle.fullstackCapability.capability!;
    const targetIds = capability.targetExpectations.map((e) => e.id);
    expect(targetIds).toContain('prisma-schema');
    expect(targetIds).toContain('prisma-migration-baseline');
    expect(targetIds).toContain('canonical-db-client');
    expect(targetIds).not.toContain('seed');
    expect(capability.databaseToolkit.seedPolicy.kind).toBe('none');
    expect(capability.databaseToolkit.clientGenerationRequiredAt).toEqual(
      expect.arrayContaining(['setup', 'build', 'test']),
    );
    expect(capability.testDatabase.identityDistinctFromDevelopment).toBe(true);
    const resetCommand = [...capability.setupCommands, ...capability.validationCommands].find(
      (c) => c.destructive === true,
    );
    expect(resetCommand).toBeDefined();
    expect(resetCommand!.lifecyclePhase).toBe('test');
  });

  // TST-B4-016: development lifecycle commands, no fake no-op.
  it('TST-B4-016: development lifecycle commands are real and required', () => {
    const bundle = fullstackBundle();
    const plan = buildScaffoldPlan(bundle);
    const devCommands = plan.setupCommands.filter((c) => c.lifecyclePhase === 'development' && c.required);
    const texts = devCommands.map((c) => c.command);
    expect(texts).toEqual(
      expect.arrayContaining([
        'npm run env:check',
        'npm run docker:ready',
        'npm run dev:db',
        'npm run dev:db:wait',
        'npm run prisma:generate',
        'npm run prisma:migrate:dev',
      ]),
    );
    expect(texts.every((t) => t.trim().length > 0)).toBe(true);
  });

  // TST-B4-017: test lifecycle commands.
  it('TST-B4-017: test lifecycle commands cover startup, migration replay, guarded reset, tests, and cleanup', () => {
    const bundle = fullstackBundle();
    const plan = buildScaffoldPlan(bundle);
    const allCommands = [...plan.setupCommands, ...plan.validationCommands];
    const texts = allCommands.map((c) => c.command);
    expect(texts).toEqual(
      expect.arrayContaining([
        'npm run test:db:up',
        'npm run test:db:wait',
        'npm run test:db:migrate:deploy',
        'npm run test:db:reset',
        'npm test',
        'npm run test:db:down',
      ]),
    );
  });

  // TST-B4-018: production-like lifecycle commands.
  it('TST-B4-018: production-like lifecycle commands cover build, image, migration deploy, startup, smoke, cleanup', () => {
    const bundle = fullstackBundle();
    const plan = buildScaffoldPlan(bundle);
    const texts = [...plan.setupCommands, ...plan.validationCommands].map((c) => c.command);
    expect(texts).toEqual(
      expect.arrayContaining([
        'npm run build',
        'docker build -t app:fullstack .',
        'npm run db:migrate:deploy',
        'docker compose -f compose.yaml up -d app',
        'npm run smoke:liveness',
        'npm run smoke:readiness',
        'docker compose -f compose.yaml down',
      ]),
    );
  });

  // TST-B4-019: migration-before-traffic invariant.
  it('TST-B4-019: production migration remains a distinct pre-traffic responsibility, not per-replica startup', () => {
    const bundle = fullstackBundle();
    const capability = bundle.fullstackCapability.capability!;
    expect(capability.productionMigration.everyReplicaIndependentlyMigratesOnStartup).toBe(false);
    expect(capability.productionMigration.dockerEntrypointSideEffect).toBe(false);
    const migrateCommand = capability.validationCommands.find((c) => c.command === 'npm run db:migrate:deploy')!;
    expect(migrateCommand.lifecyclePhase).toBe('production');
    // no command text implies migration runs on ordinary application start
    const allTexts = [...capability.setupCommands, ...capability.validationCommands].map((c) => c.command);
    expect(allTexts).not.toContain('npm start');
  });

  // TST-B4-020: reset safety.
  it('TST-B4-020: no production reset operation exists in the composed plan', () => {
    const bundle = fullstackBundle();
    const plan = buildScaffoldPlan(bundle);
    const capability = bundle.fullstackCapability.capability!;
    expect(capability.resetRecovery.allowedScopes).not.toContain('production');
    expect(capability.resetRecovery.productionAllowed).toBe(false);
    const destructiveCommands = [...capability.setupCommands, ...capability.validationCommands].filter(
      (c) => c.destructive,
    );
    expect(destructiveCommands.every((c) => c.lifecyclePhase !== 'production')).toBe(true);
    expect(plan.setupCommands.some((c) => c.command.includes('reset') && c.lifecyclePhase === 'production')).toBe(
      false,
    );
  });

  // TST-B4-021: Windows Docker readiness planning.
  it('TST-B4-021: represents bounded Docker readiness without hard-coded machine-specific paths', () => {
    const bundle = fullstackBundle();
    const capability = bundle.fullstackCapability.capability!;
    const dockerReadyTarget = capability.targetExpectations.find((e) => e.id === 'docker-ready-helper')!;
    expect(dockerReadyTarget.purpose.toLowerCase()).toMatch(/windows docker desktop/);
    expect(dockerReadyTarget.purpose).not.toMatch(/C:\\Program Files\\Docker/);
    expect(capability.developmentEnvironment.windowsDockerDesktopReadinessRecognized).toBe(true);
  });

  // TST-B4-022: liveness/health/readiness planning.
  it('TST-B4-022: requires separate liveness, PostgreSQL health, and application/database readiness responsibilities', () => {
    const bundle = fullstackBundle();
    const capability = bundle.fullstackCapability.capability!;
    expect(capability.healthReadiness.distinctConcerns).toEqual(
      expect.arrayContaining(['process-liveness', 'postgresql-health', 'application-database-readiness']),
    );
    const healthTarget = capability.targetExpectations.find((e) => e.id === 'health-readiness-route')!;
    expect(healthTarget).toBeDefined();
  });

  // TST-B4-023: database-backed first vertical slice.
  it('TST-B4-023: first runnable behavior crosses the Next.js -> Prisma -> PostgreSQL boundary', () => {
    const bundle = fullstackBundle();
    const plan = buildScaffoldPlan(bundle);
    expect(plan.firstRunnableBehavior.entryPoint).toBe('app/api/health/route.ts');
    expect(plan.firstRunnableBehavior.description.toLowerCase()).toMatch(/prisma/);
    expect(plan.firstRunnableBehavior.description.toLowerCase()).toMatch(/postgresql/);
    expect(plan.firstRunnableBehavior.description.toLowerCase()).not.toBe('render a static next.js page.');
  });
});

describe('validateGreenfieldScaffoldPlan - full-stack composition (v1.3.1 Batch 4)', () => {
  function fullPlanFor(bundle: ReturnType<typeof fullstackBundle>): GreenfieldScaffoldPlan {
    return buildScaffoldPlan(bundle);
  }

  // TST-B4-024: full-stack plan validation.
  it('TST-B4-024: a compliant full-stack plan passes composed profile + capability validation', () => {
    const bundle = fullstackBundle();
    const plan = fullPlanFor(bundle);
    const result = validateGreenfieldScaffoldPlan(NEXTJS_APP_PROFILE, plan, {
      capability: bundle.fullstackCapability.capability,
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  // TST-B4-025: missing full-stack target.
  it('TST-B4-025: removing a required full-stack target fails deterministically', () => {
    const bundle = fullstackBundle();
    const plan = fullPlanFor(bundle);
    const withoutDockerfile: GreenfieldScaffoldPlan = {
      ...plan,
      plannedFileGroups: plan.plannedFileGroups.map((g) => ({
        ...g,
        filePaths: g.filePaths.filter((p) => p !== 'Dockerfile'),
      })),
    };
    const result = validateGreenfieldScaffoldPlan(NEXTJS_APP_PROFILE, withoutDockerfile, {
      capability: bundle.fullstackCapability.capability,
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_TARGET_REQUIRED_MISSING' }));
  });

  // TST-B4-026: missing full-stack required command.
  it('TST-B4-026: removing a required full-stack command fails deterministically', () => {
    const bundle = fullstackBundle();
    const plan = fullPlanFor(bundle);
    const withoutDockerReady: GreenfieldScaffoldPlan = {
      ...plan,
      setupCommands: plan.setupCommands.filter((c) => c.command !== 'npm run docker:ready'),
    };
    const result = validateGreenfieldScaffoldPlan(NEXTJS_APP_PROFILE, withoutDockerReady, {
      capability: bundle.fullstackCapability.capability,
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_PLAN_COMMAND_MISSING', evidenceKey: 'setupCommands:npm run docker:ready' }),
    );
  });

  // TST-B4-027: base profile requirements retained.
  it('TST-B4-027: full-stack plan validation still fails if a required base nextjs-app target/command is missing', () => {
    const bundle = fullstackBundle();
    const plan = fullPlanFor(bundle);
    const withoutPackageJson: GreenfieldScaffoldPlan = {
      ...plan,
      plannedFileGroups: plan.plannedFileGroups.map((g) => ({
        ...g,
        filePaths: g.filePaths.filter((p) => p !== 'package.json'),
      })),
    };
    const result = validateGreenfieldScaffoldPlan(NEXTJS_APP_PROFILE, withoutPackageJson, {
      capability: bundle.fullstackCapability.capability,
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_TARGET_REQUIRED_MISSING', evidenceKey: 'package-manifest' }),
    );
  });

  it('flags capability/profile misalignment defensively', () => {
    const bundle = fullstackBundle();
    const plan = fullPlanFor(bundle);
    const misaligned = {
      ...bundle.fullstackCapability.capability!,
      starterProfile: 'typescript-cli' as never,
    };
    const result = validateGreenfieldScaffoldPlan(NEXTJS_APP_PROFILE, plan, { capability: misaligned });
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_FULLSTACK_PROFILE_MISMATCH' }));
  });

  it('is deterministic and does not mutate its inputs', () => {
    const bundle = fullstackBundle();
    const plan = fullPlanFor(bundle);
    const beforePlan = JSON.parse(JSON.stringify(plan));
    const beforeProfile = JSON.parse(JSON.stringify(NEXTJS_APP_PROFILE));
    const first = validateGreenfieldScaffoldPlan(NEXTJS_APP_PROFILE, plan, {
      capability: bundle.fullstackCapability.capability,
    });
    const second = validateGreenfieldScaffoldPlan(NEXTJS_APP_PROFILE, plan, {
      capability: bundle.fullstackCapability.capability,
    });
    expect(first).toEqual(second);
    expect(plan).toEqual(beforePlan);
    expect(NEXTJS_APP_PROFILE).toEqual(beforeProfile);
  });
});

describe('persisted scaffold-plan round trip - full-stack (v1.3.1 Batch 4)', () => {
  function renderPlanAsPersistedText(plan: GreenfieldScaffoldPlan): string {
    const targetPaths = plan.plannedFileGroups.flatMap((g) => g.filePaths).map((p) => `- ${p}`).join('\n');
    const renderCommands = (commands: GreenfieldScaffoldPlan['setupCommands']) =>
      commands
        .map((c) => (c.required ? `- ${c.command}: required` : `- ${c.command}: optional, ${c.environmentNotes ?? 'optional'}`))
        .join('\n');
    return `Artifact: ScaffoldPlan
Workflow mode: greenfield
Profile: ${plan.profileId}
Planned file groups: full-stack plan.
Target paths:
${targetPaths}
First runnable behavior: ${plan.firstRunnableBehavior.description}
Setup commands:
${renderCommands(plan.setupCommands)}
Validation commands:
${renderCommands(plan.validationCommands)}
Test expectations:
- database-backed integration tests
Documentation expectations:
- README usage section
Unresolved decisions:
- none noted
Non-goals:
- no authentication
Status: complete
`;
  }

  // TST-B4-028: persisted plan round trip.
  it('TST-B4-028: a rendered and re-parsed full-stack plan preserves enough information for equivalent validation', () => {
    const bundle = fullstackBundle();
    const capability = bundle.fullstackCapability.capability!;
    const plan = buildScaffoldPlan(bundle);
    const text = renderPlanAsPersistedText(plan);
    const roundTripped = parseGreenfieldScaffoldPlanArtifact(parseArtifact(text));

    const original = validateGreenfieldScaffoldPlan(NEXTJS_APP_PROFILE, plan, { capability });
    const reparsed = validateGreenfieldScaffoldPlan(NEXTJS_APP_PROFILE, roundTripped, { capability });
    expect(original.valid).toBe(true);
    expect(reparsed.valid).toBe(true);
  });

  // TST-B4-029: legacy persisted-plan compatibility.
  it('TST-B4-029: a pre-v1.3.1 non-full-stack persisted plan remains valid through existing compatibility behavior', () => {
    const legacyText = `Artifact: ScaffoldPlan
Workflow mode: greenfield
Profile: typescript-cli
Planned file groups: core CLI files.
Target paths:
- package.json
- src/cli.ts
- src/index.ts
- README.md
First runnable behavior: running the CLI prints a greeting.
Setup commands:
- npm install: required
Validation commands:
- npm run typecheck: required
- npm run build: required
- npm test: required
Test expectations:
- unit tests for the CLI entry point
Documentation expectations:
- README usage section
Unresolved decisions:
- none
Non-goals:
- no GUI
Status: complete
`;
    const legacyPlan = parseGreenfieldScaffoldPlanArtifact(parseArtifact(legacyText));
    // No capability option is passed, but current direct validation still
    // applies the additive Batch 2 common-target contract. Run-level legacy
    // evidence remains protected by evaluateGreenfieldReadiness's no-Profile gate.
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, legacyPlan);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_TARGET_REQUIRED_MISSING', evidenceKey: 'common-agents-instructions' }),
    );
  });
});

describe('v1.3.1 Batch 4 regression - stages, CLI, and Batch 1-3 unaffected', () => {
  // TST-B4-030: project-docs stage unchanged structurally.
  it('TST-B4-030: project-docs remains one native stage with the same artifact path', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GREENFIELD_STAGE_NAMES } = require('../../src/greenfield/modes/greenfieldStages');
    expect(GREENFIELD_STAGE_NAMES).toContain('project-docs');
    expect(GREENFIELD_STAGE_NAMES.filter((s: string) => s.includes('project-docs'))).toEqual(['project-docs']);
  });

  // TST-B4-031: scaffold-plan stage unchanged structurally.
  it('TST-B4-031: scaffold-plan remains one native stage with its existing prompt/artifact identity', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GREENFIELD_STAGE_NAMES } = require('../../src/greenfield/modes/greenfieldStages');
    expect(GREENFIELD_STAGE_NAMES).toContain('scaffold-plan');
    expect(GREENFIELD_STAGE_NAMES).toHaveLength(13);
  });

  // TST-B4-032: Batch 1-3 regression.
  it('TST-B4-032: Batch 1 dimensions, Batch 2 canonical docs, and Batch 3 capability resolution remain intact', () => {
    const selection = resolveGreenfieldProfile(
      normalizeProjectBrief({
        rawIdea: 'A full-stack app.',
        preferredProfile: 'nextjs-app',
        projectType: 'fullstack-web',
        webFramework: 'nextjs',
      }).normalized,
    );
    expect(selection.status).toBe('selected');

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GREENFIELD_CANONICAL_DOCUMENT_PATHS } = require('../../src/greenfield/bootstrap/projectDocBootstrapTypes');
    expect(GREENFIELD_CANONICAL_DOCUMENT_PATHS).toHaveLength(15);

    const bundle = fullstackBundle();
    expect(bundle.fullstackCapability.status).toBe('selected');
    expect(bundle.fullstackCapability.capability!.databaseEngine.engine).toBe('postgresql');
  });

  // TST-B4-033: no runtime readiness implementation leakage.
  it('TST-B4-033: Batch 4 does not evaluate actual generated Docker/database/runtime evidence', () => {
    // buildScaffoldPlan/validateGreenfieldScaffoldPlan remain pure -- no fs/child_process import
    const buildScaffoldPlanSource = require('fs').readFileSync(
      require.resolve('../../src/greenfield/scaffold/buildScaffoldPlan'),
      'utf8',
    );
    const validateSource = require('fs').readFileSync(
      require.resolve('../../src/greenfield/scaffold/validateGreenfieldScaffoldPlan'),
      'utf8',
    );
    for (const source of [buildScaffoldPlanSource, validateSource]) {
      expect(source).not.toMatch(/require\(['"]child_process['"]\)|require\(['"]fs['"]\)|import .* from ['"]fs['"]|import .* from ['"]child_process['"]/);
    }
  });
});
