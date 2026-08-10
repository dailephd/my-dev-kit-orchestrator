// v1.3.1 Batch 5 correction: proves canonical greenfield readiness
// (checkGreenfieldRunReadiness / evaluateGreenfieldReadiness, Batches 1-5)
// now gates greenfield judge/final-report lifecycle progression through the
// single existing integration point every caller already shares --
// evaluateFinalReportEligibility() in src/judgeIntegrity.ts. Before this
// correction, that function's `priorArtifactsValid` only checked file-
// presence/lifecycle state, never deep greenfield readiness content, so an
// authored judge "Verdict: PASS" could make a run "final-report eligible"
// even while canonical greenfield readiness reported incomplete/blocked
// evidence. Cases A-G below are the required regression matrix; each test
// is labeled TST-B5C-### per the correction task's required mapping.
//
// No Docker/database/child_process execution anywhere in this file --
// every fixture is a plain in-memory text artifact, matching the existing
// tests/greenfield/fullstackReadiness.spec.ts pattern.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun, RunMetadata } from '../../src/run';
import { initWorkspace } from '../../src/workspace';
import { evaluateRunIntegrityGate } from '../../src/runIntegrityGate';
import {
  evaluateJudgeIntegrity,
  evaluateFinalReportEligibility,
  FINAL_REPORT_GREENFIELD_READINESS_INCOMPLETE,
} from '../../src/judgeIntegrity';
import { readArtifactStateFile } from '../../src/artifactLifecycle';
import { checkGreenfieldRunReadiness } from '../../src/greenfield/readiness/checkGreenfieldRunReadiness';
import { generateStagePrompt } from '../../src/promptGenerator';
import { FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY } from '../../src/greenfield/fullstack/fullstackCapabilityTypes';
import { NEXTJS_APP_PROFILE } from '../../src/greenfield/profiles/nextjsAppProfile';
import { GREENFIELD_PROJECT_INSTRUCTION_PATHS } from '../../src/greenfield/bootstrap/projectInstructions/projectInstructionTypes';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-b5-correction-'));
}

function makeGreenfieldRun(tmp: string, request = 'Build a sample full-stack app'): RunMetadata {
  initWorkspace(tmp);
  const meta = createRun({ request, mode: 'greenfield', projectRoot: tmp });
  // Readiness's optional generated-target filesystem corroboration only
  // activates when `projectRoot` resolves to an accessible directory
  // (evaluateGreenfieldReadiness.ts). These fixtures assert on the
  // scaffold-implementation-report's *reported* evidence only (matching
  // tests/greenfield/fullstackReadiness.spec.ts's makeMeta helper, which
  // uses an inaccessible '/does/not/matter'), so corroboration is disabled
  // here rather than also creating every real target file on disk.
  meta.projectRoot = path.join(tmp, '__no_such_project_root__');
  return meta;
}

