import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const cliPath = path.resolve(repoRoot, 'dist', 'cli.js');

function runCli(args, cwd) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label} did not include expected text: ${needle}`);
  }
}

function getSingleRunFolder(projectRoot) {
  const runsDir = path.join(projectRoot, '.my-dev-kit-orchestrator', 'runs');
  const entries = fs
    .readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (entries.length !== 1) {
    throw new Error(`Expected exactly one run folder in ${runsDir}, found ${entries.length}`);
  }

  return path.join(runsDir, entries[0]);
}

function withTempDir(prefix, fn) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function smokeHelp() {
  const version = runCli(['--version'], repoRoot).trim();
  if (version !== '0.3.0') {
    throw new Error(`Expected version 0.3.0, got ${version}`);
  }

  const help = runCli(['--help'], repoRoot);
  for (const command of ['init', 'start', 'status', 'prompt', 'list', 'mark']) {
    assertIncludes(help, command, 'CLI help');
  }
}

function smokeNormal() {
  withTempDir('mdko-smoke-normal-', (projectRoot) => {
    runCli(['init'], projectRoot);
    runCli(['start', '--mode', 'feature', 'Add a sample feature'], projectRoot);

    const status = runCli(['status'], projectRoot);
    assertIncludes(status, 'Mode:', 'feature status');
    assertIncludes(status, '  feature', 'feature status');
    assertIncludes(status, 'Current / next stage:', 'feature status');
    assertIncludes(status, '  request-brief', 'feature status');

    const prompt = runCli(['prompt'], projectRoot);
    assertIncludes(prompt, 'Stage: request-brief', 'feature prompt');

    const list = runCli(['list'], projectRoot);
    assertIncludes(list, 'feature', 'feature list');
  });
}

function smokeExtraction() {
  withTempDir('mdko-smoke-extraction-', (root) => {
    const sourceRoot = path.join(root, 'source repo');
    const targetRoot = path.join(root, 'target repo');
    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.mkdirSync(targetRoot, { recursive: true });

    runCli(['init'], targetRoot);
    runCli(
      [
        'start',
        '--mode',
        'extraction',
        '--source',
        sourceRoot,
        '--target',
        targetRoot,
        'Extract release smoke workflow',
      ],
      targetRoot,
    );

    const status = runCli(['status'], targetRoot);
    assertIncludes(status, 'Mode:', 'extraction status');
    assertIncludes(status, '  extraction', 'extraction status');
    assertIncludes(status, sourceRoot, 'extraction status');
    assertIncludes(status, targetRoot, 'extraction status');

    const prompt = runCli(['prompt'], targetRoot);
    assertIncludes(prompt, 'Stage: request-brief', 'extraction prompt');
  });
}

function smokeLifecycle() {
  withTempDir('mdko-smoke-lifecycle-', (projectRoot) => {
    runCli(['init'], projectRoot);
    runCli(['start', '--mode', 'feature', 'Lifecycle smoke workflow'], projectRoot);

    const initialStatus = runCli(['status'], projectRoot);
    assertIncludes(initialStatus, '[missing', 'initial lifecycle status');

    const runFolder = getSingleRunFolder(projectRoot);
    fs.writeFileSync(path.join(runFolder, 'artifacts', 'request-brief.txt'), 'Lifecycle request brief', 'utf8');

    runCli(
      ['mark', 'request-brief.txt', '--state', 'incomplete', '--reason', 'Lifecycle smoke incomplete marker'],
      projectRoot,
    );
    const incompleteStatus = runCli(['status'], projectRoot);
    assertIncludes(incompleteStatus, '[incomplete', 'incomplete lifecycle status');
    assertIncludes(incompleteStatus, 'Lifecycle smoke incomplete marker', 'incomplete lifecycle reason');
    const incompletePrompt = runCli(['prompt'], projectRoot);
    assertIncludes(incompletePrompt, 'Current artifact state: incomplete', 'incomplete lifecycle prompt');

    runCli(
      ['mark', 'request-brief.txt', '--state', 'blocked', '--reason', 'Lifecycle smoke blocked marker'],
      projectRoot,
    );
    const blockedStatus = runCli(['status'], projectRoot);
    assertIncludes(blockedStatus, '[blocked', 'blocked lifecycle status');
    assertIncludes(blockedStatus, 'Lifecycle smoke blocked marker', 'blocked lifecycle reason');

    runCli(['mark', 'request-brief.txt', '--state', 'complete'], projectRoot);
    const completeStatus = runCli(['status'], projectRoot);
    assertIncludes(completeStatus, '[complete', 'complete lifecycle status');
    const nextPrompt = runCli(['prompt'], projectRoot);
    assertIncludes(nextPrompt, 'Stage: architecture-context', 'post-complete lifecycle prompt');
  });
}

const mode = process.argv[2] ?? 'all';

smokeHelp();

if (mode === 'all' || mode === 'normal') {
  smokeNormal();
}

if (mode === 'all' || mode === 'lifecycle') {
  smokeLifecycle();
}

if (mode === 'all' || mode === 'extraction') {
  smokeExtraction();
}
