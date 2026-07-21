import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateStagePrompt } from '../src/promptGenerator';
import { RunMetadata } from '../src/run';
import { getWorkflow } from '../src/workflows';
import { VALID_MODES, WorkflowMode } from '../src/types';
import { STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from '../src/instructions/stageRepositoryEvidenceRequirements';
import { renderSupplementalContextTemplate } from '../src/instructions/supplementalContextTemplates';
import { makeReadyRunFolder, fillRequiredSections } from './readyContextTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-repo-evidence-prompt-'));
}

function makeMeta(mode: WorkflowMode, runFolder: string): RunMetadata {
  const workflow = getWorkflow(mode);
  return {
    runId: 'run-1',
    mode,
    request: 'test',
    projectRoot: '/proj',
    runFolder,
    createdAt: '2024-01-01T00:00:00.000Z',
    currentStage: workflow.stages[0].name,
    stages: workflow.stages,
    status: 'in_progress',
    ...(mode === 'extraction' ? { sourceRepoRoot: '/src', targetRepoRoot: '/tgt' } : {}),
  };
}

const CONTEXT_SENSITIVE_BY_MODE = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.reduce<Record<string, string[]>>((acc, req) => {
  const [, mode, stage] = req.stageId.split('.');
  acc[mode] = acc[mode] ?? [];
  acc[mode].push(stage);
  return acc;
}, {});

describe('repository evidence prompt integration', () => {
  // Batch 5: a direct context-sensitive stage with no context files renders
  // a context-refresh-only prompt instead of the normal packet-backed work
  // prompt (AGENTS.txt Batch 5 section 14.2) -- the informational
  // "Repository evidence:" section (still exercised below once context is
  // ready) only appears inside the normal prompt.
  it.each(STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.map((r) => r.stageId))(
    'renders a context-refresh-only prompt for %s when context is missing',
    (stageId) => {
      const [, mode, stageName] = stageId.split('.');
      const tmp = makeTempDir();
      try {
        const meta = makeMeta(mode as WorkflowMode, tmp);
        const prompt = generateStagePrompt(meta, stageName);
        expect(prompt).toContain('BLOCKED on repository context');
        expect(prompt).toContain('Readiness decision: refresh-required');
        expect(prompt).toContain('Classification: missing');
        expect(prompt).toContain('Automatic retrieval: disabled');
        expect(prompt).toContain('do not write the normal stage report artifact for this stage');
        // The normal packet-backed instruction block must NOT be present --
        // this is a wholly different, bounded prompt, not an addition to it.
        expect(prompt).not.toContain('Workflow instruction packet:');
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
  );

  it.each(STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.map((r) => r.stageId))(
    'renders the normal packet-backed prompt with a Repository evidence section for %s when context is ready',
    (stageId) => {
      const [, mode, stageName] = stageId.split('.');
      const tmp = makeTempDir();
      try {
        makeReadyRunFolder(tmp, mode);
        const meta = makeMeta(mode as WorkflowMode, tmp);
        const prompt = generateStagePrompt(meta, stageName);
        expect(prompt).toContain('Repository evidence:');
        expect(prompt).toMatch(/Expected role: (implementation|test-implementation)/);
        expect(prompt).toContain('Aggregate status: populated');
        expect(prompt).toContain('Context readiness decision: ready');
        expect(prompt).toContain('Enforcement: informational');
        expect(prompt).toContain('Automatic retrieval: disabled');
        expect(prompt).toContain('Workflow instruction packet:');
        expect(prompt).toContain(`Stage ID: ${stageId}`);
        expect(prompt).toContain('Required output artifact:');
        expect(prompt).toContain('Output file:');
        expect(prompt).toContain('Return format:');
        expect(prompt).toContain('Inputs:');
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
  );

  it('does not render a Repository evidence section for non-context-sensitive stages', () => {
    const tmp = makeTempDir();
    try {
      for (const mode of VALID_MODES) {
        const workflow = getWorkflow(mode);
        const sensitiveStages = new Set(CONTEXT_SENSITIVE_BY_MODE[mode] ?? []);
        const meta = makeMeta(mode, tmp);
        for (const stage of workflow.stages) {
          if (sensitiveStages.has(stage.name)) continue;
          const prompt = generateStagePrompt(meta, stage.name);
          expect(prompt).not.toContain('Repository evidence:');
        }
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a structurally populated packet with no raw-evidence reference still blocks as source-reference-missing', () => {
    const tmp = makeTempDir();
    try {
      fs.mkdirSync(path.join(tmp, 'artifacts'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'reports'), { recursive: true });
      const meta = makeMeta('feature', tmp);

      const packetText = fillRequiredSections(
        renderSupplementalContextTemplate('implementation-context-packet', 'feature').replace(
          'Status: template',
          'Status: populated',
        ),
        'implementation-context-packet',
      );
      const reportText = renderSupplementalContextTemplate('implementation-context-retrieval-report', 'feature').replace(
        'Status: template',
        'Status: populated',
      );
      fs.writeFileSync(path.join(tmp, 'artifacts', 'implementation-context-packet.txt'), packetText, 'utf8');
      fs.writeFileSync(path.join(tmp, 'reports', 'implementation-context-retrieval-report.txt'), reportText, 'utf8');

      const prompt = generateStagePrompt(meta, 'implementation');
      expect(prompt).toContain('BLOCKED on repository context');
      expect(prompt).toContain('Classification: source-reference-missing');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not throw for malformed, unsupported, or template context -- it renders a refresh-only prompt instead', () => {
    const tmp = makeTempDir();
    try {
      fs.mkdirSync(path.join(tmp, 'artifacts'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'reports'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'artifacts', 'implementation-context-packet.txt'), 'garbage content', 'utf8');
      const meta = makeMeta('feature', tmp);
      expect(() => generateStagePrompt(meta, 'implementation')).not.toThrow();
      const prompt = generateStagePrompt(meta, 'implementation');
      expect(prompt).toContain('Classification: malformed');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('renders no files as a side effect of prompt display', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeMeta('feature', tmp);
      generateStagePrompt(meta, 'implementation');
      expect(fs.existsSync(path.join(tmp, 'artifacts'))).toBe(false);
      expect(fs.existsSync(path.join(tmp, 'reports'))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