function writeArtifact(meta: RunMetadata, relPath: string, content: string): void {
  const full = path.join(meta.runFolder, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

const BASE_TARGETS = [...GREENFIELD_PROJECT_INSTRUCTION_PATHS, 'package.json', 'app/layout.tsx', 'app/page.tsx', 'README.md'];
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

function scaffoldReportText(profileId: string, targets: readonly string[]): string {
  return `Artifact: ScaffoldImplementationReport
Workflow mode: greenfield
Profile: ${profileId}
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

const VALID_FULLSTACK_SLICE_TEXT =
  'The GET /api/health route uses the canonical Prisma database client to run a query against PostgreSQL and ' +
  'returns the result as JSON, proving the application can reach and use the database.';

function firstSliceText(profileId: string, minimalBehavior: string, entryPoint: string): string {
  return `Artifact: FirstVerticalSlice
Workflow mode: greenfield
Profile: ${profileId}
Minimal behavior: ${minimalBehavior}
Entry point: ${entryPoint}
Tied to product boundary: Demonstrates the core request path described in the product boundary document.
Status: complete
`;
}

function projectDocsReportText(profileId: string, boundary: string): string {
  return `Artifact: ProjectDocsReport
Workflow mode: greenfield
Profile: ${profileId}
Product boundary: ${boundary}
Stack decision: chosen stack for this profile.
Starter profile summary: ${profileId} selected as the starter profile.
Development workflow: single package, standard project layout.
Testing expectations: unit and integration tests for the core behavior.
Validation expectations: typecheck, build, test.
Scaffold planning notes: generated files match the profile's target expectations.
Unresolved decisions: none.
Non-goals: no unrelated platform support.
Status: complete
`;
}

function verificationReportText(commandLines: readonly string[]): string {
  return `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
${commandLines.map((c) => `- ${c}: passed`).join('\n')}
Status: complete
`;
}

const FULLSTACK_BOOTSTRAP_BUNDLE = JSON.stringify({
  selectedProfile: { status: 'selected', profile: { id: 'nextjs-app' }, reason: 'x', stackDecisionNotes: [] },
  fullstackCapability: {
    status: 'selected',
    capability: FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
    reason: 'x',
  },
});

function bootstrapBundleFor(profileId: string): string {
  return JSON.stringify({
    selectedProfile: { status: 'selected', profile: { id: profileId }, reason: 'x', stackDecisionNotes: [] },
  });
}

// Writes present, non-empty stub artifacts for the stages before
// "project-docs" (idea-brief/product-boundary/stack-decision/starter-
// profile) -- none of these are read by canonical greenfield readiness at
// all, so a stub is sufficient. Must run before any real-content artifact
// is written, so staleness (upstream mtime newer than a downstream
// artifact already marked complete) is never spuriously triggered.
function writeEarlyStageStubs(meta: RunMetadata): void {
  const stubbable = new Set(['idea-brief', 'product-boundary', 'stack-decision', 'starter-profile']);
  for (const stage of meta.stages) {
    if (!stubbable.has(stage.name)) continue;
    if (fs.existsSync(path.join(meta.runFolder, stage.artifactFile))) continue;
    writeArtifact(meta, stage.artifactFile, `Artifact: stub for ${stage.name}\nStatus: complete\n`);
  }
}

// Writes a present scaffold-plan.txt stub. Must run after project-docs (its
// upstream), and before scaffold-implementation-report.txt (its
// downstream). Content is irrelevant for a legacy run, which skips
// scaffold-plan validation entirely (evaluateGreenfieldReadiness.ts's
// `if (!legacyRun && inputs.scaffoldPlan)` gate).
function writeScaffoldPlanStub(meta: RunMetadata): void {
  writeArtifact(meta, 'artifacts/scaffold-plan.txt', 'Artifact: ScaffoldPlan\nStatus: complete\n');
}

// Writes the "initial-index" stub. Must run last (after verification-
// report), since initial-index is downstream of every full-content
// artifact these fixtures write.
function writeInitialIndexStub(meta: RunMetadata): void {
  const stage = meta.stages.find((s) => s.name === 'initial-index');
  if (!stage) return;
  writeArtifact(meta, stage.artifactFile, 'Artifact: stub for initial-index\nStatus: complete\n');
}

// v1.3.1 verification-report path correction: the readiness evaluator
// (checkGreenfieldRunReadiness.ts's VERIFICATION_REPORT_FILE), the
// generated verification/judge/final-report/initial-index prompts
// (promptGenerator.ts), and the canonical workflow stage/lifecycle/
// contract system (src/workflows.ts's shared ARTIFACT_MAP, reused
// unchanged for greenfield's "verification" stage) now all agree on
// "artifacts/verification-report.txt". A single canonical write is
// sufficient -- writing to the obsolete "reports/verification-report.txt"
// path is no longer necessary and would no longer be produced by a real
// run following the generated prompts.
function writeVerificationReport(meta: RunMetadata, content: string): void {
  writeArtifact(meta, 'artifacts/verification-report.txt', content);
}

function writeJudgeReport(meta: RunMetadata, verdict: string): void {
  writeArtifact(
    meta,
    'artifacts/judge-report.txt',
    `Artifact: JudgeReport\nWorkflow mode: greenfield\nVerdict: ${verdict}\nStatus: complete\n`,
  );
}

function evaluateFor(meta: RunMetadata) {
  const gate = evaluateRunIntegrityGate({
    mode: meta.mode,
    runFolder: meta.runFolder,
    workflowStageNames: meta.stages.map((s) => s.name),
    projectRoot: meta.projectRoot,
  });
  const judgeIntegrity = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
  const stateFile = readArtifactStateFile(meta.runFolder);
  const eligibility = evaluateFinalReportEligibility({
    gate,
    judgeIntegrity,
    runFolder: meta.runFolder,
    stages: meta.stages,
    stateFile,
  });
  return { gate, judgeIntegrity, eligibility };
}

// Builds a complete, ready full-stack run (all evidence present and valid)
// so tests only need to knock out one piece of evidence to reach the
// "incomplete" boundary.
function buildReadyFullstackRun(tmp: string): RunMetadata {
  const meta = makeGreenfieldRun(tmp);
  writeEarlyStageStubs(meta);
  writeArtifact(meta, 'artifacts/bootstrap-bundle.json', FULLSTACK_BOOTSTRAP_BUNDLE);
  writeArtifact(
    meta,
    'artifacts/project-docs-report.txt',
    projectDocsReportText('nextjs-app', 'A full-stack Next.js app backed by PostgreSQL through Prisma.'),
  );
  const allSetupCommands = [
    ...NEXTJS_APP_PROFILE.setupCommands,
    ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.setupCommands,
  ];
  const allValidationCommands = [
    ...NEXTJS_APP_PROFILE.validationCommands,
    ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.validationCommands,
  ];
  writeArtifact(
    meta,
    'artifacts/scaffold-plan.txt',
    `Artifact: ScaffoldPlan
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
`,
  );
  writeArtifact(meta, 'reports/scaffold-implementation-report.txt', scaffoldReportText('nextjs-app', ALL_TARGETS));
  writeArtifact(
    meta,
    'artifacts/first-vertical-slice.txt',
    firstSliceText('nextjs-app', VALID_FULLSTACK_SLICE_TEXT, 'app/api/health/route.ts'),
  );
  writeVerificationReport(meta, verificationReportText(ALL_COMMANDS_PASSED));
  writeInitialIndexStub(meta);
  return meta;
}

function buildReadyOrdinaryRun(tmp: string): RunMetadata {
  const meta = makeGreenfieldRun(tmp);
  writeEarlyStageStubs(meta);
  writeArtifact(meta, 'artifacts/bootstrap-bundle.json', bootstrapBundleFor('nextjs-app'));
  writeArtifact(
    meta,
    'artifacts/project-docs-report.txt',
    projectDocsReportText('nextjs-app', 'An ordinary Next.js app with a landing page.'),
  );
  writeArtifact(
    meta,
    'artifacts/scaffold-plan.txt',
    `Artifact: ScaffoldPlan
Workflow mode: greenfield
Profile: nextjs-app
Planned file groups: ordinary Next.js app.
Target paths:
${BASE_TARGETS.map((t) => `- ${t}`).join('\n')}
First runnable behavior: the home page renders.
Setup commands:
- npm install: required
Validation commands:
- npm run typecheck: required
- npm run build: required
- npm test: required
Test expectations:
- unit tests for the home page
Documentation expectations:
- README usage section
Unresolved decisions:
- none noted
Non-goals:
- no authentication
Status: complete
`,
  );
  writeArtifact(meta, 'reports/scaffold-implementation-report.txt', scaffoldReportText('nextjs-app', BASE_TARGETS));
  writeArtifact(
    meta,
    'artifacts/first-vertical-slice.txt',
    firstSliceText(
      'nextjs-app',
      'The home page renders a welcome message and a short product description, exercising the App Router root layout end to end.',
      'app/page.tsx',
    ),
  );
  writeVerificationReport(meta, verificationReportText(['npm run typecheck', 'npm run build', 'npm test']),);
  writeInitialIndexStub(meta);
  return meta;
}

describe('v1.3.1 Batch 5 correction - Case A: readiness incomplete/blocked overrides an authored judge PASS', () => {
  let tmp: string;
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  // TST-B5C-001
  it('TST-B5C-001: incomplete full-stack readiness blocks final-report eligibility outright', () => {
    tmp = makeTempDir();
    const meta = buildReadyFullstackRun(tmp);
    // Knock out one required piece of evidence.
    writeVerificationReport(meta, verificationReportText(ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run db:migrate:deploy')),);
    const readiness = checkGreenfieldRunReadiness(meta);
    expect(readiness?.ready).toBe(false);
    const { eligibility } = evaluateFor(meta);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockingCodes).toContain(FINAL_REPORT_GREENFIELD_READINESS_INCOMPLETE);
  });

  // TST-B5C-002
  it('TST-B5C-002: an authored judge PASS cannot override incomplete canonical readiness', () => {
    tmp = makeTempDir();
    const meta = buildReadyFullstackRun(tmp);
    writeVerificationReport(meta, verificationReportText(ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run db:migrate:deploy')),);
    writeJudgeReport(meta, 'PASS');
    const { judgeIntegrity, eligibility } = evaluateFor(meta);
    // The judge/context portion alone still accepts the authored PASS...
    expect(judgeIntegrity.authoredJudgeVerdict).toBe('PASS');
    expect(judgeIntegrity.finalReportEligible).toBe(true);
    // ...but the composed decision must not.
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockingCodes).toContain(FINAL_REPORT_GREENFIELD_READINESS_INCOMPLETE);
    expect(eligibility.primaryReason).toBeDefined();
  });

  // TST-B5C-003
  it('TST-B5C-003: a blocked/incomplete run reports a non-generic reason drawn from canonical readiness issues', () => {
    tmp = makeTempDir();
    const meta = buildReadyFullstackRun(tmp);
    const withoutDockerfile = ALL_TARGETS.filter((t) => t !== 'Dockerfile');
    writeArtifact(meta, 'reports/scaffold-implementation-report.txt', scaffoldReportText('nextjs-app', withoutDockerfile));
    writeJudgeReport(meta, 'PASS');
    const { eligibility } = evaluateFor(meta);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.greenfieldReadiness?.issues.some((i) => i.code === 'GF_GENERATED_EVIDENCE_MISSING')).toBe(true);
    expect(eligibility.blockingCodes).toContain('GF_GENERATED_EVIDENCE_MISSING');
  });
});

describe('v1.3.1 Batch 5 correction - Case B: satisfied readiness permits normal progression', () => {
  let tmp: string;
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  // TST-B5C-004
  it('TST-B5C-004: complete full-stack readiness plus an accepted judge PASS is final-report eligible', () => {
    tmp = makeTempDir();
    const meta = buildReadyFullstackRun(tmp);
    writeJudgeReport(meta, 'PASS');
    const readiness = checkGreenfieldRunReadiness(meta);
    expect(readiness?.ready).toBe(true);
    const { eligibility } = evaluateFor(meta);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.blockingCodes).toEqual([]);
  });

  // TST-B5C-005
  it('TST-B5C-005: an ordinary (non-full-stack) greenfield run reaching its own readiness is eligible with an accepted PASS', () => {
    tmp = makeTempDir();
    const meta = buildReadyOrdinaryRun(tmp);
    writeJudgeReport(meta, 'PASS');
    const { eligibility } = evaluateFor(meta);
    expect(eligibility.eligible).toBe(true);
  });
});

describe('v1.3.1 Batch 5 correction - Case C: full-stack readiness automatically participates via the canonical evaluator', () => {
  let tmp: string;
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  // TST-B5C-006
  it('TST-B5C-006: missing generated-file evidence (Dockerfile) blocks final-report despite judge PASS', () => {
    tmp = makeTempDir();
    const meta = buildReadyFullstackRun(tmp);
    const withoutDockerfile = ALL_TARGETS.filter((t) => t !== 'Dockerfile');
    writeArtifact(meta, 'reports/scaffold-implementation-report.txt', scaffoldReportText('nextjs-app', withoutDockerfile));
    writeJudgeReport(meta, 'PASS');
    const { eligibility } = evaluateFor(meta);
    expect(eligibility.eligible).toBe(false);
  });

  // TST-B5C-007
  it('TST-B5C-007: missing verification-command evidence (docker build) blocks final-report despite judge PASS', () => {
    tmp = makeTempDir();
    const meta = buildReadyFullstackRun(tmp);
    writeVerificationReport(meta, verificationReportText(ALL_COMMANDS_PASSED.filter((c) => c !== 'docker build -t app:fullstack .')),);
    writeJudgeReport(meta, 'PASS');
    const { eligibility } = evaluateFor(meta);
    expect(eligibility.eligible).toBe(false);
  });

  // TST-B5C-008
  it('TST-B5C-008: a non-database-backed first-vertical-slice blocks final-report despite judge PASS', () => {
    tmp = makeTempDir();
    const meta = buildReadyFullstackRun(tmp);
    writeArtifact(
      meta,
      'artifacts/first-vertical-slice.txt',
      firstSliceText('nextjs-app', 'Renders a static Next.js page with a welcome message.', 'app/page.tsx'),
    );
    writeJudgeReport(meta, 'PASS');
    const { eligibility } = evaluateFor(meta);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.greenfieldReadiness?.issues.some((i) => i.code === 'GF_FULLSTACK_FIRST_SLICE_NOT_DATABASE_BACKED')).toBe(
      true,
    );
  });
});

describe('v1.3.1 Batch 5 correction - Case D: no full-stack requirements imposed on non-full-stack runs', () => {
  let tmp: string;
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  // TST-B5C-009
  it('TST-B5C-009: an ordinary nextjs-app run is never evaluated against full-stack evidence requirements', () => {
    tmp = makeTempDir();
    const meta = buildReadyOrdinaryRun(tmp);
    writeJudgeReport(meta, 'PASS');
    const { eligibility } = evaluateFor(meta);
    expect(eligibility.eligible).toBe(true);
    expect(
      eligibility.greenfieldReadiness?.issues.every((i) => !i.code.startsWith('GF_FULLSTACK_') && !i.code.startsWith('GF_COMMAND')),
    ).toBe(true);
  });

  // TST-B5C-010
  it('TST-B5C-010: typescript-cli and android-compose greenfield runs are unaffected by the readiness gate', () => {
    tmp = makeTempDir();
    const meta = makeGreenfieldRun(tmp);
    writeEarlyStageStubs(meta);
    writeArtifact(meta, 'artifacts/bootstrap-bundle.json', bootstrapBundleFor('typescript-cli'));
    writeArtifact(
      meta,
      'artifacts/project-docs-report.txt',
      projectDocsReportText('typescript-cli', 'A CLI tool for syncing notes across devices.'),
    );
    writeArtifact(
      meta,
      'artifacts/scaffold-plan.txt',
      `Artifact: ScaffoldPlan
Workflow mode: greenfield
Profile: typescript-cli
Planned file groups: core CLI files.
Target paths:
- agents.txt
- claude.txt
- AGENTS.md
- CLAUDE.md
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
    writeArtifact(
      meta,
      'reports/scaffold-implementation-report.txt',
      scaffoldReportText('typescript-cli', [
        ...GREENFIELD_PROJECT_INSTRUCTION_PATHS,
        'package.json',
        'src/cli.ts',
        'src/index.ts',
        'README.md',
      ]),
    );
    writeArtifact(
      meta,
      'artifacts/first-vertical-slice.txt',
      firstSliceText(
        'typescript-cli',
        'The CLI parses a single "greet" command and prints a personalized greeting message to stdout, exercising the full command-parsing and output pipeline end to end.',
        'src/cli.ts',
      ),
    );
    writeVerificationReport(meta, verificationReportText(['npm run typecheck', 'npm run build', 'npm test']),);
    writeInitialIndexStub(meta);
    writeJudgeReport(meta, 'PASS');
    const { eligibility } = evaluateFor(meta);
    expect(eligibility.eligible).toBe(true);
  });
});

