// v1.3.1 Batch 5: full-stack generated-file evidence, verification-command
// evidence, first-vertical-slice, and readiness-aggregation tests. Pure,
// in-memory evidence-interpretation tests -- no Docker/PostgreSQL/Prisma/
// Next.js execution anywhere in this file, matching the existing
// evaluateGreenfieldReadiness.spec.ts pattern.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { evaluateGreenfieldReadiness } from '../../src/greenfield/readiness/evaluateGreenfieldReadiness';
import { checkGreenfieldRunReadiness } from '../../src/greenfield/readiness/checkGreenfieldRunReadiness';
import { GreenfieldReadinessInputs } from '../../src/greenfield/readiness/greenfieldReadinessTypes';
import { NEXTJS_APP_PROFILE } from '../../src/greenfield/profiles/nextjsAppProfile';
import { TYPESCRIPT_CLI_PROFILE } from '../../src/greenfield/profiles/typescriptCliProfile';
import { ANDROID_COMPOSE_PROFILE } from '../../src/greenfield/profiles/androidComposeProfile';
import { FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY } from '../../src/greenfield/fullstack/fullstackCapabilityTypes';
import { RunMetadata } from '../../src/run';
import { getWorkflow } from '../../src/workflows';

const BASE_TARGETS = ['package.json', 'app/layout.tsx', 'app/page.tsx', 'README.md'];
const FULLSTACK_TARGETS = FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.targetExpectations
  .filter((e) => e.matcher.kind === 'exact')
  .map((e) => e.matcher.value);
const ALL_TARGETS = [...BASE_TARGETS, ...FULLSTACK_TARGETS];

const ALL_COMMANDS_PASSED = [
  'npm run env:check',
  'npm run docker:ready',
  'npm run dev:db',
  'npm run dev:db:wait',
  'npm run prisma:generate',
  'npm run prisma:migrate:dev',
  'npm run typecheck',
  'npm run build',
  'npm run test:db:up',
  'npm run test:db:wait',
  'npm run test:db:migrate:deploy',
  'npm run test:db:reset',
  'npm test',
  'npm run test:db:down',
  'docker build -t app:fullstack .',
  'npm run db:migrate:deploy',
  'docker compose -f compose.yaml up -d app',
  'npm run smoke:liveness',
  'npm run smoke:readiness',
  'docker compose -f compose.yaml down',
];

function scaffoldReport(targets: readonly string[]): string {
  return `Artifact: ScaffoldImplementationReport
Workflow mode: greenfield
Profile: nextjs-app
Files changed:
${targets.map((t) => `- ${t}`).join('\n')}
Commands run:
- npm install: passed
Deviations: none
Blockers: none
Risks: none
Status: complete
`;
}

function firstSlice(minimalBehavior: string): string {
  return `Artifact: FirstVerticalSlice
Workflow mode: greenfield
Profile: nextjs-app
Minimal behavior: ${minimalBehavior}
Entry point: app/api/health/route.ts
Tied to product boundary: Demonstrates the core full-stack request path described in the product boundary document.
Status: complete
`;
}

function verificationReport(commandLines: readonly string[]): string {
  return `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
${commandLines.map((c) => `- ${c}: passed`).join('\n')}
Status: complete
`;
}

const VALID_FULLSTACK_SLICE_TEXT =
  'The GET /api/health route uses the canonical Prisma database client to run a query against PostgreSQL and ' +
  'returns the result as JSON, proving the application can reach and use the database.';

function fullstackInputs(overrides: Partial<GreenfieldReadinessInputs> = {}): GreenfieldReadinessInputs {
  return {
    profile: NEXTJS_APP_PROFILE,
    capability: FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
    scaffoldImplementationReportContent: scaffoldReport(ALL_TARGETS),
    firstVerticalSliceContent: firstSlice(VALID_FULLSTACK_SLICE_TEXT),
    verificationReportContent: verificationReport(ALL_COMMANDS_PASSED),
    ...overrides,
  };
}

