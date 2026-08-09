// check/export regression coverage for Android Compose (v1.2.0).
//
// Architectural fact established while writing this file: src/artifactChecker.ts,
// src/promptChecker.ts, and src/contractChecker.ts contain zero Android/mobile-
// specific logic (grep-confirmed) -- the CLI's check pipeline is fully
// generic content-shape checking, not claim-detection regex matching. The
// profile-aware Android/Jetpack claim check lives entirely in
// src/greenfield/bootstrap/validateBootstrapDocs.ts (Batch 3), which is a
// standalone library function a coding agent is instructed to call during
// the project-docs stage; it is not wired into the CLI `check` command.
// These tests therefore prove the CLI check pipeline does not choke on
// legitimate Android/Kotlin/Gradle fixture content (because it has no
// content-claim regex to choke on it with), and that export's one real
// content-passthrough channel (verification-report.txt, read verbatim by
// buildExportText's readVerificationEvidence) correctly carries Android
// Compose evidence text without ever asserting it as fact itself.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createProgram } from '../../src/program';
import { createRun, RunMetadata } from '../../src/run';
import { initWorkspace } from '../../src/workspace';
import { checkRunArtifactContracts } from '../../src/contractChecker';
import { buildExportText } from '../../src/commands/export';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-android-check-export-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runCliCaptured(args: string[]): { output: string; exitCode: number | undefined } {
  const lines: string[] = [];
  const errLines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  const origWrite = process.stdout.write.bind(process.stdout);
  const origExit = process.exit;
  let exitCode: number | undefined;
  console.log = (msg: string) => lines.push(msg);
  console.error = (msg: string) => errLines.push(msg);
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

  return { output: [...lines, ...errLines].join('\n'), exitCode };
}

const ANDROID_COMPOSE_REQUEST = 'Create an Android Compose habit tracker app';

function makeAndroidComposeRun(tmp: string): RunMetadata {
  initWorkspace(tmp);
  return createRun({ request: ANDROID_COMPOSE_REQUEST, mode: 'greenfield', projectRoot: tmp });
}

// ─── check --artifacts on a fresh Android Compose run ──────────────────────────