describe('v1.3.1 Batch 5 correction - Case E: status/check/final-report consume one canonical decision', () => {
  let tmp: string;
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  // TST-B5C-011
  it('TST-B5C-011: the greenfieldReadiness embedded in final-report eligibility equals the standalone canonical check', () => {
    tmp = makeTempDir();
    const meta = buildReadyFullstackRun(tmp);
    writeVerificationReport(meta, verificationReportText(ALL_COMMANDS_PASSED.filter((c) => c !== 'npm run prisma:generate')),);
    writeJudgeReport(meta, 'PASS');
    const standalone = checkGreenfieldRunReadiness(meta);
    const { eligibility } = evaluateFor(meta);
    expect(eligibility.greenfieldReadiness).toEqual(standalone);
    expect(eligibility.eligible).toBe(false);
    expect(standalone?.ready).toBe(false);
  });

  it('TST-014/TST-015: one missing common target blocks canonical status/check readiness and final eligibility', () => {
    tmp = makeTempDir();
    const meta = buildReadyOrdinaryRun(tmp);
    const reportPath = path.join(meta.runFolder, 'reports', 'scaffold-implementation-report.txt');
    const withoutAgents = fs.readFileSync(reportPath, 'utf8').replace('- agents.txt\n', '');
    writeArtifact(meta, 'reports/scaffold-implementation-report.txt', withoutAgents);
    writeJudgeReport(meta, 'PASS');

    const standalone = checkGreenfieldRunReadiness(meta);
    const { eligibility } = evaluateFor(meta);
    expect(standalone?.ready).toBe(false);
    expect(standalone?.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_GENERATED_EVIDENCE_MISSING', evidenceKey: 'common-agents-instructions' }),
    );
    expect(eligibility.greenfieldReadiness).toEqual(standalone);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockingCodes).toContain(FINAL_REPORT_GREENFIELD_READINESS_INCOMPLETE);

    const statusSource = fs.readFileSync(require.resolve('../../src/commands/status'), 'utf8');
    const checkSource = fs.readFileSync(require.resolve('../../src/commands/check'), 'utf8');
    expect(statusSource).toMatch(/checkGreenfieldRunReadiness/);
    expect(checkSource).toMatch(/checkGreenfieldRunReadiness/);
  });

  // TST-B5C-012
  it('TST-B5C-012: no independent full-stack judge gate exists in the source (single canonical owner)', () => {
    const judgeIntegritySource = fs.readFileSync(require.resolve('../../src/judgeIntegrity'), 'utf8');
    expect(judgeIntegritySource).not.toMatch(/FullstackJudgeGate|FullstackFinalReportGate|GreenfieldJudgeReadinessEngine/);
    expect(judgeIntegritySource).toMatch(/checkGreenfieldRunReadinessForRun/);
  });
});