describe('evaluateGreenfieldReadiness - full-stack successful replay (v1.3.1 Batch 5)', () => {
  // TST-B5-021: complete successful replay.
  it('TST-B5-021: a complete valid full-stack fixture reaches ready with zero issues', () => {
    const result = evaluateGreenfieldReadiness(fullstackInputs());
    expect(result.ready).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.legacyRun).toBe(false);
    expect(result.issues).toEqual([]);
  });

  // TST-B5-001: full-stack generated target evidence success.
  it('TST-B5-001: generated-file evidence for all required targets satisfies the generated-file portion', () => {
    const result = evaluateGreenfieldReadiness(fullstackInputs());
    expect(result.issues.filter((i) => i.code.startsWith('GF_GENERATED_EVIDENCE'))).toEqual([]);
  });

  // TST-B5-002: missing generated target blocks readiness.
  it('TST-B5-002: removing one required full-stack target blocks readiness', () => {
    const withoutDockerfile = ALL_TARGETS.filter((t) => t !== 'Dockerfile');
    const result = evaluateGreenfieldReadiness(
      fullstackInputs({ scaffoldImplementationReportContent: scaffoldReport(withoutDockerfile) }),
    );
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_GENERATED_EVIDENCE_MISSING', evidenceKey: 'dockerfile' }),
    );
  });

  // TST-B5-003: file presence does not prove runtime success.
  it('TST-B5-003: complete generated-file evidence without verification evidence does not yield readiness', () => {
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: undefined }));
    expect(result.ready).toBe(false);
    expect(result.issues.some((i) => i.code === 'GF_COMMAND_EVIDENCE_MISSING')).toBe(true);
  });

  // TST-B5-004/005: Docker readiness required / failure.
  it('TST-B5-004: missing Docker readiness evidence blocks readiness', () => {
    const commands = ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run docker:ready');
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: verificationReport(commands) }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_EVIDENCE_MISSING', evidenceKey: 'npm run docker:ready' }),
    );
  });

  it('TST-B5-005: explicit Docker readiness failure remains a blocker', () => {
    const text = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
- npm run docker:ready: failed, Docker Desktop did not become ready within the bounded timeout
${ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run docker:ready').map((c) => `- ${c}: passed`).join('\n')}
Status: incomplete
`;
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: text }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_EVIDENCE_MISSING', evidenceKey: 'npm run docker:ready' }),
    );
  });

  // TST-B5-006: PostgreSQL health required.
  it('TST-B5-006: PostgreSQL startup without health evidence is insufficient', () => {
    const commands = ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run dev:db:wait');
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: verificationReport(commands) }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_EVIDENCE_MISSING', evidenceKey: 'npm run dev:db:wait' }),
    );
  });

  // TST-B5-007: Prisma generation required.
  it('TST-B5-007: required Prisma generation evidence must be present and successful', () => {
    const commands = ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run prisma:generate');
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: verificationReport(commands) }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_EVIDENCE_MISSING', evidenceKey: 'npm run prisma:generate' }),
    );
  });

  // TST-B5-008: development migration required.
  it('TST-B5-008: the required development migration operation must have successful evidence', () => {
    const commands = ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run prisma:migrate:dev');
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: verificationReport(commands) }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_EVIDENCE_MISSING', evidenceKey: 'npm run prisma:migrate:dev' }),
    );
  });

  // TST-B5-009/010: test DB lifecycle required / migration replay required.
  it('TST-B5-009: test DB lifecycle evidence is required', () => {
    const commands = ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run test:db:up');
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: verificationReport(commands) }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_EVIDENCE_MISSING', evidenceKey: 'npm run test:db:up' }),
    );
  });

  it('TST-B5-010: test DB startup alone is insufficient without migration replay', () => {
    const commands = ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run test:db:migrate:deploy');
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: verificationReport(commands) }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_EVIDENCE_MISSING', evidenceKey: 'npm run test:db:migrate:deploy' }),
    );
  });

  // TST-B5-011: database-backed tests required.
  it('TST-B5-011: generic test success without the recorded database-backed test operation is insufficient', () => {
    const commands = ALL_COMMANDS_PASSED.filter((c) => c !== 'npm test');
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: verificationReport(commands) }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_EVIDENCE_MISSING', evidenceKey: 'npm test' }),
    );
  });

  it('TST-B5-011b: a failed database-backed test blocks readiness', () => {
    const text = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
${ALL_COMMANDS_PASSED.filter((c) => c !== 'npm test').map((c) => `- ${c}: passed`).join('\n')}
- npm test: failed, two integration tests failed against the test database
Status: incomplete
`;
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: text }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_EVIDENCE_MISSING', evidenceKey: 'npm test' }),
    );
  });

  // TST-B5-012: test cleanup required (optional, but skip-without-reason still fails).
  it('TST-B5-012: an optional cleanup command skipped without a reason still fails deterministically', () => {
    const text = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
${ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run test:db:down').map((c) => `- ${c}: passed`).join('\n')}
- npm run test:db:down: skipped
Status: incomplete
`;
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: text }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_OPTIONAL_SKIP_REASON_MISSING', evidenceKey: 'npm run test:db:down' }),
    );
  });

  // TST-B5-013: production build required.
  it('TST-B5-013: development-only success does not substitute for required production build evidence', () => {
    const commands = ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run build');
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: verificationReport(commands) }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_EVIDENCE_MISSING', evidenceKey: 'npm run build' }),
    );
  });

  // TST-B5-014: production Docker image build required.
  it('TST-B5-014: Dockerfile presence does not substitute for production image-build evidence', () => {
    const commands = ALL_COMMANDS_PASSED.filter((c) => c !== 'docker build -t app:fullstack .');
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: verificationReport(commands) }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_EVIDENCE_MISSING', evidenceKey: 'docker build -t app:fullstack .' }),
    );
  });

  // TST-B5-015: production migration required separately.
  it('TST-B5-015: production-like startup without the distinct production migration evidence remains blocked', () => {
    const commands = ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run db:migrate:deploy');
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: verificationReport(commands) }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_EVIDENCE_MISSING', evidenceKey: 'npm run db:migrate:deploy' }),
    );
  });

  it('TST-B5-015b: migration ordering violation is reported when readiness precedes migration', () => {
    const text = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
${ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run db:migrate:deploy' && c !== 'npm run smoke:readiness')
  .map((c) => `- ${c}: passed`)
  .join('\n')}
- npm run smoke:readiness: passed
- npm run db:migrate:deploy: passed
Status: complete
`;
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: text }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_FULLSTACK_MIGRATION_ORDER_VIOLATION' }));
  });

  // TST-B5-016: application startup required.
  it('TST-B5-016: image build success alone does not establish runtime startup', () => {
    const commands = ALL_COMMANDS_PASSED.filter((c) => c !== 'docker compose -f compose.yaml up -d app');
    const text = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
${commands.map((c) => `- ${c}: passed`).join('\n')}
- docker compose -f compose.yaml up -d app: skipped
Status: incomplete
`;
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: text }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_OPTIONAL_SKIP_REASON_MISSING', evidenceKey: 'docker compose -f compose.yaml up -d app' }),
    );
  });

  // TST-B5-017: liveness required.
  it('TST-B5-017: application startup evidence alone does not establish liveness when skipped without reason', () => {
    const text = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
${ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run smoke:liveness').map((c) => `- ${c}: passed`).join('\n')}
- npm run smoke:liveness: skipped
Status: incomplete
`;
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: text }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_OPTIONAL_SKIP_REASON_MISSING', evidenceKey: 'npm run smoke:liveness' }),
    );
  });

  // TST-B5-018/019: app/database readiness required; three-way distinction.
  it('TST-B5-018: liveness plus PostgreSQL health does not establish application/database readiness when skipped without reason', () => {
    const text = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
${ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run smoke:readiness').map((c) => `- ${c}: passed`).join('\n')}
- npm run smoke:readiness: skipped
Status: incomplete
`;
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: text }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_OPTIONAL_SKIP_REASON_MISSING', evidenceKey: 'npm run smoke:readiness' }),
    );
  });

  it('TST-B5-019: the evaluator independently represents PostgreSQL health, liveness, and app/database readiness', () => {
    // three independent commands prove three independent concerns
    expect(FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.healthReadiness.distinctConcerns).toEqual(
      expect.arrayContaining(['process-liveness', 'postgresql-health', 'application-database-readiness']),
    );
    const livenessCmd = 'npm run smoke:liveness';
    const readinessCmd = 'npm run smoke:readiness';
    const healthCmd = 'npm run dev:db:wait';
    expect(new Set([livenessCmd, readinessCmd, healthCmd]).size).toBe(3);
  });

  // TST-B5-020: database-backed first slice required.
  it('TST-B5-020: a static first slice does not satisfy full-stack first-vertical-slice readiness', () => {
    const staticSlice = firstSlice('Renders a static Next.js page with a welcome message.');
    const result = evaluateGreenfieldReadiness(fullstackInputs({ firstVerticalSliceContent: staticSlice }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_FULLSTACK_FIRST_SLICE_NOT_DATABASE_BACKED' }),
    );
  });

  // TST-B5-022: no premature judge/final-report.
  it('TST-B5-022: incomplete full-stack evidence prevents readiness regardless of an external PASS claim', () => {
    // evaluateGreenfieldReadiness never reads judge-report.txt at all -- the
    // canonical readiness decision is independent of, and cannot be fooled
    // by, a hand-authored judge verdict.
    const incomplete = fullstackInputs({
      verificationReportContent: verificationReport(ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run db:migrate:deploy')),
    });
    const result = evaluateGreenfieldReadiness(incomplete);
    expect(result.ready).toBe(false);
    // a judge-report.txt claiming PASS is not consumed by this evaluator at all
    expect(Object.keys(incomplete)).not.toContain('judgeReportContent');
  });

  // TST-B5-023/024: contradictory evidence.
  it('TST-B5-023: contradictory generated-file and verification evidence does not yield readiness', () => {
    const withoutDockerfile = ALL_TARGETS.filter((t) => t !== 'Dockerfile');
    const result = evaluateGreenfieldReadiness(
      fullstackInputs({ scaffoldImplementationReportContent: scaffoldReport(withoutDockerfile) }),
      // verification still claims "docker build" passed even though Dockerfile evidence is missing
    );
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_GENERATED_EVIDENCE_MISSING' }));
  });

  it('TST-B5-024: failed DB health combined with claimed readiness does not yield readiness', () => {
    const text = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
${ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run dev:db:wait').map((c) => `- ${c}: passed`).join('\n')}
- npm run dev:db:wait: failed, pg_isready never reported healthy within the bounded timeout
Status: complete
`;
    const result = evaluateGreenfieldReadiness(fullstackInputs({ verificationReportContent: text }));
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_EVIDENCE_MISSING', evidenceKey: 'npm run dev:db:wait' }),
    );
  });

  // TST-B5-025: reset safety evidence.
  it('TST-B5-025: the capability itself never declares a production-scoped reset (fails closed structurally)', () => {
    expect(
      FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.resetRecovery.allowedScopes,
    ).not.toContain('production');
    const destructiveCommands = [
      ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.setupCommands,
      ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.validationCommands,
    ].filter((c) => c.destructive);
    expect(destructiveCommands.every((c) => c.lifecyclePhase !== 'production')).toBe(true);
  });

  // TST-B5-026: no credential persistence.
  it('TST-B5-026: no evidence field requires storing actual database passwords/secrets', () => {
    const result = evaluateGreenfieldReadiness(fullstackInputs());
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/password\s*[:=]\s*['"][^'"]{4,}['"]/i);
  });

  // TST-B5-027: development persistence responsibility.
  it('TST-B5-027: the successful evidence set represents normal development persistence without a destructive dev reset', () => {
    expect(
      ALL_COMMANDS_PASSED.filter((c) => c === 'npm run db-reset' || c === 'scripts/db-reset.mjs'),
    ).toEqual([]);
    expect(FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.developmentEnvironment.ordinaryShutdownPreservesDevelopmentData).toBe(
      true,
    );
  });

  // TST-B5-028: clean shutdown.
  it('TST-B5-028: required lifecycle cleanup/shutdown evidence is accounted for in the successful replay', () => {
    expect(ALL_COMMANDS_PASSED).toContain('npm run test:db:down');
    expect(ALL_COMMANDS_PASSED).toContain('docker compose -f compose.yaml down');
  });
});

