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
  if (version !== '0.6.0') {
    throw new Error(`Expected version 0.6.0, got ${version}`);
  }

  const help = runCli(['--help'], repoRoot);
  for (const command of ['init', 'start', 'status', 'prompt', 'list', 'mark', 'check']) {
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

function smokeCheck() {
  withTempDir('mdko-smoke-check-', (projectRoot) => {
    runCli(['init'], projectRoot);
    runCli(['start', '--mode', 'feature', 'Check smoke workflow'], projectRoot);

    // check with no artifacts: should show fail results (exit 1)
    let checkOutput;
    try {
      checkOutput = runCli(['check'], projectRoot);
    } catch (err) {
      checkOutput = err.stdout ?? '';
    }
    assertIncludes(checkOutput, 'Check results for run:', 'check output header');
    assertIncludes(checkOutput, 'MISSING_FILE', 'check missing artifact');

    // check --prompts: generated prompts should pass
    const promptCheck = runCli(['check', '--prompts'], projectRoot);
    assertIncludes(promptCheck, 'Prompts:', 'check --prompts output');
    assertIncludes(promptCheck, '[pass]', 'check --prompts pass');

    // status should show content check summary
    const status = runCli(['status'], projectRoot);
    assertIncludes(status, 'Content check:', 'status check summary');

    // check --help
    const checkHelp = runCli(['check', '--help'], projectRoot);
    assertIncludes(checkHelp, '--artifact', 'check help --artifact');
    assertIncludes(checkHelp, '--prompts', 'check help --prompts');
    assertIncludes(checkHelp, '--strict', 'check help --strict');
    assertIncludes(checkHelp, '--trace', 'check help --trace');
    assertIncludes(checkHelp, '--design-map', 'check help --design-map');
  });
}

function smokeTrace() {
  withTempDir('mdko-smoke-trace-', (projectRoot) => {
    runCli(['init'], projectRoot);
    runCli(['start', '--mode', 'feature', 'Trace smoke workflow'], projectRoot);

    const runFolder = getSingleRunFolder(projectRoot);
    const artifactDir = path.join(runFolder, 'artifacts');
    fs.mkdirSync(artifactDir, { recursive: true });

    // Write artifact with well-formed trace IDs and links
    const wellFormed = [
      'REQ-001: smoke requirement',
      'BEH-001: smoke behavior',
      'REQ-001 -> BEH-001',
    ].join('\n');
    fs.writeFileSync(path.join(artifactDir, 'behavior-model.txt'), wellFormed, 'utf8');

    // check --trace with well-formed artifact should succeed
    const traceOutput = runCli(['check', '--trace'], projectRoot);
    assertIncludes(traceOutput, 'Trace check results for run:', 'check --trace output header');

    // Write an artifact with a missing link target
    const badContent = 'REQ-001: requirement\nREQ-001 -> BEH-999';
    fs.writeFileSync(path.join(artifactDir, 'pseudocode-packet.txt'), badContent, 'utf8');

    let badTraceOutput;
    try {
      badTraceOutput = runCli(['check', '--trace'], projectRoot);
    } catch (err) {
      badTraceOutput = err.stdout ?? '';
    }
    assertIncludes(badTraceOutput, 'TRACE_MISSING_LINK_TARGET', 'check --trace detects missing target');

    // check --design-map with no design-map file should show MISSING_FILE (exit 1)
    let designMapOutput;
    try {
      designMapOutput = runCli(['check', '--design-map'], projectRoot);
    } catch (err) {
      designMapOutput = err.stdout ?? '';
    }
    assertIncludes(designMapOutput, 'Design map check for run:', 'check --design-map output header');
    assertIncludes(designMapOutput, 'MISSING_FILE', 'check --design-map missing file');

    // status should show "Trace check:" summary after check --trace
    const status = runCli(['status'], projectRoot);
    assertIncludes(status, 'Trace check:', 'status trace check summary');
  });
}

function smokeCorrection() {
  withTempDir('mdko-smoke-correction-', (projectRoot) => {
    runCli(['init'], projectRoot);
    runCli(['start', '--mode', 'feature', 'Correction smoke workflow'], projectRoot);

    const runFolder = getSingleRunFolder(projectRoot);
    const artifactDir = path.join(runFolder, 'artifacts');
    fs.mkdirSync(artifactDir, { recursive: true });

    // No judge report: status should not show Judge correction section
    const statusBefore = runCli(['status'], projectRoot);
    if (statusBefore.includes('Judge correction:')) {
      throw new Error('status should not show Judge correction when no judge report exists');
    }

    // PASS verdict: status should show PASS
    fs.writeFileSync(path.join(artifactDir, 'judge-report.txt'), 'Verdict: PASS\n', 'utf8');
    const statusPass = runCli(['status'], projectRoot);
    assertIncludes(statusPass, 'Judge correction: PASS', 'status PASS correction');

    // IMPLEMENTATION_MISMATCH: status shows correction required + routed stage
    fs.writeFileSync(
      path.join(artifactDir, 'judge-report.txt'),
      'Verdict: IMPLEMENTATION_MISMATCH\n',
      'utf8',
    );
    const statusMismatch = runCli(['status'], projectRoot);
    assertIncludes(statusMismatch, 'Judge correction:', 'status correction required');
    assertIncludes(statusMismatch, 'Routed stage: implementation', 'status routed stage');

    // prompt should print correction stage prompt
    const correctionPrompt = runCli(['prompt'], projectRoot);
    assertIncludes(correctionPrompt, 'Stage: implementation (correction)', 'correction prompt stage');
    assertIncludes(correctionPrompt, 'IMPLEMENTATION_MISMATCH', 'correction prompt verdict');
    assertIncludes(correctionPrompt, 'judge-report.txt', 'correction prompt judge input');

    // BLOCKED verdict: prompt prints blocked message
    fs.writeFileSync(
      path.join(artifactDir, 'judge-report.txt'),
      'Verdict: BLOCKED\n',
      'utf8',
    );
    let blockedOutput;
    try {
      blockedOutput = runCli(['prompt'], projectRoot);
    } catch (err) {
      blockedOutput = err.stdout ?? '';
    }
    assertIncludes(blockedOutput, 'blocked', 'blocked prompt output');

    // check --trace with trace issues should suggest correction stage
    fs.writeFileSync(
      path.join(artifactDir, 'behavior-model.txt'),
      'BEH-001: first behavior\nBEH-001 -> PSE-999',
      'utf8',
    );
    let traceOutput;
    try {
      traceOutput = runCli(['check', '--trace'], projectRoot);
    } catch (err) {
      traceOutput = err.stdout ?? '';
    }
    assertIncludes(traceOutput, 'TRACE_MISSING_LINK_TARGET', 'trace check missing target');
    assertIncludes(traceOutput, 'Suggested correction stage:', 'trace correction suggestion');
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

if (mode === 'all' || mode === 'check') {
  smokeCheck();
}

if (mode === 'all' || mode === 'trace') {
  smokeTrace();
}

if (mode === 'all' || mode === 'correction') {
  smokeCorrection();
}