describe('v1.3.1 Batch 5 correction - Case F: correction routing remains deterministic and untouched', () => {
  let tmp: string;
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  // TST-B5C-013
  it('TST-B5C-013: a correction-required judge verdict (NEED_VERIFICATION) still routes normally regardless of greenfield readiness', () => {
    tmp = makeTempDir();
    const meta = buildReadyFullstackRun(tmp);
    // Even with fully-ready evidence, an authored correction verdict must
    // still be respected exactly as before this correction.
    writeJudgeReport(meta, 'NEED_VERIFICATION');
    const { judgeIntegrity, eligibility } = evaluateFor(meta);
    expect(judgeIntegrity.authoredJudgeVerdict).toBe('NEED_VERIFICATION');
    expect(judgeIntegrity.correctionRequired).toBe(true);
    expect(eligibility.eligible).toBe(false);
  });
});

describe('v1.3.1 Batch 5 correction - Case G: legacy-run compatibility is preserved', () => {
  let tmp: string;
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  // TST-B5C-014
  it('TST-B5C-014: a legacy (pre-v1.3.1) greenfield run is not blocked merely for lacking full-stack evidence it could not have written', () => {
    tmp = makeTempDir();
    const meta = makeGreenfieldRun(tmp);
    writeEarlyStageStubs(meta);
    writeArtifact(meta, 'artifacts/bootstrap-bundle.json', bootstrapBundleFor('nextjs-app'));
    writeArtifact(
      meta,
      'artifacts/project-docs-report.txt',
      projectDocsReportText('nextjs-app', 'A legacy pre-v1.3.1 Next.js app.'),
    );
    writeScaffoldPlanStub(meta);
    // Legacy report: no "Profile:" field at all.
    writeArtifact(
      meta,
      'reports/scaffold-implementation-report.txt',
      `Artifact: ScaffoldImplementationReport\nWorkflow mode: greenfield\nFiles changed:\n- package.json\nCommands run:\nStatus: complete\n`,
    );
    writeArtifact(
      meta,
      'artifacts/first-vertical-slice.txt',
      firstSliceText(
        'nextjs-app',
        'The home page renders a welcome message and a short product description, exercising the App Router root layout end to end.',
        'app/page.tsx',
      ),
    );
    // Command evidence is required regardless of legacyRun (only the
    // structured generated-target/plan/first-slice checks are skipped for
    // a legacy run) -- so a "clean" legacy run still needs real evidence.
    writeVerificationReport(meta, verificationReportText(['npm run typecheck', 'npm run build', 'npm test']),);
    writeInitialIndexStub(meta);
    writeJudgeReport(meta, 'PASS');
    const readiness = checkGreenfieldRunReadiness(meta);
    expect(readiness?.legacyRun).toBe(true);
    expect(readiness?.ready).toBe(false); // never "ready" by construction
    const { eligibility } = evaluateFor(meta);
    // legacyRun && valid (only a warning-severity legacy notice) must not
    // be blocked by the new gate -- it is an acceptable terminal state, not
    // an incomplete/invalid one.
    expect(readiness?.valid).toBe(true);
    expect(eligibility.eligible).toBe(true);
  });

  // TST-B5C-015
  it('TST-B5C-015: a legacy run with a genuine validation error is still blocked (readiness is not weakened to accommodate legacy runs)', () => {
    tmp = makeTempDir();
    const meta = makeGreenfieldRun(tmp);
    writeEarlyStageStubs(meta);
    writeArtifact(meta, 'artifacts/bootstrap-bundle.json', bootstrapBundleFor('nextjs-app'));
    writeArtifact(
      meta,
      'artifacts/project-docs-report.txt',
      projectDocsReportText('nextjs-app', 'A legacy pre-v1.3.1 Next.js app.'),
    );
    writeScaffoldPlanStub(meta);
    // Legacy report, but FirstVerticalSlice is missing entirely -- a
    // genuine error unrelated to the legacy/full-stack distinction.
    writeArtifact(
      meta,
      'reports/scaffold-implementation-report.txt',
      `Artifact: ScaffoldImplementationReport\nWorkflow mode: greenfield\nFiles changed:\n- package.json\nCommands run:\nStatus: complete\n`,
    );
    // FirstVerticalSlice intentionally left absent.
    writeJudgeReport(meta, 'PASS');
    const readiness = checkGreenfieldRunReadiness(meta);
    expect(readiness?.legacyRun).toBe(true);
    expect(readiness?.valid).toBe(false);
    expect(readiness?.issues.some((i) => i.code === 'GF_FIRST_SLICE_MISSING')).toBe(true);
    const { eligibility } = evaluateFor(meta);
    expect(eligibility.eligible).toBe(false);
  });

  // TST-B5C-016
  it('TST-B5C-016: pre-existing Batch 1-5 readiness/judge-integrity regressions are unaffected by this correction', () => {
    // Non-greenfield modes must be byte-for-byte unaffected: the new gate
    // only ever evaluates when gate.mode === 'greenfield'.
    tmp = makeTempDir();
    initWorkspace(tmp);
    const meta = createRun({ request: 'add a feature', mode: 'feature', projectRoot: tmp });
    const gate = evaluateRunIntegrityGate({
      mode: meta.mode,
      runFolder: meta.runFolder,
      workflowStageNames: meta.stages.map((s) => s.name),
      projectRoot: meta.projectRoot,
    });
    const judgeIntegrity = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
    const stateFile = readArtifactStateFile(meta.runFolder);
    const eligibility = evaluateFinalReportEligibility({
      gate,
      judgeIntegrity,
      runFolder: meta.runFolder,
      stages: meta.stages,
      stateFile,
    });
    expect(eligibility.greenfieldReadiness).toBeUndefined();
    expect(eligibility.eligible).toBe(false); // no artifacts at all yet; unrelated to this correction
  });
});

