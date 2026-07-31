// Frozen failed-run focused replay (v1.2.3 Batch 2 / section 8.6).
//
// Replays the frozen my-dev-kit v1.11.0 Batch 1 orchestrator run identified
// by the context-readiness-fix-investigation (a real run where the coding
// agent wrote normal implementation/test/verification/judge/final artifacts
// despite a refresh-only prompt, because no invariant stopped it) through
// the canonical RunIntegrityGate. Proves the frozen run still cannot
// progress normally now that prompt/lifecycle/mark/status/check all consult
// one canonical gate.
//
// The original frozen evidence is never read from or written to directly --
// this test copies it into a disposable temp directory first. Only the
// copy's "Source context capsule:"/"Source retrieval audit:" declarations
// and run.json's runFolder are repointed at the copy's own location; every
// other byte (including the real raw capsule/audit JSON content that
// produced the original "insufficient"/truncated verdicts) is preserved
// exactly.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RunMetadata } from '../src/run';
import { generateStagePrompt } from '../src/promptGenerator';
import { evaluateRunIntegrityGate, isContextBlockedArtifactFile } from '../src/runIntegrityGate';
import { getNextStageWithRunIntegrity } from '../src/stageDetector';
import { readArtifactStateFile } from '../src/artifactLifecycle';

const FROZEN_RUN_SOURCE = 'Z:/Users/newuser/Projects/context-readiness-fix-investigation/runtime-evidence/failed-run';
const FROZEN_BATCH_CONTEXT_SOURCE = 'Z:/Users/newuser/Projects/context-readiness-fix-investigation/runtime-evidence/batch-context';

const FIXTURE_AVAILABLE = fs.existsSync(FROZEN_RUN_SOURCE) && fs.existsSync(FROZEN_BATCH_CONTEXT_SOURCE);

function copyDirRecursive(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function repointDeclaredRawEvidence(runFolder: string, capsuleDir: string, relPath: string, kind: 'implementation' | 'test') {
  const p = path.join(runFolder, relPath);
  let text = fs.readFileSync(p, 'utf8');
  text = text.replace(/^Source context capsule: .*$/m, `Source context capsule: ${path.join(capsuleDir, `${kind}-capsule.json`)}`);
  text = text.replace(/^Source retrieval audit: .*$/m, `Source retrieval audit: ${path.join(capsuleDir, `${kind}-audit.json`)}`);
  fs.writeFileSync(p, text, 'utf8');
}

// Builds a disposable, self-contained copy of the frozen run: the run
// folder itself plus the real byte-exact raw capsule/audit JSON files the
// packet/report declare, repointed to the copy's own location.
function makeFrozenRunReplayFixture(): { tmp: string; meta: RunMetadata } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-frozen-replay-'));
  const runFolder = path.join(tmp, 'run');
  copyDirRecursive(FROZEN_RUN_SOURCE, runFolder);

  const capsuleDir = path.join(tmp, 'raw-evidence');
  fs.mkdirSync(capsuleDir, { recursive: true });
  for (const name of ['implementation-capsule.json', 'implementation-audit.json', 'test-capsule.json', 'test-audit.json']) {
    fs.copyFileSync(path.join(FROZEN_BATCH_CONTEXT_SOURCE, name), path.join(capsuleDir, name));
  }

  repointDeclaredRawEvidence(runFolder, capsuleDir, 'artifacts/implementation-context-packet.txt', 'implementation');
  repointDeclaredRawEvidence(runFolder, capsuleDir, 'reports/implementation-context-retrieval-report.txt', 'implementation');
  repointDeclaredRawEvidence(runFolder, capsuleDir, 'artifacts/test-context-packet.txt', 'test');
  repointDeclaredRawEvidence(runFolder, capsuleDir, 'reports/test-context-retrieval-report.txt', 'test');

  const runJsonPath = path.join(runFolder, 'run.json');
  const rawMeta = JSON.parse(fs.readFileSync(runJsonPath, 'utf8')) as RunMetadata;
  rawMeta.runFolder = runFolder;
  fs.writeFileSync(runJsonPath, JSON.stringify(rawMeta, null, 2), 'utf8');

  return { tmp, meta: rawMeta };
}

const maybeDescribe = FIXTURE_AVAILABLE ? describe : describe.skip;

maybeDescribe('RunIntegrityGate: frozen failed-run replay (v1.11.0 Batch 1)', () => {
  it('implementation remains refresh-required', () => {
    const { tmp, meta } = makeFrozenRunReplayFixture();
    try {
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      expect(gate.blockedStageNames).toContain('implementation');
      expect(gate.implementationContext?.decision).toBe('refresh-required');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('test-implementation remains refresh-required', () => {
    const { tmp, meta } = makeFrozenRunReplayFixture();
    try {
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      expect(gate.blockedStageNames).toContain('test-implementation');
      expect(gate.testContext?.decision).toBe('refresh-required');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('the existing implementation/test/verification/judge/final artifacts do not make the run complete', () => {
    const { tmp, meta } = makeFrozenRunReplayFixture();
    try {
      // The frozen run has no artifact-state.json (legacy-compatible path):
      // lifecycle completion is inferred from file presence alone, which is
      // exactly the bypass this batch closes.
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

  it('explicit implementation stage prompt does not bypass the block', () => {
    const { tmp, meta } = makeFrozenRunReplayFixture();
    try {
      // Same function prompt.ts's explicit-stage path calls -- proves the
      // refresh-only prompt fires even though implementation-report.txt
      // already exists with "Status: complete" in the frozen artifact.
      const promptText = generateStagePrompt(meta, 'implementation');
      expect(promptText).toContain('BLOCKED on repository context');
      expect(promptText).toContain('do not claim this stage is complete');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('manual mark complete would be rejected for the blocked implementation artifact', () => {
    const { tmp, meta } = makeFrozenRunReplayFixture();
    try {
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      expect(isContextBlockedArtifactFile(gate, meta.stages, 'artifacts/implementation-report.txt')).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('status and check agree that the run is blocked', () => {
    const { tmp, meta } = makeFrozenRunReplayFixture();
    try {
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      expect(gate.contextReady).toBe(false);
      expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
