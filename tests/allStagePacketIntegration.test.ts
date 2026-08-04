import { generateStagePrompt } from '../src/promptGenerator';
import { RunMetadata } from '../src/run';
import { getAllWorkflows } from '../src/workflows';
import { VALID_MODES } from '../src/types';
import { STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from '../src/instructions/stageRepositoryEvidenceRequirements';

// scaffold-plan/scaffold-implementation render via a separate, forbidden-for-
// this-batch module (src/greenfield/scaffold/renderScaffoldPrompt.ts) and are
// the one documented exception to full migration (see
// tests/v121Batch2Compatibility.test.ts and the Batch 3 final report).
const DOCUMENTED_LEGACY_EXCEPTIONS = new Set(['greenfield:scaffold-plan', 'greenfield:scaffold-implementation']);

// Batch 5: the 11 direct context-sensitive stages render a context-refresh-
// only prompt (no packet block) instead of their normal work prompt when
// context is not ready -- this fixture's fake runFolder never has real
// context files, so these always hit that path. See
// tests/repositoryEvidencePromptIntegration.test.ts for their normal
// packet-backed rendering once context is ready.
const CONTEXT_BLOCKED_STAGES = new Set(
  STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.map((r) => {
    const [, mode, stage] = r.stageId.split('.');
    return `${mode}:${stage}`;
  }),
);

function makeFakeRun(mode: typeof VALID_MODES[number]): RunMetadata {
  const workflow = getAllWorkflows().find((w) => w.mode === mode)!;
  return {
    runId: '20240101T120000-test-run',
    mode,
    request: 'test request',
    projectRoot: '/fake/project',
    runFolder: '/fake/project/.my-dev-kit-orchestrator/runs/20240101T120000-test-run',
    createdAt: '2024-01-01T12:00:00.000Z',
    currentStage: workflow.stages[0].name,
    stages: workflow.stages,
    status: 'created',
    ...(mode === 'extraction' ? { sourceRepoRoot: '/fake/source', targetRepoRoot: '/fake/target' } : {}),
  };
}

describe('all 79 native stages are packet-backed (except the documented legacy exceptions)', () => {
  for (const wf of getAllWorkflows()) {
    describe(`${wf.mode} workflow`, () => {
      const meta = makeFakeRun(wf.mode);
      for (const stage of wf.stages) {
        const key = `${wf.mode}:${stage.name}`;
        const isLegacyException = DOCUMENTED_LEGACY_EXCEPTIONS.has(key);

        it(`${stage.name}: generateStagePrompt succeeds`, () => {
          expect(() => generateStagePrompt(meta, stage.name)).not.toThrow();
        });

        if (isLegacyException) {
          it(`${stage.name}: remains on the legacy renderer (documented exception)`, () => {
            const prompt = generateStagePrompt(meta, stage.name);
            expect(prompt).not.toContain('Workflow instruction packet:');
          });
          continue;
        }

        if (CONTEXT_BLOCKED_STAGES.has(key)) {
          it(`${stage.name}: renders a context-refresh-only prompt (context not ready)`, () => {
            const prompt = generateStagePrompt(meta, stage.name);
            expect(prompt).not.toContain('Workflow instruction packet:');
            expect(prompt).toContain('BLOCKED on repository context');
            expect(prompt).toContain('Return format:');
          });
          continue;
        }

        // v1.2.3 Batch 3: final-report only renders its normal packet-backed
        // prompt once FinalReportEligibility is true. This fixture's fake
        // runFolder never has a real judge-report.txt, so every mode's
        // final-report always hits the blocked path -- see
        // tests/correctedReadyReplay.test.ts and
        // tests/judgeIntegrityCliIntegration.test.ts for its normal
        // rendering once a PASS verdict is accepted.
        if (stage.name === 'final-report') {
          it(`${stage.name}: renders a final-report-ineligible prompt (no accepted judge verdict)`, () => {
            const prompt = generateStagePrompt(meta, stage.name);
            expect(prompt).not.toContain('Workflow instruction packet:');
            expect(prompt).toContain('Final-report generation is BLOCKED');
            expect(prompt).toContain('Return format:');
          });
          continue;
        }

        it(`${stage.name}: prompt contains exactly one workflow instruction packet block with the exact IDs`, () => {
          const prompt = generateStagePrompt(meta, stage.name);
          const occurrences = prompt.split('Workflow instruction packet:').length - 1;
          expect(occurrences).toBe(1);
          expect(prompt).toContain(`Workflow ID: workflow.${wf.mode}`);
          expect(prompt).toContain(`Stage ID: stage.${wf.mode}.${stage.name}`);
        });

        it(`${stage.name}: prompt contains task instructions, validation requirements, stop conditions, and a report contract`, () => {
          const prompt = generateStagePrompt(meta, stage.name);
          expect(prompt).toContain('Task:');
          expect(prompt).toContain('Validation requirements:');
          expect(prompt).toContain('Stop conditions:');
          expect(prompt).toContain('Report contract:');
        });

        it(`${stage.name}: prompt retains a required-output-artifact or return-format section`, () => {
          const prompt = generateStagePrompt(meta, stage.name);
          expect(prompt).toMatch(/Required output artifact:|Return format:/);
        });
      }
    });
  }
});
