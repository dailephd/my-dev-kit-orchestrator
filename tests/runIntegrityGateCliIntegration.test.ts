// Cross-command integration tests for the canonical RunIntegrityGate
// (v1.2.3 Batch 2): proves prompt, lifecycle/stage-detection, mark, status,
// and check all agree on the same blocked-vs-ready decision for the same
// run, rather than each command deriving its own answer.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun, RunMetadata, loadRun } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { runCli } from './cliTestHelpers';
import { getArtifactStatePath } from '../src/artifactLifecycle';
import { getNextStageWithRunIntegrity } from '../src/stageDetector';
import { readArtifactStateFile } from '../src/artifactLifecycle';
import { evaluateRunIntegrityGate } from '../src/runIntegrityGate';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-run-integrity-cli-'));
}

function makeFeatureRun(tmp: string): RunMetadata {
  initWorkspace(tmp);
  return createRun({ request: 'gate cli integration', mode: 'feature', projectRoot: tmp });
}

// Writes every stage artifact strictly before `stageName` so prompt.ts's
// "missing prior artifacts" guard never short-circuits before readiness is
// even evaluated -- these tests are about readiness gating, not about that
// unrelated, pre-existing guard.
function writePriorArtifacts(meta: RunMetadata, stageName: string) {
  const idx = meta.stages.findIndex((s) => s.name === stageName);
  for (const s of meta.stages.slice(0, idx)) {
    fs.writeFileSync(path.join(meta.runFolder, s.artifactFile), 'done', 'utf8');
  }
}