describe('evaluateGreenfieldReadiness - non-full-stack regression (v1.3.1 Batch 5)', () => {
  // TST-B5-032: ordinary nextjs-app regression.
  it('TST-B5-032: an ordinary nextjs-app run (no capability) requires no full-stack evidence', () => {
    const report = `Artifact: ScaffoldImplementationReport
Workflow mode: greenfield
Profile: nextjs-app
Files changed:
${BASE_TARGETS.map((t) => `- ${t}`).join('\n')}
Commands run:
- npm install: passed
Deviations: none
Blockers: none
Risks: none
Status: complete
`;
    const slice = `Artifact: FirstVerticalSlice
Workflow mode: greenfield
Profile: nextjs-app
Minimal behavior: The home page renders a welcome message, a short product description, and a navigational link to the about page, exercising the App Router root layout and page rendering pipeline end to end.
Entry point: app/page.tsx
Tied to product boundary: Demonstrates the core landing page described in the product boundary document.
Status: complete
`;
    const verification = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
- npm run typecheck: passed
- npm run build: passed
- npm test: passed
Status: complete
`;
    const result = evaluateGreenfieldReadiness({
      profile: NEXTJS_APP_PROFILE,
      scaffoldImplementationReportContent: report,
      firstVerticalSliceContent: slice,
      verificationReportContent: verification,
    });
    expect(result.ready).toBe(true);
    expect(result.issues).toEqual([]);
  });

  // TST-B5-033: typescript-cli regression.
  it('TST-B5-033: typescript-cli requires no full-stack evidence', () => {
    const report = `Artifact: ScaffoldImplementationReport
Workflow mode: greenfield
Profile: typescript-cli
Files changed:
- package.json
- src/cli.ts
- src/index.ts
- README.md
Commands run:
- npm install: passed
Deviations: none
Blockers: none
Risks: none
Status: complete
`;
    const slice = `Artifact: FirstVerticalSlice
Workflow mode: greenfield
Profile: typescript-cli
Minimal behavior: The CLI parses a single "greet" command and prints a personalized greeting message to stdout, exercising the full command-parsing and output pipeline end to end.
Entry point: src/cli.ts
Tied to product boundary: Demonstrates the core command-handling workflow described in the product boundary document.
Status: complete
`;
    const verification = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
- npm run typecheck: passed
- npm run build: passed
- npm test: passed
Status: complete
`;
    const result = evaluateGreenfieldReadiness({
      profile: TYPESCRIPT_CLI_PROFILE,
      scaffoldImplementationReportContent: report,
      firstVerticalSliceContent: slice,
      verificationReportContent: verification,
    });
    expect(result.ready).toBe(true);
    expect(result.issues).toEqual([]);
  });

  // TST-B5-034: android-compose regression.
  it('TST-B5-034: android-compose requires no full-stack evidence', () => {
    const report = `Artifact: ScaffoldImplementationReport
Workflow mode: greenfield
Profile: android-compose
Files changed:
- settings.gradle.kts
- build.gradle.kts
- app/build.gradle.kts
- app/src/main/AndroidManifest.xml
- app/src/main/java/MainActivity.kt
- app/src/test/java/ExampleUnitTest.kt
- app/src/androidTest/java/ExampleInstrumentedTest.kt
Commands run:
Deviations: none
Blockers: none
Risks: none
Status: complete
`;
    const slice = `Artifact: FirstVerticalSlice
Workflow mode: greenfield
Profile: android-compose
Minimal behavior: MainActivity renders a Compose screen with a single button that increments and displays a counter value on tap, exercising the core Compose UI interaction end to end.
Entry point: app/src/main/java/MainActivity.kt
Tied to product boundary: Demonstrates the core Compose UI interaction described in the product boundary document.
Status: complete
`;
    const verification = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
- ./gradlew build: passed
- ./gradlew testDebugUnitTest: passed
- ./gradlew connectedAndroidTest: skipped, no connected device or emulator available
Status: complete
`;
    const result = evaluateGreenfieldReadiness({
      profile: ANDROID_COMPOSE_PROFILE,
      scaffoldImplementationReportContent: report,
      firstVerticalSliceContent: slice,
      verificationReportContent: verification,
    });
    expect(result.ready).toBe(true);
    expect(result.issues).toEqual([]);
  });

  // TST-B5-035: legacy run compatibility.
  it('TST-B5-035: a legacy pre-v1.3.1 run (no "Profile" field) remains acceptable and is never full-stack-blocked', () => {
    const legacyReport = `Artifact: ScaffoldImplementationReport
Workflow mode: greenfield
Files changed:
- package.json
Commands run:
Status: complete
`;
    const result = evaluateGreenfieldReadiness({
      profile: NEXTJS_APP_PROFILE,
      capability: FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
      scaffoldImplementationReportContent: legacyReport,
      firstVerticalSliceContent: 'Artifact: FirstVerticalSlice\nStatus: complete\n',
      verificationReportContent: undefined,
    });
    expect(result.legacyRun).toBe(true);
    expect(result.ready).toBe(false); // legacy runs are never "ready", but not full-stack-blocked either
    expect(result.issues.every((i) => !i.code.startsWith('GF_FULLSTACK_') || i.code === 'GF_LEGACY_EVIDENCE_NOT_EVALUATED')).toBe(
      true,
    );
  });
});

describe('evaluateGreenfieldReadiness - full-stack determinism and purity (v1.3.1 Batch 5)', () => {
  // TST-B5-041: deterministic readiness.
  it('TST-B5-041: equivalent evidence yields equivalent ordered blockers/readiness', () => {
    const first = evaluateGreenfieldReadiness(fullstackInputs());
    const second = evaluateGreenfieldReadiness(fullstackInputs());
    expect(first).toEqual(second);
  });

  // TST-B5-042: input immutability.
  it('TST-B5-042: readiness evaluation does not mutate persisted/evaluated input structures', () => {
    const inputs = fullstackInputs();
    const before = JSON.parse(JSON.stringify(inputs));
    evaluateGreenfieldReadiness(inputs);
    expect(inputs).toEqual(before);
    const capabilityBefore = JSON.parse(JSON.stringify(FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY));
    expect(FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY).toEqual(capabilityBefore);
  });

  it('never throws for malformed full-stack evidence', () => {
    expect(() =>
      evaluateGreenfieldReadiness(
        fullstackInputs({
          scaffoldImplementationReportContent: 'not a real artifact',
          verificationReportContent: 'also not real',
          firstVerticalSliceContent: '',
        }),
      ),
    ).not.toThrow();
  });
});

// ─── checkGreenfieldRunReadiness: bootstrap-bundle.json wiring (TST-B5-029/030/031) ────

function makeRunFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-fullstack-run-'));
  fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
  return dir;
}

function makeMeta(runFolder: string): RunMetadata {
  const workflow = getWorkflow('greenfield');
  return {
    runId: '20260101T000000-fullstack-test-run',
    mode: 'greenfield',
    request: 'a full-stack web app',
    projectRoot: '/does/not/matter',
    runFolder,
    createdAt: '2026-01-01T00:00:00.000Z',
    currentStage: workflow.stages[0].name,
    stages: workflow.stages,
    status: 'created',
  };
}

const FULLSTACK_BOOTSTRAP_BUNDLE = JSON.stringify({
  selectedProfile: { status: 'selected', profile: { id: 'nextjs-app' }, reason: 'x', stackDecisionNotes: [] },
  fullstackCapability: {
    status: 'selected',
    capability: FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
    reason: 'x',
  },
});

describe('checkGreenfieldRunReadiness - full-stack bootstrap-bundle.json wiring (v1.3.1 Batch 5)', () => {
  let runFolder: string;

  afterEach(() => {
    fs.rmSync(runFolder, { recursive: true, force: true });
  });

  // TST-B5-029/030/031: status/check/check-all all call this same function
  // (confirmed by source inspection); proving it correctly derives
  // full-stack blockers from an on-disk bootstrap-bundle.json is therefore
  // sufficient evidence that status/check/check --all do not recompute
  // independent full-stack logic.
  it('TST-B5-029/030/031: derives full-stack blockers from a persisted bootstrap-bundle.json with no independent recomputation', () => {
    runFolder = makeRunFolder();
    fs.writeFileSync(path.join(runFolder, 'artifacts/bootstrap-bundle.json'), FULLSTACK_BOOTSTRAP_BUNDLE);
    // no scaffold-implementation-report.txt, no verification-report.txt written
    const meta = makeMeta(runFolder);
    const result = checkGreenfieldRunReadiness(meta);
    expect(result).toBeDefined();
    expect(result!.ready).toBe(false);
    expect(result!.issues.some((i) => i.code === 'GF_SCAFFOLD_REPORT_MISSING')).toBe(true);
  });

  it('derives a ready result from a complete on-disk full-stack run', () => {
    runFolder = makeRunFolder();
    fs.writeFileSync(path.join(runFolder, 'artifacts/bootstrap-bundle.json'), FULLSTACK_BOOTSTRAP_BUNDLE);
    const allSetupCommands = [
      ...NEXTJS_APP_PROFILE.setupCommands,
      ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.setupCommands,
    ];
    const allValidationCommands = [
      ...NEXTJS_APP_PROFILE.validationCommands,
      ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.validationCommands,
    ];
    const scaffoldPlanText = `Artifact: ScaffoldPlan
Workflow mode: greenfield
Profile: nextjs-app
Planned file groups: full-stack Next.js app.
Target paths:
${ALL_TARGETS.map((t) => `- ${t}`).join('\n')}
First runnable behavior: the health route reaches PostgreSQL through the canonical Prisma client.
Setup commands:
${allSetupCommands.map((c) => `- ${c.command}: ${c.required ? 'required' : `optional, ${c.environmentNotes}`}`).join('\n')}
Validation commands:
${allValidationCommands.map((c) => `- ${c.command}: ${c.required ? 'required' : `optional, ${c.environmentNotes}`}`).join('\n')}
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
    fs.writeFileSync(path.join(runFolder, 'artifacts/scaffold-plan.txt'), scaffoldPlanText);
    fs.writeFileSync(
      path.join(runFolder, 'reports/scaffold-implementation-report.txt'),
      scaffoldReport(ALL_TARGETS),
    );
    fs.writeFileSync(path.join(runFolder, 'artifacts/first-vertical-slice.txt'), firstSlice(VALID_FULLSTACK_SLICE_TEXT));
    fs.writeFileSync(
      path.join(runFolder, 'artifacts/verification-report.txt'),
      verificationReport(ALL_COMMANDS_PASSED),
    );
    const meta = makeMeta(runFolder);
    const result = checkGreenfieldRunReadiness(meta);
    expect(result).toBeDefined();
    expect(result!.ready).toBe(true);
    expect(result!.issues).toEqual([]);
  });

  it('treats an ordinary non-full-stack bootstrap-bundle.json exactly as before Batch 5', () => {
    runFolder = makeRunFolder();
    const legacyBundle = JSON.stringify({
      selectedProfile: { status: 'selected', profile: { id: 'typescript-cli' }, reason: 'x', stackDecisionNotes: [] },
    });
    fs.writeFileSync(path.join(runFolder, 'artifacts/bootstrap-bundle.json'), legacyBundle);
    fs.writeFileSync(
      path.join(runFolder, 'artifacts/scaffold-plan.txt'),
      `Artifact: ScaffoldPlan
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
- none noted
Non-goals:
- no GUI
Status: complete
`,
    );
    fs.writeFileSync(
      path.join(runFolder, 'reports/scaffold-implementation-report.txt'),
      `Artifact: ScaffoldImplementationReport
Workflow mode: greenfield
Profile: typescript-cli
Files changed:
- package.json
- src/cli.ts
- src/index.ts
- README.md
Commands run:
- npm install: passed
Status: complete
`,
    );
    fs.writeFileSync(
      path.join(runFolder, 'artifacts/first-vertical-slice.txt'),
      `Artifact: FirstVerticalSlice
Workflow mode: greenfield
Profile: typescript-cli
Minimal behavior: The CLI parses a single "greet" command and prints a personalized greeting message to stdout, exercising the full command-parsing and output pipeline end to end.
Entry point: src/cli.ts
Tied to product boundary: Demonstrates the core command-handling workflow described in the product boundary document.
Status: complete
`,
    );
    fs.writeFileSync(
      path.join(runFolder, 'artifacts/verification-report.txt'),
      `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
- npm run typecheck: passed
- npm run build: passed
- npm test: passed
Status: complete
`,
    );
    const meta = makeMeta(runFolder);
    const result = checkGreenfieldRunReadiness(meta);
    expect(result).toBeDefined();
    expect(result!.ready).toBe(true);
    expect(result!.issues).toEqual([]);
  });
});

