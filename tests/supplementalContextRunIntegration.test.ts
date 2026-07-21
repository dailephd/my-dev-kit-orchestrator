import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun, loadRun } from '../src/run';
import { generateStagePrompt, generateCorrectionPrompt } from '../src/promptGenerator';
import { VALID_MODES, WorkflowMode } from '../src/types';

const CONTEXT_FILES = [
  path.join('artifacts', 'implementation-context-packet.txt'),
  path.join('reports', 'implementation-context-retrieval-report.txt'),
  path.join('artifacts', 'test-context-packet.txt'),
  path.join('reports', 'test-context-retrieval-report.txt'),
];

const EXPECTED_FILES_BY_MODE: Record<WorkflowMode, string[]> = {
  feature: CONTEXT_FILES,
  repair: CONTEXT_FILES,
  test: [path.join('artifacts', 'test-context-packet.txt'), path.join('reports', 'test-context-retrieval-report.txt')],
  refactor: CONTEXT_FILES,
  harden: CONTEXT_FILES,
  extraction: CONTEXT_FILES,
  greenfield: [],
};

function makeProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-ctx-run-'));
}

describe('supplemental context new-run integration', () => {
  it.each(VALID_MODES)('creates exactly the required context files for mode "%s"', (mode) => {
    const projectRoot = makeProjectRoot();
    try {
      const meta = createRun({ request: 'do the thing', mode, projectRoot });
      const expected = EXPECTED_FILES_BY_MODE[mode];
      for (const rel of CONTEXT_FILES) {
        const exists = fs.existsSync(path.join(meta.runFolder, rel));
        expect(exists).toBe(expected.includes(rel));
      }
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('feature run.json has no reference to any context file path', () => {
    const projectRoot = makeProjectRoot();
    try {
      const meta = createRun({ request: 'do the thing', mode: 'feature', projectRoot });
      const raw = fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8');
      expect(raw).not.toContain('implementation-context-packet');
      expect(raw).not.toContain('test-context-packet');
      expect(raw).not.toContain('context-retrieval-report');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('does not overwrite a manually populated context file on repeated writeStagePrompts (re-init)', () => {
    const projectRoot = makeProjectRoot();
    try {
      const meta = createRun({ request: 'do the thing', mode: 'feature', projectRoot });
      const packetPath = path.join(meta.runFolder, 'artifacts', 'implementation-context-packet.txt');
      fs.writeFileSync(packetPath, 'MANUALLY POPULATED', 'utf8');
      // Re-running the stage-prompt write boundary (as createRun's internals
      // do) must never reset a populated file back to template.
      const { writeStagePrompts } = require('../src/promptGenerator');
      writeStagePrompts(meta);
      expect(fs.readFileSync(packetPath, 'utf8')).toBe('MANUALLY POPULATED');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('prompt sidecar count still equals native stage count (context files are not sidecars)', () => {
    const projectRoot = makeProjectRoot();
    try {
      const meta = createRun({ request: 'do the thing', mode: 'feature', projectRoot });
      const sidecars = fs
        .readdirSync(path.join(meta.runFolder, 'prompts'))
        .filter((f) => f.endsWith('.instruction-packet.json'));
      expect(sidecars).toHaveLength(meta.stages.length);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

describe('old-run compatibility (no supplemental context files present)', () => {
  function makeOldRun(mode: WorkflowMode, projectRoot: string) {
    const meta = createRun({ request: 'legacy run', mode, projectRoot });
    // Simulate a pre-Batch-4 run folder by deleting any context files that
    // were just created.
    for (const rel of CONTEXT_FILES) {
      const p = path.join(meta.runFolder, rel);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    return meta;
  }

  it.each(['feature', 'test', 'extraction', 'greenfield'] as WorkflowMode[])(
    'loadRun, prompt generation, and status remain valid for an old "%s" run with missing context files',
    (mode) => {
      const projectRoot = makeProjectRoot();
      try {
        const meta = makeOldRun(mode, projectRoot);
        const reloaded = loadRun(meta.runFolder);
        expect(reloaded.runId).toBe(meta.runId);

        const runJsonBefore = fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8');
        const artifactStateBefore = fs.existsSync(path.join(meta.runFolder, 'artifact-state.json'))
          ? fs.readFileSync(path.join(meta.runFolder, 'artifact-state.json'), 'utf8')
          : undefined;

        // Prompt generation must succeed without creating any file.
        const firstStage = meta.stages[0].name;
        expect(() => generateStagePrompt(reloaded, firstStage)).not.toThrow();

        const runJsonAfter = fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8');
        expect(runJsonAfter).toBe(runJsonBefore);
        const artifactStateAfter = fs.existsSync(path.join(meta.runFolder, 'artifact-state.json'))
          ? fs.readFileSync(path.join(meta.runFolder, 'artifact-state.json'), 'utf8')
          : undefined;
        expect(artifactStateAfter).toBe(artifactStateBefore);

        for (const rel of CONTEXT_FILES) {
          expect(fs.existsSync(path.join(meta.runFolder, rel))).toBe(false);
        }
      } finally {
        fs.rmSync(projectRoot, { recursive: true, force: true });
      }
    },
  );

  it('correction prompt generation succeeds for an old run missing context files', () => {
    const projectRoot = makeProjectRoot();
    try {
      const meta = makeOldRun('feature', projectRoot);
      const { parseAndRoute } = require('../src/correctionRouter');
      const state = parseAndRoute('Verdict: IMPLEMENTATION_MISMATCH');
      expect(() => generateCorrectionPrompt(meta, state)).not.toThrow();
      const prompt = generateCorrectionPrompt(meta, state);
      expect(prompt).toContain('Classification: missing');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
