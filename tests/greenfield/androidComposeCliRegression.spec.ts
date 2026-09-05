// CLI-level regression coverage for Android Compose (v1.2.0). Confirms the
// user-facing prompt/status/list surface correctly represents android-compose
// as a supported profile, per artifacts/v1.2.0-android-compose-profile-contract.txt.
//
// Important architectural fact this file's assertions depend on: `start`
// only stores the request as raw text (src/commands/start.ts never parses it
// into a brief or resolves a profile), and `prompt` renders purely
// mode+stage-keyed static template text (src/promptGenerator.ts,
// src/greenfield/scaffold/renderScaffoldPrompt.ts) -- it does not read file
// content or dynamically select a profile. So "Android Compose request"
// wording in the `start` argument does not change the CLI's *own* output;
// what changes is that the *static* starter-profile/scaffold-plan/scaffold-
// implementation stage prompts must correctly describe android-compose as
// supported (not forbidden), for every run, regardless of the request text.
// This is exactly what Batch 4 found stale and fixed (see
// reports/v1.2.0-batch-4-cli-regression-report.txt).

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createProgram } from '../../src/program';
import { initWorkspace } from '../../src/workspace';
import { getMostRecentRun } from '../../src/run';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-android-cli-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runCliCaptured(args: string[]): { output: string; exitCode: number | undefined } {
  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  const origWrite = process.stdout.write.bind(process.stdout);
  const origExit = process.exit;
  let exitCode: number | undefined;
  console.log = (msg: string) => lines.push(msg);
  console.error = (msg: string) => lines.push(msg);
  process.stdout.write = ((chunk: string) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.exit = ((code?: number) => {
    exitCode = code;
    throw new Error('mdko-test-exit');
  }) as never;

  try {
    createProgram().parse(['node', 'cli', ...args]);
  } catch (e) {
    if ((e as Error).message !== 'mdko-test-exit') throw e;
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.stdout.write = origWrite;
    process.exit = origExit;
  }

  return { output: lines.join('\n'), exitCode };
}

// Writes trivial placeholder fixture files (existence only -- no greenfield
// prompt-rendering function in this codebase reads prior-artifact *content*,
// only src/stageDetector.ts's getMissingPriorArtifacts() checks existence)
// so that `prompt <stage>` for a later stage does not get rejected by the
// "missing prior artifacts" gate.
function fillPriorArtifacts(tmp: string, upToStageExclusive: string): void {
  const { output } = runCliCaptured(['status', '--root', tmp]);
  void output;
  const meta = getMostRecentRun(path.resolve(tmp))!;
  for (const stage of meta.stages) {
    if (stage.name === upToStageExclusive) break;
    const full = path.join(meta.runFolder, stage.artifactFile);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `Artifact: placeholder\nStatus: complete\n`, 'utf8');
  }
}

const ANDROID_COMPOSE_REQUEST = 'Create an Android Compose habit tracker app';

