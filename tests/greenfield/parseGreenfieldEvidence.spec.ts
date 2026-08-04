import { parseArtifact } from '../../src/artifactChecker';
import {
  parseFileListSection,
  parseCommandEvidenceSection,
  reconstructProjectDocsBootstrapResult,
  parsePlanCommandSection,
  parseGreenfieldScaffoldPlanArtifact,
} from '../../src/greenfield/readiness/parseGreenfieldEvidence';

describe('parseFileListSection', () => {
  it('parses one bullet per line', () => {
    expect(parseFileListSection('- package.json\n- src/cli.ts')).toEqual(['package.json', 'src/cli.ts']);
  });

  it('accepts "*" bullets too', () => {
    expect(parseFileListSection('* package.json')).toEqual(['package.json']);
  });

  it('ignores non-bulleted lines', () => {
    expect(parseFileListSection('created the following files\n- package.json')).toEqual(['package.json']);
  });

  it('returns an empty array for undefined/blank input', () => {
    expect(parseFileListSection(undefined)).toEqual([]);
    expect(parseFileListSection('')).toEqual([]);
  });
});

describe('parseCommandEvidenceSection', () => {
  it('parses passed/failed/skipped entries', () => {
    const result = parseCommandEvidenceSection(
      '- npm run typecheck: passed\n- npm run build: failed\n- npm test: skipped, no time budget',
    );
    expect(result).toEqual([
      { command: 'npm run typecheck', status: 'passed', reason: undefined },
      { command: 'npm run build', status: 'failed', reason: undefined },
      { command: 'npm test', status: 'skipped', reason: 'no time budget' },
    ]);
  });

  it('ignores lines with an unknown status', () => {
    expect(parseCommandEvidenceSection('- npm test: maybe')).toEqual([]);
  });

  it('ignores malformed lines with no colon', () => {
    expect(parseCommandEvidenceSection('- npm test')).toEqual([]);
  });

  it('returns an empty array for undefined input', () => {
    expect(parseCommandEvidenceSection(undefined)).toEqual([]);
  });

  it('handles a command containing a colon (uses the last colon as the separator)', () => {
    const result = parseCommandEvidenceSection('- npm run test:unit: passed');
    expect(result).toEqual([{ command: 'npm run test:unit', status: 'passed', reason: undefined }]);
  });
});

describe('reconstructProjectDocsBootstrapResult', () => {
  it('reconstructs generated targets from present, nonblank sections', () => {
    const content = `Artifact: ProjectDocsReport
Workflow mode: greenfield
Profile: typescript-cli
Product boundary: A CLI tool for syncing notes.
Stack decision: TypeScript, Node.js.
Starter profile summary: TypeScript CLI.
Development workflow: single package.
Testing expectations: unit tests.
Validation expectations: typecheck, build, test.
Scaffold planning notes: package.json, src/cli.ts.
Unresolved decisions: none.
Non-goals: no GUI.
Status: complete
`;
    const parsed = parseArtifact(content);
    const reconstructed = reconstructProjectDocsBootstrapResult(parsed);
    expect(reconstructed.targets).toHaveLength(9);
    expect(reconstructed.targets.every((t) => t.status === 'generated')).toBe(true);
    const productBoundary = reconstructed.targets.find((t) => t.docName === 'product-boundary')!;
    expect(productBoundary.sections[0].content).toBe('A CLI tool for syncing notes.');
  });

  it('omits a section that is entirely absent from the rendered report (so missing-required-section can still detect it)', () => {
    const content = `Artifact: ProjectDocsReport
Workflow mode: greenfield
Product boundary: A CLI tool.
Status: complete
`;
    const parsed = parseArtifact(content);
    const reconstructed = reconstructProjectDocsBootstrapResult(parsed);
    expect(reconstructed.targets.find((t) => t.docName === 'non-goals')).toBeUndefined();
  });

  it('marks a present-but-blank doc-name section as skipped (distinct from entirely absent)', () => {
    const content = `Artifact: ProjectDocsReport
Workflow mode: greenfield
Product boundary: A CLI tool.
Non-goals:
Status: complete
`;
    const parsed = parseArtifact(content);
    const reconstructed = reconstructProjectDocsBootstrapResult(parsed);
    const nonGoals = reconstructed.targets.find((t) => t.docName === 'non-goals')!;
    expect(nonGoals.status).toBe('skipped');
    expect(nonGoals.unresolvedNotes.length).toBeGreaterThan(0);
  });
});