// v1.3.1 verification-report path correction regression: the generated
// verification/judge/final-report/initial-index prompts, the canonical
// greenfield readiness evaluator, the canonical workflow ARTIFACT_MAP, and
// final-report prior-artifact validation must all agree on a single current
// location for the verification-report artifact: artifacts/
// verification-report.txt. Before this correction, the generated prompts
// and the readiness evaluator both used the obsolete reports/
// verification-report.txt, which the canonical ARTIFACT_MAP/lifecycle
// system never recognized -- making final-report permanently ineligible for
// any real greenfield run that followed the generated prompts, regardless
// of judge verdict or readiness. See reports/v1.3.1-verification-report-
// path-correction.txt.
describe('v1.3.1 verification-report path correction', () => {
  let tmp: string;
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  // TST-VPATH-001
  it('TST-VPATH-001: the generated verification-stage prompt identifies artifacts/verification-report.txt as its output file', () => {
    tmp = makeTempDir();
    const meta = makeGreenfieldRun(tmp);
    const prompt = generateStagePrompt(meta, 'verification');
    expect(prompt).toContain('Output file:');
    expect(prompt).toMatch(/Output file:.*artifacts\/verification-report\.txt/);
    expect(prompt).not.toMatch(/Output file:.*reports\/verification-report\.txt/);
  });

  // TST-VPATH-002
  it('TST-VPATH-002: the generated judge-stage prompt consumes artifacts/verification-report.txt', () => {
    tmp = makeTempDir();
    const meta = makeGreenfieldRun(tmp);
    const prompt = generateStagePrompt(meta, 'judge');
    expect(prompt).toContain('artifacts/verification-report.txt');
    expect(prompt).not.toContain('reports/verification-report.txt');
  });

  // TST-VPATH-003
  it('TST-VPATH-003: the generated final-report-stage prompt consumes artifacts/verification-report.txt', () => {
    tmp = makeTempDir();
    // final-report only renders its normal packet-backed prompt (with the
    // Inputs list) once the run is final-report eligible; an ineligible run
    // renders a blocked-stage prompt instead (see the final-report
    // exclusion note in tests/v121Batch3PromptCompatibility.test.ts).
    const meta = buildReadyFullstackRun(tmp);
    writeJudgeReport(meta, 'PASS');
    const prompt = generateStagePrompt(meta, 'final-report');
    expect(prompt).toContain('artifacts/verification-report.txt');
    expect(prompt).not.toContain('reports/verification-report.txt');
  });

  // TST-VPATH-004
  it('TST-VPATH-004: canonical greenfield readiness reads the verification artifact written at artifacts/verification-report.txt', () => {
    tmp = makeTempDir();
    const meta = buildReadyFullstackRun(tmp);
    expect(fs.existsSync(path.join(meta.runFolder, 'artifacts', 'verification-report.txt'))).toBe(true);
    const readiness = checkGreenfieldRunReadiness(meta);
    expect(readiness?.ready).toBe(true);
  });

  // TST-VPATH-005
  it('TST-VPATH-005: a fixture writing only artifacts/verification-report.txt satisfies verification-path requirements', () => {
    tmp = makeTempDir();
    const meta = buildReadyFullstackRun(tmp);
    const readiness = checkGreenfieldRunReadiness(meta);
    expect(readiness?.ready).toBe(true);
    expect(readiness?.issues.some((i) => i.code.includes('VERIFICATION'))).toBe(false);
  });

  // TST-VPATH-006
  it('TST-VPATH-006: the same valid fixture does not write or require reports/verification-report.txt', () => {
    tmp = makeTempDir();
    const meta = buildReadyFullstackRun(tmp);
    expect(fs.existsSync(path.join(meta.runFolder, 'reports', 'verification-report.txt'))).toBe(false);
    const readiness = checkGreenfieldRunReadiness(meta);
    expect(readiness?.ready).toBe(true);
  });

  // TST-VPATH-007
  it('TST-VPATH-007: a fixture writing only the obsolete reports/verification-report.txt does not masquerade as a valid current verification artifact', () => {
    tmp = makeTempDir();
    const meta = makeGreenfieldRun(tmp);
    writeEarlyStageStubs(meta);
    writeArtifact(meta, 'artifacts/bootstrap-bundle.json', FULLSTACK_BOOTSTRAP_BUNDLE);
    writeArtifact(
      meta,
      'artifacts/project-docs-report.txt',
      projectDocsReportText('nextjs-app', 'A full-stack Next.js app backed by PostgreSQL through Prisma.'),
    );
    const allSetupCommands = [
      ...NEXTJS_APP_PROFILE.setupCommands,
      ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.setupCommands,
    ];
    const allValidationCommands = [
      ...NEXTJS_APP_PROFILE.validationCommands,
      ...FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.validationCommands,
    ];
    writeArtifact(
      meta,
      'artifacts/scaffold-plan.txt',
      `Artifact: ScaffoldPlan
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
`,
    );
    writeArtifact(meta, 'reports/scaffold-implementation-report.txt', scaffoldReportText('nextjs-app', ALL_TARGETS));
    writeArtifact(
      meta,
      'artifacts/first-vertical-slice.txt',
      firstSliceText('nextjs-app', VALID_FULLSTACK_SLICE_TEXT, 'app/api/health/route.ts'),
    );
    // Intentionally obsolete path: only reports/verification-report.txt, no
    // artifacts/verification-report.txt.
    writeArtifact(meta, 'reports/verification-report.txt', verificationReportText(ALL_COMMANDS_PASSED));
    writeInitialIndexStub(meta);

    const readiness = checkGreenfieldRunReadiness(meta);
    expect(readiness?.ready).toBe(false);
  });

  // TST-VPATH-008
  it('TST-VPATH-008: complete greenfield readiness + accepted PASS judge + canonical verification artifact reaches final-report eligibility', () => {
    tmp = makeTempDir();
    const meta = buildReadyFullstackRun(tmp);
    writeJudgeReport(meta, 'PASS');
    const readiness = checkGreenfieldRunReadiness(meta);
    expect(readiness?.ready).toBe(true);
    const { eligibility } = evaluateFor(meta);
    expect(eligibility.priorArtifactsValid).toBe(true);
    expect(eligibility.eligible).toBe(true);
  });

  // TST-VPATH-009
  it('TST-VPATH-009: a missing canonical verification artifact keeps final-report ineligible even with an accepted PASS judge', () => {
    tmp = makeTempDir();
    const meta = buildReadyFullstackRun(tmp);
    fs.rmSync(path.join(meta.runFolder, 'artifacts', 'verification-report.txt'));
    writeJudgeReport(meta, 'PASS');
    const { eligibility } = evaluateFor(meta);
    expect(eligibility.priorArtifactsValid).toBe(false);
    expect(eligibility.eligible).toBe(false);
  });

  // TST-VPATH-010
  it('TST-VPATH-010: the Batch 5 readiness-lifecycle correction fixtures no longer require dual-path verification-report writes', () => {
    tmp = makeTempDir();
    const meta = buildReadyFullstackRun(tmp);
    expect(fs.existsSync(path.join(meta.runFolder, 'artifacts', 'verification-report.txt'))).toBe(true);
    expect(fs.existsSync(path.join(meta.runFolder, 'reports', 'verification-report.txt'))).toBe(false);
  });
});
