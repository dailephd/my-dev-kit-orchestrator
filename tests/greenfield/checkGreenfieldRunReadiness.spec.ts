import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkGreenfieldRunReadiness } from '../../src/greenfield/readiness/checkGreenfieldRunReadiness';
import { RunMetadata } from '../../src/run';
import { getWorkflow } from '../../src/workflows';

function makeRunFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-run-'));
  fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
  return dir;
}

function makeMeta(mode: RunMetadata['mode'], runFolder: string): RunMetadata {
  const workflow = getWorkflow(mode);
  return {
    runId: '20260101T000000-test-run',
    mode,
    request: 'test request',
    projectRoot: '/does/not/matter',
    runFolder,
    createdAt: '2026-01-01T00:00:00.000Z',
    currentStage: workflow.stages[0].name,
    stages: workflow.stages,
    status: 'created',
  };
}

const VALID_BOOTSTRAP_BUNDLE = JSON.stringify({
  selectedProfile: { status: 'selected', profile: { id: 'typescript-cli' }, reason: 'x', stackDecisionNotes: [] },
});

const VALID_SCAFFOLD_REPORT = `Artifact: ScaffoldImplementationReport
Workflow mode: greenfield
Profile: typescript-cli
Files changed:
- agents.txt
- claude.txt
- AGENTS.md
- CLAUDE.md
- package.json
- src/cli.ts
- src/index.ts
- README.md
Commands run:
- npm install: passed
Status: complete
`;

const VALID_SCAFFOLD_PLAN = `Artifact: ScaffoldPlan
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
- none
Non-goals:
- no GUI
Status: complete
`;

// TST-048: greenfield and non-greenfield runs with equivalent lifecycle
// states -- shared lifecycle/integrity semantics; one run's mode/project
// root never leaks into another's evaluation.
describe('checkGreenfieldRunReadiness - cross-mode isolation (TST-048)', () => {
  it('returns undefined for a non-greenfield run, even with a greenfield-shaped bootstrap-bundle.json present', () => {
    const runFolder = makeRunFolder();
    try {
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'bootstrap-bundle.json'), VALID_BOOTSTRAP_BUNDLE);
      const meta = makeMeta('feature', runFolder);
      expect(checkGreenfieldRunReadiness(meta)).toBeUndefined();
    } finally {
      fs.rmSync(runFolder, { recursive: true, force: true });
    }
  });

  it('returns undefined for a greenfield run with no bootstrap-bundle.json (no profile selected yet -- an ordinary earlier-stage state)', () => {
    const runFolder = makeRunFolder();
    try {
      const meta = makeMeta('greenfield', runFolder);
      expect(checkGreenfieldRunReadiness(meta)).toBeUndefined();
    } finally {
      fs.rmSync(runFolder, { recursive: true, force: true });
    }
  });

  it('returns undefined for a greenfield run whose bootstrap-bundle.json is malformed JSON', () => {
    const runFolder = makeRunFolder();
    try {
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'bootstrap-bundle.json'), '{ not valid json');
      const meta = makeMeta('greenfield', runFolder);
      expect(checkGreenfieldRunReadiness(meta)).toBeUndefined();
    } finally {
      fs.rmSync(runFolder, { recursive: true, force: true });
    }
  });

  it('evaluates a real greenfield run from its actual on-disk artifacts', () => {
    const runFolder = makeRunFolder();
    try {
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'bootstrap-bundle.json'), VALID_BOOTSTRAP_BUNDLE);
      fs.writeFileSync(path.join(runFolder, 'reports', 'scaffold-implementation-report.txt'), VALID_SCAFFOLD_REPORT);
      const meta = makeMeta('greenfield', runFolder);
      const result = checkGreenfieldRunReadiness(meta);
      expect(result).toBeDefined();
      expect(result!.issues.filter((i) => i.code === 'GF_SCAFFOLD_REPORT_MISSING')).toEqual([]);
      // FirstVerticalSlice/VerificationReport are absent from this fixture,
      // so the run is correctly not ready overall.
      expect(result!.ready).toBe(false);
    } finally {
      fs.rmSync(runFolder, { recursive: true, force: true });
    }
  });

  it('does not write to the run folder while evaluating readiness', () => {
    const runFolder = makeRunFolder();
    try {
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'bootstrap-bundle.json'), VALID_BOOTSTRAP_BUNDLE);
      const before = fs.readdirSync(runFolder, { recursive: true } as any);
      const meta = makeMeta('greenfield', runFolder);
      checkGreenfieldRunReadiness(meta);
      const after = fs.readdirSync(runFolder, { recursive: true } as any);
      expect(after).toEqual(before);
    } finally {
      fs.rmSync(runFolder, { recursive: true, force: true });
    }
  });
});

