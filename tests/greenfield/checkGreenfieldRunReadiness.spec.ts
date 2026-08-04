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
