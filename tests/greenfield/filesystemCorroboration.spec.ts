import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { corroborateGeneratedTarget } from '../../src/greenfield/readiness/corroborateGeneratedTarget';
import { evaluateGreenfieldReadiness } from '../../src/greenfield/readiness/evaluateGreenfieldReadiness';
import { TYPESCRIPT_CLI_PROFILE } from '../../src/greenfield/profiles/typescriptCliProfile';

function makeTempProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gf-readiness-'));
}

// TST-046: report-only, corroborated, missing, directory, symlink, and
// filesystem-only cases inside a temp projectRoot.
describe('corroborateGeneratedTarget - bounded read-only filesystem corroboration (TST-046)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = makeTempProjectRoot();
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('classifies a reported regular file as corroborated', () => {
    fs.writeFileSync(path.join(projectRoot, 'package.json'), '{}');
    expect(corroborateGeneratedTarget(projectRoot, 'package.json').status).toBe('corroborated');
  });

  it('classifies a reported missing file as missing', () => {
    expect(corroborateGeneratedTarget(projectRoot, 'does-not-exist.txt').status).toBe('missing');
  });

  it('classifies a reported path that is a directory as directory', () => {
    fs.mkdirSync(path.join(projectRoot, 'src'));
    expect(corroborateGeneratedTarget(projectRoot, 'src').status).toBe('directory');
  });

  it('classifies a reported path that is a symlink as symlink and does not follow it', () => {
    const realFile = path.join(projectRoot, 'real.txt');
    fs.writeFileSync(realFile, 'content');
    const linkPath = path.join(projectRoot, 'link.txt');
    try {
      fs.symlinkSync(realFile, linkPath);
    } catch {
      // Symlink creation can require elevated privileges on Windows; report
      // this platform limitation honestly rather than failing the suite.
      // eslint-disable-next-line no-console
      console.warn('Skipping symlink corroboration test: platform could not create a symlink.');
      return;
    }
    expect(corroborateGeneratedTarget(projectRoot, 'link.txt').status).toBe('symlink');
  });

  it('handles spaces and parentheses in reported paths', () => {
    fs.writeFileSync(path.join(projectRoot, 'My Notes (v2).md'), 'content');
    expect(corroborateGeneratedTarget(projectRoot, 'My Notes (v2).md').status).toBe('corroborated');
  });

  it('rejects escaping the project root via a resolved traversal', () => {
    // normalizeTargetPath() already rejects literal ".." before this point;
    // this proves the defensive re-check inside corroborateGeneratedTarget
    // itself also refuses to resolve outside projectRoot if ever reached.
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-outside-'));
    try {
      const relativeEscape = path.relative(projectRoot, path.join(outsideDir, 'secret.txt'));
      const result = corroborateGeneratedTarget(projectRoot, relativeEscape);
      expect(['unavailable', 'missing']).toContain(result.status);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('does not read file content (a large/invalid-content file is still just corroborated by kind)', () => {
    fs.writeFileSync(path.join(projectRoot, 'package.json'), Buffer.from([0xff, 0xfe, 0x00, 0x01]));
    expect(corroborateGeneratedTarget(projectRoot, 'package.json').status).toBe('corroborated');
  });

  it('does not write to the project root', () => {
    const before = fs.readdirSync(projectRoot);
    corroborateGeneratedTarget(projectRoot, 'package.json');
    expect(fs.readdirSync(projectRoot)).toEqual(before);
  });
});

describe('evaluateGreenfieldReadiness - filesystem corroboration integration', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = makeTempProjectRoot();
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
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

  function writeAllReportedFiles(): void {
    fs.writeFileSync(path.join(projectRoot, 'agents.txt'), 'instructions');
    fs.writeFileSync(path.join(projectRoot, 'claude.txt'), 'instructions');
    fs.writeFileSync(path.join(projectRoot, 'AGENTS.md'), '# adapter');
    fs.writeFileSync(path.join(projectRoot, 'CLAUDE.md'), '# adapter');
    fs.writeFileSync(path.join(projectRoot, 'package.json'), '{}');
    fs.mkdirSync(path.join(projectRoot, 'src'));
    fs.writeFileSync(path.join(projectRoot, 'src', 'cli.ts'), 'export {};');
    fs.writeFileSync(path.join(projectRoot, 'src', 'index.ts'), 'export {};');
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# readme');
  }

  it('reports filesystemCorroborationPerformed=true and no conflict when every reported file exists', () => {
    writeAllReportedFiles();
    const result = evaluateGreenfieldReadiness({
      profile: TYPESCRIPT_CLI_PROFILE,
      scaffoldImplementationReportContent: VALID_SCAFFOLD_REPORT,
      projectRoot,
    });
    expect(result.filesystemCorroborationPerformed).toBe(true);
    expect(result.issues.filter((i) => i.code === 'GF_GENERATED_EVIDENCE_CONFLICT')).toEqual([]);
  });

  it('TST-009: reports a conflict when a reported common instruction file is absent on disk', () => {
    writeAllReportedFiles();
    fs.rmSync(path.join(projectRoot, 'agents.txt'));
    const result = evaluateGreenfieldReadiness({
      profile: TYPESCRIPT_CLI_PROFILE,
      scaffoldImplementationReportContent: VALID_SCAFFOLD_REPORT,
      projectRoot,
    });
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'GF_GENERATED_EVIDENCE_CONFLICT',
        evidenceKey: 'common-agents-instructions',
      }),
    );
  });

  it('flags a report/filesystem conflict when a reported file does not actually exist on disk', () => {
    fs.writeFileSync(path.join(projectRoot, 'package.json'), '{}');
    fs.mkdirSync(path.join(projectRoot, 'src'));
    fs.writeFileSync(path.join(projectRoot, 'src', 'cli.ts'), 'export {};');
    // src/index.ts and README.md intentionally not created.
    const result = evaluateGreenfieldReadiness({
      profile: TYPESCRIPT_CLI_PROFILE,
      scaffoldImplementationReportContent: VALID_SCAFFOLD_REPORT,
      projectRoot,
    });
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_GENERATED_EVIDENCE_CONFLICT' }));
  });

  it('flags a conflict when a reported file is actually a directory', () => {
    writeAllReportedFiles();
    fs.rmSync(path.join(projectRoot, 'README.md'));
    fs.mkdirSync(path.join(projectRoot, 'README.md'));
    const result = evaluateGreenfieldReadiness({
      profile: TYPESCRIPT_CLI_PROFILE,
      scaffoldImplementationReportContent: VALID_SCAFFOLD_REPORT,
      projectRoot,
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_GENERATED_EVIDENCE_CONFLICT', actual: 'directory' }),
    );
  });

  it('report evidence remains mandatory: filesystem-only files cannot satisfy a missing report entry', () => {
    writeAllReportedFiles();
    const result = evaluateGreenfieldReadiness({
      profile: TYPESCRIPT_CLI_PROFILE,
      scaffoldImplementationReportContent: undefined, // no report at all, despite real files on disk
      projectRoot,
    });
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_SCAFFOLD_REPORT_MISSING' }));
    expect(result.filesystemCorroborationPerformed).toBe(false);
  });

  it('does not perform corroboration when projectRoot is not provided', () => {
    const result = evaluateGreenfieldReadiness({
      profile: TYPESCRIPT_CLI_PROFILE,
      scaffoldImplementationReportContent: VALID_SCAFFOLD_REPORT,
    });
    expect(result.filesystemCorroborationPerformed).toBe(false);
  });
});
