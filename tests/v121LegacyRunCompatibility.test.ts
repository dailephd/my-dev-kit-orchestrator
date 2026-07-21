import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun, loadRun } from '../src/run';
import { generateStagePrompt } from '../src/promptGenerator';
import { evaluateContextReadiness } from '../src/instructions/contextReadiness';
import { STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from '../src/instructions/stageRepositoryEvidenceRequirements';
import { makeReadyRunFolder } from './readyContextTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-legacy-run-'));
}

const testRequirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === 'stage.feature.test-implementation')!;

describe('v1.2.1 legacy TestStrategyPacket compatibility', () => {
  it('an old TestStrategyPacket with no criticality field at all is loadable but honestly blocked, not guessed', () => {
    const tmp = makeTempDir();
    try {
      makeReadyRunFolder(tmp, 'feature');
      // Simulate a pre-Batch-5 TestStrategyPacket: plain prose responsibility
      // list with no "test responsibility ID:" / "criticality:" structure at
      // all.
      const legacyStrategyText = [
        'Artifact: TestStrategyPacket',
        'Workflow mode: feature',
        '',
        'Test responsibilities:',
        '- Verify the login form validates empty fields.',
        '- Verify the logout button clears the session.',
        '',
        'Status: complete',
      ].join('\n');
      fs.writeFileSync(path.join(tmp, 'artifacts', 'test-strategy-packet.txt'), legacyStrategyText, 'utf8');

      expect(() => fs.readFileSync(path.join(tmp, 'artifacts', 'test-strategy-packet.txt'), 'utf8')).not.toThrow();

      const result = evaluateContextReadiness({ requirement: testRequirement, stageId: testRequirement.stageId, runFolder: tmp, mode: 'feature' });
      expect(result.decision).toBe('refresh-required');
      expect(result.classification).toBe('test-responsibility-invalid');
      // Honest: it reports the gap, it does not invent criticality values.
      expect(result.issues.map((i) => i.code)).toContain('CONTEXT_TEST_RESPONSIBILITY_ID_MISSING');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('an old TestStrategyPacket with responsibility IDs but no criticality field is loadable but honestly blocked', () => {
    const tmp = makeTempDir();
    try {
      makeReadyRunFolder(tmp, 'feature');
      const legacyStrategyText = [
        'test responsibility ID: TST-001',
        'traces to: login behavior',
        'setup: n/a',
        'action or trigger: submit empty form',
        'expected result: shows validation error',
        'test level: unit',
      ].join('\n');
      fs.writeFileSync(path.join(tmp, 'artifacts', 'test-strategy-packet.txt'), legacyStrategyText, 'utf8');

      const result = evaluateContextReadiness({ requirement: testRequirement, stageId: testRequirement.stageId, runFolder: tmp, mode: 'feature' });
      expect(result.decision).toBe('refresh-required');
      expect(result.classification).toBe('test-responsibility-criticality-unknown');
      expect(result.issues.map((i) => i.code)).toContain('CONTEXT_TEST_RESPONSIBILITY_CRITICALITY_MISSING');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('the test-implementation prompt for an old run with no criticality becomes refresh-only, not a false-ready normal prompt', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'legacy strategy run', mode: 'feature', projectRoot: tmp });
      makeReadyRunFolder(meta.runFolder, 'feature');
      fs.writeFileSync(
        path.join(meta.runFolder, 'artifacts', 'test-strategy-packet.txt'),
        'Test responsibilities:\n- Verify login.\n',
        'utf8',
      );
      const prompt = generateStagePrompt(meta, 'test-implementation');
      expect(prompt).toContain('BLOCKED on repository context');
      expect(prompt).toContain('Classification: test-responsibility-invalid');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('v1.2.1 legacy run family compatibility (loadRun + prompt, no mutation)', () => {
  it.each(['feature', 'repair', 'test', 'refactor', 'harden', 'extraction', 'greenfield'] as const)(
    '%s: an old run with no supplemental context files at all loads and generates its first prompt without error or mutation',
    (mode) => {
      const tmp = makeTempDir();
      try {
        const meta = createRun({ request: 'legacy', mode, projectRoot: tmp });
        for (const rel of [
          'artifacts/implementation-context-packet.txt',
          'reports/implementation-context-retrieval-report.txt',
          'artifacts/test-context-packet.txt',
          'reports/test-context-retrieval-report.txt',
        ]) {
          const p = path.join(meta.runFolder, rel);
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        const runJsonBefore = fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8');
        const reloaded = loadRun(meta.runFolder);
        expect(() => generateStagePrompt(reloaded, meta.stages[0].name)).not.toThrow();
        const runJsonAfter = fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8');
        expect(runJsonAfter).toBe(runJsonBefore);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
  );
});
