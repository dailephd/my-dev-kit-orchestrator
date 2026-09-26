// v1.6.0 completeness audit: strict-mode behavior of telemetry warnings, in isolation.
//
// The ordinary artifact-content checkers are stubbed for this file only (the
// same approach as semanticContinuityCommandSurface.test.ts): fixture artifacts
// are minimal, so their content/contract checks always fail and would mask the
// telemetry exit-code behavior under test. The telemetry reader, the gate, the
// judge integrity, context readiness, and the existing --strict owner are real.

import * as fs from 'fs';
import * as path from 'path';
import { getTelemetryRoot } from '../src/runTelemetry';
import { runCli } from './cliTestHelpers';
import { readyTelemetryRun, seedPending, setRunTelemetryVersion, withTmp } from './runTelemetryAuditHelpers';

jest.mock('../src/artifactChecker', () => ({
  ...jest.requireActual('../src/artifactChecker'),
  checkAllArtifacts: () => [],
}));
jest.mock('../src/promptChecker', () => ({
  ...jest.requireActual('../src/promptChecker'),
  checkAllPrompts: () => [],
}));
jest.mock('../src/contractChecker', () => ({
  ...jest.requireActual('../src/contractChecker'),
  checkRunArtifactContracts: () => ({ modeValid: true, modeIssues: [], results: [] }),
  checkStageGates: () => [],
}));
jest.mock('../src/traceChecker', () => ({
  ...jest.requireActual('../src/traceChecker'),
  checkAllTraces: () => [],
}));

const PATHS: Array<[string, string[]]> = [
  ['default', []],
  ['--all', ['--all']],
];

describe('telemetry warnings under the existing --strict owner', () => {
  it.each(PATHS)('a clean activated run passes both non-strict and strict (%s)', (_label, args) => {
    withTmp((tmp) => {
      readyTelemetryRun(tmp);
      const normal = runCli(['check', ...args, '--root', tmp]);
      expect(normal.output).toContain('[pass] telemetry records valid');
      expect(normal.exitCode).toBeUndefined();
      expect(runCli(['check', ...args, '--strict', '--root', tmp]).exitCode).toBeUndefined();
    });
  });

  it.each(PATHS)('a telemetry-only warning does not fail normally but is promoted by --strict (%s)', (_label, args) => {
    withTmp((tmp) => {
      const meta = readyTelemetryRun(tmp);
      seedPending(tmp, meta.runId); // valid structure, incomplete coverage -> warn
      const normal = runCli(['check', ...args, '--root', tmp]);
      expect(normal.output).toContain('[warn] INCOMPLETE_TELEMETRY_INVOCATION');
      expect(normal.output).not.toMatch(/\[fail\]/);
      expect(normal.exitCode).toBeUndefined(); // non-strict: not a failure
      expect(runCli(['check', ...args, '--strict', '--root', tmp]).exitCode).toBe(1); // existing strict promotion
    });
  });

  it('a malformed record behaves identically (canonical reader diagnostic, warn only)', () => {
    withTmp((tmp) => {
      const meta = readyTelemetryRun(tmp);
      const dir = path.join(getTelemetryRoot(tmp), meta.runId, 'invocations');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `inv-${'a'.repeat(32)}.json`), '{oops', 'utf8');
      expect(runCli(['check', '--root', tmp]).exitCode).toBeUndefined();
      expect(runCli(['check', '--strict', '--root', tmp]).exitCode).toBe(1);
    });
  });

  it('an unsupported telemetry version is a warning, promoted only by --strict', () => {
    withTmp((tmp) => {
      const meta = readyTelemetryRun(tmp);
      setRunTelemetryVersion(meta.runFolder, '9.9.9');
      expect(runCli(['check', '--root', tmp]).exitCode).toBeUndefined();
      expect(runCli(['check', '--strict', '--root', tmp]).exitCode).toBe(1);
    });
  });

  it('a legacy run adds no warning, so strict is unaffected', () => {
    withTmp((tmp) => {
      const meta = readyTelemetryRun(tmp);
      setRunTelemetryVersion(meta.runFolder, undefined);
      expect(runCli(['check', '--strict', '--root', tmp]).exitCode).toBeUndefined();
    });
  });

  it('strict promotion is owned by the existing check command; the telemetry surface has no strict logic', () => {
    const surface = fs.readFileSync(path.join(__dirname, '..', 'src', 'workflowEconomicsSurface.ts'), 'utf8');
    expect(surface).not.toMatch(/strict/i);
    expect(surface).not.toMatch(/process\.exit/);
  });
});