describe('check --artifacts - fresh Android Compose greenfield run', () => {
  it('resolves 13 stage contracts, same as any other greenfield profile request', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeAndroidComposeRun(tmp);
      const contractResult = checkRunArtifactContracts(meta, {});
      expect(contractResult.modeValid).toBe(true);
      expect(contractResult.results.length).toBe(13);
    } finally {
      cleanup(tmp);
    }
  });

  it('CLI check --artifacts fails with the expected nonzero exit for a fresh run (no artifacts yet)', () => {
    const tmp = makeTempDir();
    try {
      makeAndroidComposeRun(tmp);
      const { output, exitCode } = runCliCaptured(['check', '--artifacts', '--root', tmp]);
      expect(output).toContain('Artifact contract check for run:');
      expect(exitCode).toBe(1);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── check accepts legitimate Android Compose terms ────────────────────────────

describe('check - accepts legitimate Android Compose fixture content', () => {
  it('accepts a present idea-brief artifact containing Android/Kotlin/Compose/Gradle terms', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeAndroidComposeRun(tmp);
      fs.writeFileSync(
        path.join(meta.runFolder, 'artifacts/idea-brief.json'),
        JSON.stringify({
          rawIdea: 'An Android app built with Kotlin, Jetpack Compose, and Gradle for tracking habits.',
          constraints: ['must work offline'],
          nonGoals: ['no iOS or React Native support'],
          preferredStack: ['Kotlin', 'Jetpack Compose', 'Gradle'],
          preferredProfile: 'android-compose',
          documentationPreferences: [],
          testingExpectations: [],
          unresolved: [],
          status: 'complete',
        }),
        'utf8',
      );
      const { output } = runCliCaptured(['check', '--artifact', 'idea-brief', '--root', tmp]);
      expect(output).toContain('[pass]');
    } finally {
      cleanup(tmp);
    }
  });

  it('accepts a present project-docs-report artifact mentioning AndroidManifest/MainActivity/Gradle', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeAndroidComposeRun(tmp);
      fs.writeFileSync(
        path.join(meta.runFolder, 'artifacts/project-docs-report.txt'),
        [
          'Artifact: ProjectDocsReport',
          'Workflow mode: greenfield',
          'Doc targets: product-boundary, stack-decision, starter-profile-summary, development-workflow, testing-expectations, validation-expectations, scaffold-planning-notes, unresolved-decisions, non-goals',
          'Component doc targets: (none)',
          'Unresolved decisions: (none)',
          'Validation result: valid (Android/Jetpack terms permitted for the selected android-compose profile; AndroidManifest.xml, MainActivity.kt, and Gradle validation commands are expected content, not violations)',
          'Status: complete',
        ].join('\n'),
        'utf8',
      );
      const { output } = runCliCaptured(['check', '--artifact', 'project-docs', '--root', tmp]);
      expect(output).toContain('[pass]');
    } finally {
      cleanup(tmp);
    }
  });

  it('the contract summary itself still contains no Android/mobile artifact requirement (unchanged from v1.1.0 baseline)', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeAndroidComposeRun(tmp);
      const contractResult = checkRunArtifactContracts(meta, {});
      const serialized = JSON.stringify(contractResult).toLowerCase();
      expect(serialized).not.toMatch(/react-native|flutter/);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── check --all ────────────────────────────────────────────────────────────────

describe('check --all - Android Compose greenfield', () => {
  it('runs all v1 checks for a fresh Android Compose run without throwing', () => {
    const tmp = makeTempDir();
    try {
      makeAndroidComposeRun(tmp);
      const { output } = runCliCaptured(['check', '--all', '--root', tmp]);
      expect(output).toContain('Full check for run:');
      expect(output).toContain('=== Summary ===');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── export ─────────────────────────────────────────────────────────────────────

describe('export - Android Compose greenfield handoff', () => {
  it('includes greenfield mode and all 13 stage artifact expectations, same as any profile', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeAndroidComposeRun(tmp);
      const text = buildExportText(meta);
      expect(text).toContain('Mode:         greenfield');
      const checklistLines = text.split('\n').filter((l) => l.includes('(') && l.trim().startsWith('['));
      expect(checklistLines.length).toBe(13);
    } finally {
      cleanup(tmp);
    }
  });

  it('includes the Android Compose request text verbatim (the one place export carries request-specific context)', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeAndroidComposeRun(tmp);
      const text = buildExportText(meta);
      expect(text).toContain(ANDROID_COMPOSE_REQUEST);
    } finally {
      cleanup(tmp);
    }
  });

  it('carries verification-report.txt Gradle evidence verbatim without asserting it beyond what the report says', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeAndroidComposeRun(tmp);
      fs.writeFileSync(
        path.join(meta.runFolder, 'artifacts/verification-report.txt'),
        [
          'Artifact: VerificationReport',
          'Workflow mode: greenfield',
          'Commands run: ./gradlew build (not run in this environment; no Android SDK available)',
          'Skipped: ./gradlew testDebugUnitTest, ./gradlew connectedAndroidTest (Android SDK not installed)',
          'Status: incomplete',
        ].join('\n'),
        'utf8',
      );
      const text = buildExportText(meta);
      expect(text).toContain('./gradlew build');
      expect(text).toContain('not run in this environment');
      // The export mechanism must not itself assert Gradle succeeded/ran --
      // it only echoes whatever the verification report actually says.
      expect(text.toLowerCase()).not.toMatch(/gradle (succeeded|passed)/);
    } finally {
      cleanup(tmp);
    }
  });

  it('does not claim Play Store readiness or Android SDK availability anywhere in a fresh export', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeAndroidComposeRun(tmp);
      const text = buildExportText(meta).toLowerCase();
      expect(text).not.toMatch(/play store|release[- ]ready|android sdk (is installed|available)/);
    } finally {
      cleanup(tmp);
    }
  });

  it('CLI export command works for the Android Compose run and prints it to stdout', () => {
    const tmp = makeTempDir();
    try {
      makeAndroidComposeRun(tmp);
      const { output } = runCliCaptured(['export', '--root', tmp]);
      expect(output).toContain('Mode:         greenfield');
      expect(output).toContain(ANDROID_COMPOSE_REQUEST);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── export path safety (regression, same mechanism regardless of profile) ────

describe('export path safety - Android Compose run', () => {
  it('safe export path (--out inside an owned temp dir) succeeds and writes only that file', () => {
    const tmp = makeTempDir();
    try {
      makeAndroidComposeRun(tmp);
      const outFile = path.join(tmp, 'android-compose-export.txt');
      const before = fs.readdirSync(tmp);
      const { output, exitCode } = runCliCaptured(['export', '--root', tmp, '--out', outFile]);
      expect(exitCode).toBeUndefined();
      expect(output).toContain(`Export written to: ${outFile}`);
      expect(fs.existsSync(outFile)).toBe(true);
      const after = fs.readdirSync(tmp);
      // Exactly one new entry (the export file) was created in the owned temp dir.
      expect(after.length).toBe(before.length + 1);
    } finally {
      cleanup(tmp);
    }
  });

  it('unsafe export path (.. traversal) is rejected and writes nothing outside the temp dir', () => {
    const tmp = makeTempDir();
    try {
      makeAndroidComposeRun(tmp);
      const unsafeRelative = path.join('..', 'mdko-unsafe-android-export.txt');
      const resolvedUnsafe = path.resolve(tmp, unsafeRelative);
      const { output, exitCode } = runCliCaptured(['export', '--root', tmp, '--out', unsafeRelative]);
      expect(exitCode).toBe(1);
      expect(output).toMatch(/output path rejected/);
      expect(output).toMatch(/path traversal/);
      expect(fs.existsSync(resolvedUnsafe)).toBe(false);
    } finally {
      cleanup(tmp);
      // Defensive cleanup in case the (expected-to-be-rejected) path was ever written.
      const resolvedUnsafe = path.resolve(tmp, '..', 'mdko-unsafe-android-export.txt');
      if (fs.existsSync(resolvedUnsafe)) fs.rmSync(resolvedUnsafe, { force: true });
    }
  });
});