describe('Android Compose CLI regression (v1.2.0)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTempDir();
    initWorkspace(tmp);
  });

  afterEach(() => {
    cleanup(tmp);
  });

  it('init (initWorkspace) succeeds', () => {
    expect(fs.existsSync(path.join(tmp, '.my-dev-kit-orchestrator'))).toBe(true);
  });

  it('start --mode greenfield succeeds for an explicit Android Compose request', () => {
    const { output, exitCode } = runCliCaptured([
      'start',
      '--mode',
      'greenfield',
      '--root',
      tmp,
      ANDROID_COMPOSE_REQUEST,
    ]);
    expect(exitCode).toBeUndefined();
    expect(output).toContain('Created workflow run:');
    expect(output).toContain('greenfield');
  });

  it('does not create a mobile/android-compose mode; the run stays mode: greenfield', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, ANDROID_COMPOSE_REQUEST]);
    const meta = getMostRecentRun(path.resolve(tmp))!;
    expect(meta.mode).toBe('greenfield');
    expect(meta.mode).not.toBe('mobile');
    expect(meta.mode).not.toBe('android-compose');
  });

  it('prompt succeeds for the most recent Android Compose greenfield run', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, ANDROID_COMPOSE_REQUEST]);
    const { output, exitCode } = runCliCaptured(['prompt', '--root', tmp]);
    expect(exitCode).toBeUndefined();
    expect(output).toContain('Stage: idea-brief');
    expect(output).toContain('Workflow mode: greenfield');
  });

  it('status succeeds for the most recent Android Compose greenfield run', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, ANDROID_COMPOSE_REQUEST]);
    const { output, exitCode } = runCliCaptured(['status', '--root', tmp]);
    expect(exitCode).toBeUndefined();
    expect(output).toContain('greenfield');
    expect(output).toContain('Present artifacts: 0/13');
  });

  it('list succeeds and includes the Android Compose greenfield run', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, ANDROID_COMPOSE_REQUEST]);
    const { output, exitCode } = runCliCaptured(['list', '--root', tmp]);
    expect(exitCode).toBeUndefined();
    expect(output).toContain('Mode:         greenfield');
    expect(output).toContain('Total: 1 run(s)');
  });

  it('starter-profile stage prompt delegates supported-profile validity to the canonical registry and exposes android-compose as a listed profile ID', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, ANDROID_COMPOSE_REQUEST]);
    fillPriorArtifacts(tmp, 'starter-profile');
    const { output, exitCode } = runCliCaptured(['prompt', 'starter-profile', '--root', tmp]);
    expect(exitCode).toBeUndefined();
    expect(output).toMatch(/canonical SUPPORTED_PROFILES registry/);
    // v1.4.1: the starter-profile prompt now directly lists the supported
    // profile IDs (superseding the prior no-enumeration requirement), so
    // android-compose must appear among them.
    expect(output).toMatch(/Supported starter profile IDs:.*android-compose/);
    // Must not blanket-forbid Android/mobile profiles now that one is supported.
    expect(output).not.toMatch(/do not use Android\/mobile profiles/);
  });

  it('scaffold-plan stage prompt gives Gradle/Android-neutral guidance, not npm-specific commands', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, ANDROID_COMPOSE_REQUEST]);
    fillPriorArtifacts(tmp, 'scaffold-plan');
    const { output, exitCode } = runCliCaptured(['prompt', 'scaffold-plan', '--root', tmp]);
    expect(exitCode).toBeUndefined();
    expect(output).toContain('bootstrap-bundle.json');
    expect(output).toContain('setup commands');
    expect(output).toContain('validation commands');
    // The stop condition must reference "the profile selected in the bootstrap
    // bundle", not blanket-forbid Android/mobile (stale pre-v1.2.0 wording).
    expect(output).not.toMatch(/do not add Android\/mobile file trees/);
    expect(output).not.toMatch(/npm install|npm run build/);
  });

  it('scaffold-implementation stage prompt does not blanket-forbid Android/mobile behavior', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, ANDROID_COMPOSE_REQUEST]);
    fillPriorArtifacts(tmp, 'scaffold-implementation');
    const { output, exitCode } = runCliCaptured(['prompt', 'scaffold-implementation', '--root', tmp]);
    expect(exitCode).toBeUndefined();
    expect(output).not.toMatch(/do not add Android\/mobile behavior/);
  });

  it('project-docs stage prompt allows Android/mobile claims conditionally, not unconditionally', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, ANDROID_COMPOSE_REQUEST]);
    fillPriorArtifacts(tmp, 'project-docs');
    const { output, exitCode } = runCliCaptured(['prompt', 'project-docs', '--root', tmp]);
    expect(exitCode).toBeUndefined();
    expect(output).toContain(
      'do not claim Android/mobile support in generated documentation unless the selected starter profile ID is android-compose',
    );
  });

  it('no prompt output claims Gradle was run or that the Android SDK is available', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, ANDROID_COMPOSE_REQUEST]);
    for (const stage of ['idea-brief', 'product-boundary', 'stack-decision', 'starter-profile', 'bootstrap-bundle', 'project-docs', 'scaffold-plan', 'scaffold-implementation']) {
      fillPriorArtifacts(tmp, stage);
      const { output } = runCliCaptured(['prompt', stage, '--root', tmp]);
      const lower = output.toLowerCase();
      expect(lower).not.toMatch(/gradle (ran|succeeded|passed|executed)/);
      expect(lower).not.toMatch(/android sdk (is installed|exists|available)/);
      expect(lower).not.toMatch(/play store|release[- ]ready/);
    }
  });
});

describe('Android Compose CLI regression does not break TypeScript CLI / Next.js greenfield requests', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTempDir();
    initWorkspace(tmp);
  });

  afterEach(() => {
    cleanup(tmp);
  });

  it.each([
    ['Create a sample TypeScript CLI app'],
    ['Create a Next.js web dashboard'],
  ])('%s still starts and prompts successfully', (request) => {
    const startRes = runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, request]);
    expect(startRes.output).toContain('Created workflow run:');
    const promptRes = runCliCaptured(['prompt', '--root', tmp]);
    expect(promptRes.exitCode).toBeUndefined();
    expect(promptRes.output).toContain('Workflow mode: greenfield');
  });
});