// ─── Stage order, CLI surface, and Batch 1-4 regression (v1.3.1 Batch 5) ───────

describe('v1.3.1 Batch 5 regression - stages, CLI, external execution, and Batch 1-4', () => {
  // TST-B5-036 through 039: Batch 1-4 regression.
  it('TST-B5-036/037/038/039: Batch 1 dimensions, Batch 2 canonical docs, Batch 3 capability, and Batch 4 composition remain intact', () => {
    // Batch 1
    expect(FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.projectType).toBe('fullstack-web');
    expect(FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.webFramework).toBe('nextjs');
    // Batch 2
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GREENFIELD_CANONICAL_DOCUMENT_PATHS } = require('../../src/greenfield/bootstrap/projectDocBootstrapTypes');
    expect(GREENFIELD_CANONICAL_DOCUMENT_PATHS).toHaveLength(15);
    // Batch 3
    expect(FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.databaseEngine.engine).toBe('postgresql');
    // Batch 4
    expect(FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.targetExpectations.length).toBe(14);
  });

  // TST-B5-040: no external execution.
  it('TST-B5-040: the readiness evaluator source contains no Docker/database/child_process/network execution', () => {
    const source = fs.readFileSync(
      require.resolve('../../src/greenfield/readiness/evaluateGreenfieldReadiness'),
      'utf8',
    );
    expect(source).not.toMatch(/require\(['"]child_process['"]\)|import .* from ['"]child_process['"]|exec\(|spawn\(|fetch\(/);
  });

  it('TST-B5-040b: checkGreenfieldRunReadiness only performs read-only filesystem access', () => {
    const source = fs.readFileSync(
      require.resolve('../../src/greenfield/readiness/checkGreenfieldRunReadiness'),
      'utf8',
    );
    expect(source).not.toMatch(/writeFileSync|require\(['"]child_process['"]\)|exec\(|spawn\(/);
  });

  // TST-B5-043: existing stage order.
  it('TST-B5-043: the greenfield 13-stage workflow remains unchanged', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GREENFIELD_STAGE_NAMES } = require('../../src/greenfield/modes/greenfieldStages');
    expect(GREENFIELD_STAGE_NAMES).toHaveLength(13);
    expect(GREENFIELD_STAGE_NAMES).toEqual([
      'idea-brief',
      'product-boundary',
      'stack-decision',
      'starter-profile',
      'bootstrap-bundle',
      'project-docs',
      'scaffold-plan',
      'scaffold-implementation',
      'first-vertical-slice',
      'verification',
      'initial-index',
      'judge',
      'final-report',
    ]);
  });

  // TST-B5-044: existing CLI surface.
  it('TST-B5-044: the eight-command CLI surface remains unchanged', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createProgram } = require('../../src/program');
    const commandNames = createProgram().commands.map((c: { name: () => string }) => c.name()).sort();
    expect(commandNames).toEqual(['check', 'export', 'init', 'list', 'mark', 'prompt', 'start', 'status'].sort());
  });

  // TST-B5-045: no duplicate readiness subsystem.
  it('TST-B5-045: full-stack readiness is consumed only through the canonical evaluateGreenfieldReadiness/checkGreenfieldRunReadiness owners', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs2 = require('fs');
    const statusSource = fs2.readFileSync(require.resolve('../../src/commands/status'), 'utf8');
    const checkSource = fs2.readFileSync(require.resolve('../../src/commands/check'), 'utf8');
    expect(statusSource).toMatch(/checkGreenfieldRunReadiness/);
    expect(checkSource).toMatch(/checkGreenfieldRunReadiness/);
    expect(statusSource).not.toMatch(/FullstackReadinessEngine|evaluateFullstackReadiness/);
    expect(checkSource).not.toMatch(/FullstackReadinessEngine|evaluateFullstackReadiness/);
  });
});