// v1.3.0 Batch 4 correction: proves the disk-backed wrapper itself now
// reads and validates the persisted scaffold-plan.txt artifact -- the
// original Batch 4 gap this correction closes was that
// validateGreenfieldScaffoldPlan() (Batch 3, PSE-019) only ever ran when a
// caller injected an in-memory GreenfieldScaffoldPlan directly into the pure
// evaluateGreenfieldReadiness(); it never ran for a real run's persisted
// artifact. Every test in this block calls checkGreenfieldRunReadiness()
// against a real temp run folder with a real scaffold-plan.txt file on
// disk -- an in-memory-injection test into the pure evaluator would not be
// sufficient proof of this correction. Traces to Batch 3 PSE-019 (plan
// validation) and Batch 4 PSE-020 (evaluateGreenfieldReadiness's scaffoldPlan
// input, which this correction is the first thing to ever populate from disk).
describe('checkGreenfieldRunReadiness - persisted scaffold-plan validation (Batch 4 correction)', () => {
  it('validates a matching, structurally complete on-disk scaffold-plan.txt with no plan-identity issue', () => {
    const runFolder = makeRunFolder();
    try {
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'bootstrap-bundle.json'), VALID_BOOTSTRAP_BUNDLE);
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'scaffold-plan.txt'), VALID_SCAFFOLD_PLAN);
      fs.writeFileSync(path.join(runFolder, 'reports', 'scaffold-implementation-report.txt'), VALID_SCAFFOLD_REPORT);
      const meta = makeMeta('greenfield', runFolder);
      const result = checkGreenfieldRunReadiness(meta);
      expect(result).toBeDefined();
      expect(result!.issues.filter((i) => i.code === 'GF_PLAN_PROFILE_MISMATCH')).toEqual([]);
      expect(result!.issues.filter((i) => i.code === 'GF_PLAN_COMMAND_MISSING')).toEqual([]);
    } finally {
      fs.rmSync(runFolder, { recursive: true, force: true });
    }
  });

  it('reports GF_PLAN_PROFILE_MISMATCH for a current-format run with no scaffold-plan.txt on disk at all', () => {
    const runFolder = makeRunFolder();
    try {
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'bootstrap-bundle.json'), VALID_BOOTSTRAP_BUNDLE);
      fs.writeFileSync(path.join(runFolder, 'reports', 'scaffold-implementation-report.txt'), VALID_SCAFFOLD_REPORT);
      const meta = makeMeta('greenfield', runFolder);
      const result = checkGreenfieldRunReadiness(meta);
      expect(result).toBeDefined();
      const mismatch = result!.issues.find((i) => i.code === 'GF_PLAN_PROFILE_MISMATCH');
      expect(mismatch).toBeDefined();
      expect(mismatch!.actual).toBe('(none)');
    } finally {
      fs.rmSync(runFolder, { recursive: true, force: true });
    }
  });

  it('reports GF_PLAN_PROFILE_MISMATCH for an on-disk scaffold-plan.txt declaring a different profile', () => {
    const runFolder = makeRunFolder();
    try {
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'bootstrap-bundle.json'), VALID_BOOTSTRAP_BUNDLE);
      const mismatchedPlan = VALID_SCAFFOLD_PLAN.replace('Profile: typescript-cli', 'Profile: nextjs-app');
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'scaffold-plan.txt'), mismatchedPlan);
      fs.writeFileSync(path.join(runFolder, 'reports', 'scaffold-implementation-report.txt'), VALID_SCAFFOLD_REPORT);
      const meta = makeMeta('greenfield', runFolder);
      const result = checkGreenfieldRunReadiness(meta);
      expect(result).toBeDefined();
      const mismatch = result!.issues.find((i) => i.code === 'GF_PLAN_PROFILE_MISMATCH');
      expect(mismatch).toBeDefined();
      expect(mismatch!.expected).toBe('typescript-cli');
      expect(mismatch!.actual).toBe('nextjs-app');
    } finally {
      fs.rmSync(runFolder, { recursive: true, force: true });
    }
  });

  it('reports GF_PLAN_COMMAND_MISSING for an on-disk scaffold-plan.txt missing a required profile command', () => {
    const runFolder = makeRunFolder();
    try {
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'bootstrap-bundle.json'), VALID_BOOTSTRAP_BUNDLE);
      const planWithoutSetup = VALID_SCAFFOLD_PLAN.replace('Setup commands:\n- npm install: required\n', 'Setup commands:\n');
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'scaffold-plan.txt'), planWithoutSetup);
      fs.writeFileSync(path.join(runFolder, 'reports', 'scaffold-implementation-report.txt'), VALID_SCAFFOLD_REPORT);
      const meta = makeMeta('greenfield', runFolder);
      const result = checkGreenfieldRunReadiness(meta);
      expect(result).toBeDefined();
      expect(result!.issues.some((i) => i.code === 'GF_PLAN_COMMAND_MISSING')).toBe(true);
    } finally {
      fs.rmSync(runFolder, { recursive: true, force: true });
    }
  });

  it('does not validate scaffold-plan.txt for a legacy run (no "Profile" field in the scaffold implementation report), preserving old-run compatibility', () => {
    const runFolder = makeRunFolder();
    try {
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'bootstrap-bundle.json'), VALID_BOOTSTRAP_BUNDLE);
      // A malformed/mismatched plan that would otherwise fail validation.
      const mismatchedPlan = VALID_SCAFFOLD_PLAN.replace('Profile: typescript-cli', 'Profile: nextjs-app');
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'scaffold-plan.txt'), mismatchedPlan);
      const legacyReport = VALID_SCAFFOLD_REPORT.replace('Profile: typescript-cli\n', '');
      fs.writeFileSync(path.join(runFolder, 'reports', 'scaffold-implementation-report.txt'), legacyReport);
      const meta = makeMeta('greenfield', runFolder);
      const result = checkGreenfieldRunReadiness(meta);
      expect(result).toBeDefined();
      expect(result!.legacyRun).toBe(true);
      expect(result!.issues.filter((i) => i.code === 'GF_PLAN_PROFILE_MISMATCH')).toEqual([]);
      expect(result!.issues.filter((i) => i.code === 'GF_PLAN_COMMAND_MISSING')).toEqual([]);
    } finally {
      fs.rmSync(runFolder, { recursive: true, force: true });
    }
  });

  it('does not write to the run folder while reading and validating scaffold-plan.txt', () => {
    const runFolder = makeRunFolder();
    try {
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'bootstrap-bundle.json'), VALID_BOOTSTRAP_BUNDLE);
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'scaffold-plan.txt'), VALID_SCAFFOLD_PLAN);
      fs.writeFileSync(path.join(runFolder, 'reports', 'scaffold-implementation-report.txt'), VALID_SCAFFOLD_REPORT);
      const before = fs.readdirSync(runFolder, { recursive: true } as any);
      const meta = makeMeta('greenfield', runFolder);
      checkGreenfieldRunReadiness(meta);
      const after = fs.readdirSync(runFolder, { recursive: true } as any);
      expect(after).toEqual(before);
    } finally {
      fs.rmSync(runFolder, { recursive: true, force: true });
    }
  });
});