// v1.3.0 Batch 4 correction (traces to Batch 4 PSE-020, evaluateGreenfieldReadiness's
// existing scaffoldPlan input, and Batch 3 PSE-019's plan/profile identity check --
// this correction makes that input reachable from a real persisted plan).
describe('parsePlanCommandSection', () => {
  it('parses required/optional entries with an optional environment note', () => {
    const result = parsePlanCommandSection(
      '- npm install: required\n- npm run e2e: optional, requires a running emulator',
    );
    expect(result).toEqual([
      { command: 'npm install', purpose: '(reported)', required: true },
      {
        command: 'npm run e2e',
        purpose: '(reported)',
        required: false,
        environmentNotes: 'requires a running emulator',
      },
    ]);
  });

  it('ignores lines with an unknown classification', () => {
    expect(parsePlanCommandSection('- npm test: sometimes')).toEqual([]);
  });

  it('ignores malformed lines with no colon', () => {
    expect(parsePlanCommandSection('- npm test')).toEqual([]);
  });

  it('returns an empty array for undefined input', () => {
    expect(parsePlanCommandSection(undefined)).toEqual([]);
  });

  it('handles a command containing a colon (uses the last colon as the separator)', () => {
    const result = parsePlanCommandSection('- npm run test:unit: required');
    expect(result).toEqual([{ command: 'npm run test:unit', purpose: '(reported)', required: true }]);
  });
});

describe('parseGreenfieldScaffoldPlanArtifact', () => {
  const FULL_PLAN_TEXT = `Artifact: ScaffoldPlan
Workflow mode: greenfield
Profile: typescript-cli
Planned file groups: core CLI files.
Target paths:
- package.json
- src/cli.ts
First runnable behavior: running the CLI prints a greeting.
Setup commands:
- npm install: required
Validation commands:
- npm run typecheck: required
- npm run e2e: optional, requires network access
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

  it('reconstructs a full GreenfieldScaffoldPlan from a structured plan artifact', () => {
    const plan = parseGreenfieldScaffoldPlanArtifact(parseArtifact(FULL_PLAN_TEXT));
    expect(plan.profileId).toBe('typescript-cli');
    expect(plan.plannedFileGroups).toEqual([
      { name: 'reported', description: 'Reported target paths.', filePaths: ['package.json', 'src/cli.ts'] },
    ]);
    expect(plan.firstRunnableBehavior).toEqual({ description: 'running the CLI prints a greeting.' });
    expect(plan.setupCommands).toEqual([{ command: 'npm install', purpose: '(reported)', required: true }]);
    expect(plan.validationCommands).toEqual([
      { command: 'npm run typecheck', purpose: '(reported)', required: true },
      {
        command: 'npm run e2e',
        purpose: '(reported)',
        required: false,
        environmentNotes: 'requires network access',
      },
    ]);
    expect(plan.testExpectations).toEqual(['unit tests for the CLI entry point']);
    expect(plan.documentationExpectations).toEqual(['README usage section']);
    expect(plan.unresolvedDecisions).toEqual(['none']);
    expect(plan.nonGoals).toEqual(['no GUI']);
    expect(plan.unsupportedClaims).toEqual([]);
  });

  it('reconstructs an empty-but-defined plan (profileId undefined) from a blank artifact', () => {
    const plan = parseGreenfieldScaffoldPlanArtifact(parseArtifact(''));
    expect(plan).toEqual({
      profileId: undefined,
      plannedFileGroups: [],
      firstRunnableBehavior: { description: '' },
      setupCommands: [],
      validationCommands: [],
      testExpectations: [],
      documentationExpectations: [],
      unresolvedDecisions: [],
      nonGoals: [],
      unsupportedClaims: [],
    });
  });

  it('treats a blank "Profile" section the same as an absent one', () => {
    const content = `Artifact: ScaffoldPlan\nWorkflow mode: greenfield\nProfile:\nStatus: complete\n`;
    const plan = parseGreenfieldScaffoldPlanArtifact(parseArtifact(content));
    expect(plan.profileId).toBeUndefined();
  });
});