describe('RunIntegrityGate CLI integration: prompt', () => {
  it('renders a normal implementation prompt when context is ready', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writePriorArtifacts(meta, 'implementation');
      const { output } = runCli(['prompt', 'implementation', '--root', tmp]);
      expect(output).not.toContain('BLOCKED on repository context');
      expect(output.toLowerCase()).toContain('implementation-report.txt');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('renders a refresh-only implementation prompt when context is refresh-required', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writePriorArtifacts(meta, 'implementation');
      const { output } = runCli(['prompt', 'implementation', '--root', tmp]);
      expect(output).toContain('BLOCKED on repository context');
      expect(output).toContain('do not claim this stage is complete');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('renders a normal test-implementation prompt when context is ready', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writePriorArtifacts(meta, 'test-implementation');
      const { output } = runCli(['prompt', 'test-implementation', '--root', tmp]);
      expect(output).not.toContain('BLOCKED on repository context');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('renders a refresh-only test-implementation prompt when context is refresh-required', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writePriorArtifacts(meta, 'test-implementation');
      const { output } = runCli(['prompt', 'test-implementation', '--root', tmp]);
      expect(output).toContain('BLOCKED on repository context');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('explicit stage selection does not bypass readiness for implementation', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writePriorArtifacts(meta, 'implementation');
      const explicit = runCli(['prompt', 'implementation', '--root', tmp]);
      const auto = runCli(['prompt', '--root', tmp]);
      expect(explicit.output).toContain('BLOCKED on repository context');
      expect(auto.output).toContain('BLOCKED on repository context');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('explicit stage selection does not bypass readiness for test-implementation', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writePriorArtifacts(meta, 'test-implementation');
      // Block only test context after the ready population.
      for (const rel of ['artifacts/test-context-packet.txt', 'reports/test-context-retrieval-report.txt']) {
        const p = path.join(meta.runFolder, rel);
        fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('Status: populated', 'Status: template'), 'utf8');
      }
      const { output } = runCli(['prompt', 'test-implementation', '--root', tmp]);
      expect(output).toContain('BLOCKED on repository context');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('prompt rendering is read-only', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writePriorArtifacts(meta, 'implementation');
      const runJsonPath = path.join(meta.runFolder, 'run.json');
      const before = fs.readFileSync(runJsonPath, 'utf8');
      const statePathBefore = fs.existsSync(getArtifactStatePath(meta.runFolder));
      runCli(['prompt', 'implementation', '--root', tmp]);
      runCli(['prompt', '--root', tmp]);
      expect(fs.readFileSync(runJsonPath, 'utf8')).toBe(before);
      expect(fs.existsSync(getArtifactStatePath(meta.runFolder))).toBe(statePathBefore);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('greenfield prompts remain unaffected by repository-context gating', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'a new app', mode: 'greenfield', projectRoot: tmp });
      const { output } = runCli(['prompt', '--root', tmp]);
      expect(output).not.toContain('BLOCKED on repository context');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('RunIntegrityGate CLI integration: lifecycle / stage detection', () => {
  it('blocked implementation artifact presence does not complete the stage', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      for (const s of meta.stages.slice(0, meta.stages.findIndex((st) => st.name === 'implementation'))) {
        fs.writeFileSync(path.join(meta.runFolder, s.artifactFile), 'done', 'utf8');
      }
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/implementation-report.txt'), 'Status: complete\n', 'utf8');
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      const stateFile = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithRunIntegrity(meta, stateFile, gate);
      expect(next?.name).toBe('implementation');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('blocked test-implementation artifact presence does not complete the stage', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      for (const rel of ['artifacts/test-context-packet.txt', 'reports/test-context-retrieval-report.txt']) {
        const p = path.join(meta.runFolder, rel);
        fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('Status: populated', 'Status: template'), 'utf8');
      }
      for (const s of meta.stages.slice(0, meta.stages.findIndex((st) => st.name === 'implementation') + 1)) {
        fs.writeFileSync(path.join(meta.runFolder, s.artifactFile), 'done', 'utf8');
      }
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/test-implementation-report.txt'), 'Status: complete\n', 'utf8');
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      const stateFile = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithRunIntegrity(meta, stateFile, gate);
      expect(next?.name).toBe('test-implementation');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('manual complete metadata does not override refresh-required', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writePriorArtifacts(meta, 'implementation');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/implementation-report.txt'), 'done', 'utf8');
      runCli(['mark', 'implementation-report.txt', '--state', 'complete', '--root', tmp]);
      // Rejected mark (asserted separately below) must leave the artifact
      // unresolved from the canonical gate's perspective.
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      const stateFile = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithRunIntegrity(meta, stateFile, gate);
      expect(next?.name).toBe('implementation');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('ready stages preserve existing completion behavior', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      for (const s of meta.stages.slice(0, meta.stages.findIndex((st) => st.name === 'implementation'))) {
        fs.writeFileSync(path.join(meta.runFolder, s.artifactFile), 'done', 'utf8');
      }
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/implementation-report.txt'), 'done', 'utf8');
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      const stateFile = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithRunIntegrity(meta, stateFile, gate);
      expect(next?.name).toBe('test-implementation');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('unrelated historical runs (no repository-context requirement) preserve file-existence compatibility', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'a new app', mode: 'greenfield', projectRoot: tmp });
      fs.writeFileSync(path.join(meta.runFolder, meta.stages[0].artifactFile), 'done', 'utf8');
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      const stateFile = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithRunIntegrity(meta, stateFile, gate);
      expect(next?.name).toBe(meta.stages[1].name);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('RunIntegrityGate CLI integration: mark', () => {
  it('rejects mark complete for blocked implementation', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/implementation-report.txt'), 'done', 'utf8');
      const { exitCode, output } = runCli(['mark', 'implementation-report.txt', '--state', 'complete', '--root', tmp]);
      expect(exitCode).toBe(1);
      expect(output).toContain('refresh-required');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects mark complete for blocked test-implementation', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      for (const rel of ['artifacts/test-context-packet.txt', 'reports/test-context-retrieval-report.txt']) {
        const p = path.join(meta.runFolder, rel);
        fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('Status: populated', 'Status: template'), 'utf8');
      }
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/test-implementation-report.txt'), 'done', 'utf8');
      const { exitCode } = runCli(['mark', 'test-implementation-report.txt', '--state', 'complete', '--root', tmp]);
      expect(exitCode).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejected mark does not mutate artifact-state.json', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/implementation-report.txt'), 'done', 'utf8');
      const statePath = getArtifactStatePath(meta.runFolder);
      expect(fs.existsSync(statePath)).toBe(false);
      runCli(['mark', 'implementation-report.txt', '--state', 'complete', '--root', tmp]);
      expect(fs.existsSync(statePath)).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('normal mark complete still works when context is ready', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/implementation-report.txt'), 'done', 'utf8');
      const { exitCode } = runCli(['mark', 'implementation-report.txt', '--state', 'complete', '--root', tmp]);
      expect(exitCode).toBeUndefined();
      const statePath = getArtifactStatePath(meta.runFolder);
      expect(fs.existsSync(statePath)).toBe(true);
      const stateFile = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      expect(stateFile.artifacts['artifacts/implementation-report.txt'].state).toBe('complete');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('unrelated (non-context-sensitive) stages retain existing mark behavior even while implementation is blocked', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/request-brief.txt'), 'done', 'utf8');
      const { exitCode } = runCli(['mark', 'request-brief.txt', '--state', 'complete', '--root', tmp]);
      expect(exitCode).toBeUndefined();
      const statePath = getArtifactStatePath(meta.runFolder);
      const stateFile = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      expect(stateFile.artifacts['artifacts/request-brief.txt'].state).toBe('complete');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('RunIntegrityGate CLI integration: status and check agreement', () => {
  it('status, check, prompt, and mark agree on the same blocked run', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      for (const s of meta.stages.slice(0, meta.stages.findIndex((st) => st.name === 'implementation'))) {
        fs.writeFileSync(path.join(meta.runFolder, s.artifactFile), 'done', 'utf8');
      }
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/implementation-report.txt'), 'Status: complete\n', 'utf8');

      const status = runCli(['status', '--root', tmp]);
      expect(status.output).toContain('Current / next stage:\n  implementation');
      expect(status.output).toContain('Repository context readiness: refresh-required');

      const check = runCli(['check', '--all', '--root', tmp]);
      expect(check.exitCode).toBe(1);

      const promptResult = runCli(['prompt', '--root', tmp]);
      expect(promptResult.output).toContain('BLOCKED on repository context');

      const mark = runCli(['mark', 'implementation-report.txt', '--state', 'complete', '--root', tmp]);
      expect(mark.exitCode).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('status does not report the blocked artifact as complete', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      for (const s of meta.stages.slice(0, meta.stages.findIndex((st) => st.name === 'implementation'))) {
        fs.writeFileSync(path.join(meta.runFolder, s.artifactFile), 'done', 'utf8');
      }
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/implementation-report.txt'), 'Status: complete\n', 'utf8');
      const { output } = runCli(['status', '--root', tmp]);
      expect(output).toContain('[blocked   ] artifacts/implementation-report.txt');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('check fails even when the blocked artifact exists and check --all fails consistently', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/implementation-report.txt'), 'Status: complete\n', 'utf8');
      const checkArtifacts = runCli(['check', '--artifacts', '--root', tmp]);
      const checkAll = runCli(['check', '--all', '--root', tmp]);
      expect(checkArtifacts.exitCode).toBe(1);
      expect(checkAll.exitCode).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a ready run remains passing on check --all for repository-context readiness specifically', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      // Structural artifact-contract issues (missing implementation-report
      // etc.) are expected to still fail for an otherwise-empty run; this
      // test only proves repository-context readiness itself is not the
      // failure source when it is ready.
      const check = runCli(['check', '--all', '--root', tmp]);
      expect(check.output).not.toContain('not required for this mode');
      expect(check.output).toContain('[pass] implementation context: ready');
      expect(check.output).toContain('[pass] test context: ready');
      expect(check.output).toContain('Repository context: pass');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a no-context-required run (greenfield) remains compatible', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'a new app', mode: 'greenfield', projectRoot: tmp });
      const status = runCli(['status', '--root', tmp]);
      expect(status.output).toContain('Repository context: not required');
      const check = runCli(['check', '--all', '--root', tmp]);
      expect(check.output).toContain('not required for this mode');
      void loadRun(meta.runFolder);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