// v1.3.0 Batch 5: the real disk-backed wrapper (this file) previously only
// ever exercised typescript-cli end to end -- nextjs-app and android-compose
// were only used for "wrong profile" string substitutions in the block
// above, never for a full valid run through checkGreenfieldRunReadiness()
// itself. This closes that fixture gap so every current profile has
// equivalent disk-backed readiness coverage, including the scaffold-plan.txt
// integration from the Batch 4 correction.
describe('checkGreenfieldRunReadiness - cross-profile disk-backed readiness (Batch 5)', () => {
  it('evaluates a complete, ready nextjs-app run from real on-disk artifacts', () => {
    const runFolder = makeRunFolder();
    try {
      const bundle = JSON.stringify({
        selectedProfile: { status: 'selected', profile: { id: 'nextjs-app' }, reason: 'x', stackDecisionNotes: [] },
      });
      const scaffoldReport = `Artifact: ScaffoldImplementationReport
Workflow mode: greenfield
Profile: nextjs-app
Files changed:
- agents.txt
- claude.txt
- AGENTS.md
- CLAUDE.md
- package.json
- app/layout.tsx
- app/page.tsx
- README.md
Commands run:
- npm install: passed
Status: complete
`;
      const scaffoldPlan = `Artifact: ScaffoldPlan
Workflow mode: greenfield
Profile: nextjs-app
Planned file groups: app-router pages.
Target paths:
- agents.txt
- claude.txt
- AGENTS.md
- CLAUDE.md
- package.json
- app/layout.tsx
- app/page.tsx
- README.md
First runnable behavior: the root page renders a heading and a counter.
Setup commands:
- npm install: required
Validation commands:
- npm run typecheck: required
- npm run build: required
- npm test: required
Test expectations:
- component tests for the root page
Documentation expectations:
- page/route map
Unresolved decisions:
- none
Non-goals:
- no authentication
Status: complete
`;
      const firstSlice = `Artifact: FirstVerticalSlice
Workflow mode: greenfield
Profile: nextjs-app
Minimal behavior: The root page renders a heading and a counter button that increments and displays the current count in local component state on every click.
Entry point: app/page.tsx
Tied to product boundary: Demonstrates the core page-rendering workflow described in the product boundary document.
Status: complete
`;
      const verificationReport = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
- npm run typecheck: passed
- npm run build: passed
- npm test: passed
Status: complete
`;
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'bootstrap-bundle.json'), bundle);
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'scaffold-plan.txt'), scaffoldPlan);
      fs.writeFileSync(path.join(runFolder, 'reports', 'scaffold-implementation-report.txt'), scaffoldReport);
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'first-vertical-slice.txt'), firstSlice);
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'verification-report.txt'), verificationReport);
      const meta = makeMeta('greenfield', runFolder);
      const result = checkGreenfieldRunReadiness(meta);
      expect(result).toBeDefined();
      expect(result!.ready).toBe(true);
      expect(result!.issues).toEqual([]);
    } finally {
      fs.rmSync(runFolder, { recursive: true, force: true });
    }
  });

  it('evaluates a complete, ready android-compose run from real on-disk artifacts, including an honestly skipped optional command', () => {
    const runFolder = makeRunFolder();
    try {
      const bundle = JSON.stringify({
        selectedProfile: { status: 'selected', profile: { id: 'android-compose' }, reason: 'x', stackDecisionNotes: [] },
      });
      const scaffoldReport = `Artifact: ScaffoldImplementationReport
Workflow mode: greenfield
Profile: android-compose
Files changed:
- agents.txt
- claude.txt
- AGENTS.md
- CLAUDE.md
- settings.gradle.kts
- build.gradle.kts
- app/build.gradle.kts
- app/src/main/AndroidManifest.xml
- app/src/main/java/MainActivity.kt
- app/src/test/java/ExampleUnitTest.kt
- app/src/androidTest/java/ExampleInstrumentedTest.kt
Commands run:
Status: complete
`;
      const scaffoldPlan = `Artifact: ScaffoldPlan
Workflow mode: greenfield
Profile: android-compose
Planned file groups: single Android app module.
Target paths:
- agents.txt
- claude.txt
- AGENTS.md
- CLAUDE.md
- settings.gradle.kts
- build.gradle.kts
- app/build.gradle.kts
- app/src/main/AndroidManifest.xml
- app/src/main/java/MainActivity.kt
- app/src/test/java/ExampleUnitTest.kt
- app/src/androidTest/java/ExampleInstrumentedTest.kt
First runnable behavior: MainActivity renders a Compose counter screen.
Setup commands:
Validation commands:
- ./gradlew build: required
- ./gradlew testDebugUnitTest: required
- ./gradlew connectedAndroidTest: optional, requires a connected device or emulator
Test expectations:
- unit tests under app/src/test
Documentation expectations:
- Android project overview
Unresolved decisions:
- none
Non-goals:
- no Room database
Status: complete
`;
      const firstSlice = `Artifact: FirstVerticalSlice
Workflow mode: greenfield
Profile: android-compose
Minimal behavior: MainActivity renders a Compose screen with a single button that increments and displays a counter value on tap.
Entry point: app/src/main/java/MainActivity.kt
Tied to product boundary: Demonstrates the core Compose UI interaction described in the product boundary document.
Status: complete
`;
      const verificationReport = `Artifact: VerificationReport
Workflow mode: greenfield
Commands verified:
- ./gradlew build: passed
- ./gradlew testDebugUnitTest: passed
- ./gradlew connectedAndroidTest: skipped, no connected device or emulator available
Status: complete
`;
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'bootstrap-bundle.json'), bundle);
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'scaffold-plan.txt'), scaffoldPlan);
      fs.writeFileSync(path.join(runFolder, 'reports', 'scaffold-implementation-report.txt'), scaffoldReport);
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'first-vertical-slice.txt'), firstSlice);
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'verification-report.txt'), verificationReport);
      const meta = makeMeta('greenfield', runFolder);
      const result = checkGreenfieldRunReadiness(meta);
      expect(result).toBeDefined();
      expect(result!.ready).toBe(true);
      expect(result!.issues).toEqual([]);
    } finally {
      fs.rmSync(runFolder, { recursive: true, force: true });
    }
  });
});
