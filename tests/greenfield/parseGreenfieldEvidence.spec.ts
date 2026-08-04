import { parseArtifact } from '../../src/artifactChecker';
import {
  parseFileListSection,
  parseCommandEvidenceSection,
  reconstructProjectDocsBootstrapResult,
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
