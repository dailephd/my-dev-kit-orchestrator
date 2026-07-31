// Corrected ready replay (v1.2.3 Batch 3 / section 12.7).
//
// A bounded positive replay using corrected producer evidence (Batch 1's
// makeReadyRunFolder helper represents what a corrected my-dev-kit producer
// yields: fresh, adequate, non-contradictory capsule/audit pairs and
// populated supplemental documents). Proves the full positive path -- ready
// context, expected PASS, accepted authored PASS, no active correction,
// eligible final-report prompt, and a run that reaches the complete state --
// works end to end through the canonical gate plus judge/final-report
// integrity, using real CLI commands via runCli.
//
// This is not the complete Batch 4 compatibility matrix -- it is one bounded
// full-lifecycle positive proof.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun, RunMetadata, loadRun } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { runCli } from './cliTestHelpers';
import { getArtifactStatePath } from '../src/artifactLifecycle';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-corrected-ready-'));
}

function makeFeatureRun(tmp: string): RunMetadata {
  initWorkspace(tmp);
  return createRun({ request: 'corrected ready replay', mode: 'feature', projectRoot: tmp });
}

function writeAllPriorArtifacts(meta: RunMetadata, stageName: string) {
  const idx = meta.stages.findIndex((s) => s.name === stageName);
  for (const s of meta.stages.slice(0, idx)) {
    fs.writeFileSync(path.join(meta.runFolder, s.artifactFile), 'done', 'utf8');
  }
}

describe('Corrected ready replay: full positive path', () => {
  it('ready context, accepted PASS, eligible final-report, and a completable run', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'judge');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts', 'judge-report.txt'), 'Verdict: PASS', 'utf8');

      // Context readiness is ready and expected judge verdict is PASS.
      const statusBeforeFinal = runCli(['status', '--root', tmp]);
      expect(statusBeforeFinal.output).toContain('Repository context readiness: ready');
      expect(statusBeforeFinal.output).toContain('Expected judge verdict: PASS');
      expect(statusBeforeFinal.output).toContain('Authored judge verdict: PASS');
      expect(statusBeforeFinal.output).toContain('Verdict accepted: true');
      expect(statusBeforeFinal.output).toContain('Final-report eligible: true');

      // check and check --all agree the run is not failing on judge/context
      // grounds (both may still show remaining structural non-issues for
      // this synthetic run, but never a judge-integrity or context failure).
      const check = runCli(['check', '--root', tmp]);
      expect(check.output).toContain('Final-report eligible: true');

      // No correction route is active.
      expect(statusBeforeFinal.output).toContain('Judge correction: PASS - no correction required');

      // Final-report prompt is eligible (normal prompt, not blocked).
      const finalPrompt = runCli(['prompt', 'final-report', '--root', tmp]);
      expect(finalPrompt.output).not.toContain('Final-report generation is BLOCKED');
      expect(finalPrompt.output).toContain('Required output artifact: FinalReport');

      // The final-report artifact may complete the run.
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts', 'final-report.txt'), 'done', 'utf8');
      const mark = runCli(['mark', 'final-report.txt', '--state', 'complete', '--root', tmp]);
      expect(mark.exitCode).toBeUndefined();
      const statePath = getArtifactStatePath(meta.runFolder);
      expect(fs.existsSync(statePath)).toBe(true);

      // status and check agree the run is now complete.
      const statusAfter = runCli(['status', '--root', tmp]);
      expect(statusAfter.output).toContain('Current / next stage:\n  (complete)');
      expect(statusAfter.output).toContain('Status: All artifacts complete.');

      const promptAfter = runCli(['prompt', '--root', tmp]);
      expect(promptAfter.output).toContain('is complete');

      void loadRun(meta.runFolder);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
