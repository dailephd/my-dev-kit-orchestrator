import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(repositoryRoot, 'scripts', 'check-docs-consistency.mjs');
const temporaryRoots: string[] = [];

function copyFile(root: string, relativePath: string): void {
  const destination = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(repositoryRoot, relativePath), destination);
}

function makeFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-docs-check-'));
  temporaryRoots.push(root);
  for (const relativePath of ['package.json', 'README.md', 'CHANGELOG.md']) copyFile(root, relativePath);
  fs.cpSync(path.join(repositoryRoot, 'docs'), path.join(root, 'docs'), { recursive: true });
  fs.cpSync(path.join(repositoryRoot, 'src', 'commands'), path.join(root, 'src', 'commands'), { recursive: true });
  for (const relativePath of [
    'src/types.ts',
    'src/workflows.ts',
    'src/program.ts',
    'src/greenfield/modes/greenfieldStages.ts',
    'src/greenfield/modes/greenfieldMode.ts',
    'src/greenfield/profiles/resolveGreenfieldProfile.ts',
    'src/instructions/catalogTypes.ts',
    'src/instructions/workflowInstructionPacket.ts',
    'src/instructions/taskState.ts',
    'src/instructions/stageContextBundle.ts',
    'src/instructions/supplementalContextTypes.ts',
    'src/instructions/contextReadiness.ts',
    'src/instructions/stageRepositoryEvidenceRequirements.ts',
    'src/instructions/runSemanticContinuity.ts',
    'src/instructions/testResponsibilityCriticality.ts',
    'src/runIntegrityGate.ts',
    'src/runTelemetry.ts',
    'src/runWorkflowEconomics.ts',
    'tests/fixtures/v121-compatibility/compatibility-manifest.json',
  ]) copyFile(root, relativePath);
  return root;
}

function mutate(root: string, relativePath: string, transform: (content: string) => string): void {
  const target = path.join(root, relativePath);
  const before = fs.readFileSync(target, 'utf8');
  const after = transform(before);
  expect(after).not.toBe(before);
  fs.writeFileSync(target, after, 'utf8');
}

function run(root: string) {
  return spawnSync(process.execPath, [scriptPath, '--root', root], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

afterAll(() => {
  for (const root of temporaryRoots) fs.rmSync(root, { recursive: true, force: true });
});

describe('docs consistency check script', () => {
  it('passes a complete fixture derived from current canonical inputs', () => {
    const result = run(makeFixture());
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DOCS_CHECK_PASS');
    expect(result.stdout).toContain('4 greenfield profiles');
  });

  it('fails when README contains a stale current-published version claim', () => {
    const root = makeFixture();
    mutate(root, 'README.md', (content) => `${content}\n` + '`v1.0.0` is the current published stable release.\n');
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[STALE_PUBLISHED_VERSION_CLAIM]');
  });

  it('fails when current docs omit a source-defined greenfield profile', () => {
    const root = makeFixture();
    for (const relativePath of ['README.md', 'docs/WORKFLOWS.md']) {
      mutate(root, relativePath, (content) => content.replace(/`android-compose`/g, 'Android profile'));
    }
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[GREENFIELD_PROFILE_CLAIM_MISSING]');
  });

  it('fails when docs state the old two-profile count', () => {
    const root = makeFixture();
    mutate(root, 'docs/WORKFLOWS.md', (content) => content.replace(/supports four starter\s+profiles:/, 'supports two starter profiles:'));
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[GREENFIELD_PROFILE_COUNT_MISMATCH]');
  });

  it('allows the accurate Android Compose support claim', () => {
    const root = makeFixture();
    mutate(root, 'README.md', (content) => `${content}\nThe greenfield mode supports Android Compose as a starter profile.\n`);
    expect(run(root).status).toBe(0);
  });

  it('fails on an unnegated generic mobile support claim', () => {
    const root = makeFixture();
    mutate(root, 'README.md', (content) => `${content}\nThe orchestrator supports mobile development end to end.\n`);
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[GENERIC_MOBILE_SUPPORT_FALSE_CLAIM]');
  });

  it('allows accurate negated Gradle, Android SDK, and Play Store boundaries', () => {
    const root = makeFixture();
    mutate(root, 'README.md', (content) => `${content}\nThe orchestrator does not run Gradle, does not require the Android SDK, and does not claim Play Store readiness.\n`);
    expect(run(root).status).toBe(0);
  });

  it('fails when a preservation-manifest term disappears', () => {
    const root = makeFixture();
    mutate(root, 'README.md', (content) => content.replace('design-first', 'structured'));
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[PRESERVED_TERM_MISSING]');
  });

  it('fails when README drops a common canonical document link', () => {
    const root = makeFixture();
    mutate(root, 'README.md', (content) => content.replace(/\]\(docs\/CONTRACTS\.md\)/g, '](docs/ARCHITECTURE.md)'));
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[README_CANONICAL_LINK_MISSING]');
  });
});

describe('v1.6.0 telemetry facts (isolated fixture)', () => {
  it('fails when the recorded-command set in source drifts from the manifest', () => {
    const root = makeFixture();
    mutate(root, 'src/runTelemetry.ts', (content) => content.replace("['start', 'prompt', 'mark']", "['start', 'prompt', 'mark', 'status']"));
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('telemetryRecordedCommands');
  });

  it('fails when the telemetry contract or economics version in source drifts from the manifest', () => {
    for (const [file, from, to] of [
      ['src/runTelemetry.ts', "RUN_TELEMETRY_VERSION = '1.0.0'", "RUN_TELEMETRY_VERSION = '1.1.0'"],
      ['src/runWorkflowEconomics.ts', "WORKFLOW_ECONOMICS_VERSION = '1.0.0'", "WORKFLOW_ECONOMICS_VERSION = '1.1.0'"],
    ]) {
      const root = makeFixture();
      mutate(root, file, (content) => content.replace(from, to));
      expect(run(root).status).toBe(1);
    }
  });

  it('fails when ARCHITECTURE omits the telemetry or economics version row', () => {
    for (const row of ['| Run telemetry contract | `1.0.0` |', '| Workflow Economics | `1.0.0` |']) {
      const root = makeFixture();
      mutate(root, 'docs/ARCHITECTURE.md', (content) => content.replace(row, ''));
      const result = run(root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[SCHEMA_VERSION_CLAIM_MISMATCH]');
    }
  });

  it('requires v1.6.0 current-release wording and a dated finalized changelog section', () => {
    const transitional = makeFixture();
    mutate(transitional, 'docs/ROADMAP.md', (content) => `${content}\nv1.6.0 is not yet published.\n`);
    expect(run(transitional).stderr).toContain('[CURRENT_RELEASE_STATUS_CONTRADICTION]');

    const missingHeading = makeFixture();
    mutate(missingHeading, 'CHANGELOG.md', (content) => content.replace('## v1.6.0 - ', '## Draft - '));
    expect(run(missingHeading).stderr).toContain('[CURRENT_RELEASE_CHANGELOG_NOT_FINAL]');

    const missingDate = makeFixture();
    mutate(missingDate, 'CHANGELOG.md', (content) => content.replace('Release date: 2026-09-26.\n', ''));
    expect(run(missingDate).stderr).toContain('[CURRENT_RELEASE_CHANGELOG_NOT_FINAL]');
  });
});
