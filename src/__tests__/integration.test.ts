/**
 * Integration tests for the init → start → prompt → artifact → next-prompt workflow.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initWorkspace, workspaceExists, getWorkspaceRoot, getRunsDir } from '../workspace';
import { createRun, loadRun, getMostRecentRun } from '../run';
import { generateStagePrompt } from '../promptGenerator';
import { getNextStage, isRunComplete, getArtifactStatuses, getSupportingReportStatuses } from '../stageDetector';
import { getWorkflow } from '../workflows';
import { VALID_MODES } from '../types';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-int-'));
}
function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Core workflow: init → start → prompt → artifact → next prompt ────────────

describe('integration: init → start → prompt flow', () => {
  it('full feature workflow: init, start, prompt first stage, create artifact, next prompt advances', () => {
    const tmp = makeTempDir();
    try {
      // 1. init
      initWorkspace(tmp);
      expect(workspaceExists(tmp)).toBe(true);
      expect(fs.existsSync(path.join(tmp, '.my-dev-kit-orchestrator', 'config.json'))).toBe(true);
      expect(fs.existsSync(getRunsDir(tmp))).toBe(true);

      // 2. start
      const meta = createRun({ request: 'add user login', mode: 'feature', projectRoot: tmp });
      expect(fs.existsSync(meta.runFolder)).toBe(true);
      expect(fs.existsSync(path.join(meta.runFolder, '00-request.txt'))).toBe(true);
      expect(fs.existsSync(path.join(meta.runFolder, 'run.json'))).toBe(true);
      expect(fs.existsSync(path.join(meta.runFolder, 'prompts'))).toBe(true);
      expect(fs.existsSync(path.join(meta.runFolder, 'artifacts'))).toBe(true);
      expect(fs.existsSync(path.join(meta.runFolder, 'reports'))).toBe(true);

      // 3. prompt — first stage
      const firstStage = getNextStage(meta);
      expect(firstStage).not.toBeNull();
      expect(firstStage!.name).toBe('request-brief');

      const prompt1 = generateStagePrompt(meta, firstStage!.name);
      expect(prompt1).toContain('Stage: request-brief');
      expect(prompt1).toContain('Workflow mode: feature');

      // 4. user creates the artifact
      fs.writeFileSync(path.join(meta.runFolder, firstStage!.artifactFile), 'RequestBrief content', 'utf8');

      // 5. next prompt advances
      const secondStage = getNextStage(meta);
      expect(secondStage!.name).toBe('architecture-context');

      const prompt2 = generateStagePrompt(meta, secondStage!.name);
      expect(prompt2).toContain('Stage: architecture-context');
    } finally {
      cleanup(tmp);
    }
  });

  it('prompt advances through all stages as artifacts are created', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test workflow', mode: 'feature', projectRoot: tmp });

      for (let i = 0; i < meta.stages.length; i++) {
        const next = getNextStage(meta);
        expect(next).not.toBeNull();
        expect(next!.name).toBe(meta.stages[i].name);

        // Create the artifact
        fs.writeFileSync(path.join(meta.runFolder, meta.stages[i].artifactFile), 'done', 'utf8');
      }

      expect(isRunComplete(meta)).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('run is complete when all artifacts exist — suggests final-report', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      for (const s of meta.stages) {
        fs.writeFileSync(path.join(meta.runFolder, s.artifactFile), 'done', 'utf8');
      }
      expect(isRunComplete(meta)).toBe(true);
      expect(getNextStage(meta)).toBeNull();
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── All five modes produce correct stage prompts and artifact mappings ────────

describe('integration: all five modes', () => {
  for (const mode of VALID_MODES) {
    it(`${mode} mode: creates run, generates all stage prompts, tracks artifacts`, () => {
      const tmp = makeTempDir();
      try {
        initWorkspace(tmp);
        const meta = createRun({ request: `${mode} test request`, mode, projectRoot: tmp });
        const workflow = getWorkflow(mode);

        expect(meta.mode).toBe(mode);
        expect(meta.stages.length).toBe(workflow.stages.length);

        // Verify each stage has a prompt file
        for (const stage of meta.stages) {
          const promptPath = path.join(meta.runFolder, stage.promptFile);
          expect(fs.existsSync(promptPath)).toBe(true);
          const content = fs.readFileSync(promptPath, 'utf8');
          expect(content).toContain(`Stage: ${stage.name}`);
          expect(content).toContain(`Workflow mode: ${mode}`);
        }

        // Verify no artifacts exist initially
        const statuses = getArtifactStatuses(meta);
        expect(statuses.every((s) => !s.present)).toBe(true);

        // First stage matches expected
        expect(getNextStage(meta)!.name).toBe(workflow.stages[0].name);
      } finally {
        cleanup(tmp);
      }
    });
  }
});

// ─── Folder layout tests ───────────────────────────────────────────────────────

describe('integration: run folder layout', () => {
  it('run folder has all required subdirectories', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      expect(fs.existsSync(path.join(meta.runFolder, 'prompts'))).toBe(true);
      expect(fs.existsSync(path.join(meta.runFolder, 'artifacts'))).toBe(true);
      expect(fs.existsSync(path.join(meta.runFolder, 'reports'))).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('prompt files are in prompts/ subdirectory', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      for (const stage of meta.stages) {
        expect(stage.promptFile).toMatch(/^prompts\//);
        expect(fs.existsSync(path.join(meta.runFolder, stage.promptFile))).toBe(true);
      }
    } finally {
      cleanup(tmp);
    }
  });

  it('artifact paths are in artifacts/ subdirectory', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      for (const stage of meta.stages) {
        expect(stage.artifactFile).toMatch(/^artifacts\//);
      }
    } finally {
      cleanup(tmp);
    }
  });

  it('workspace dir is inside project root', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const wsRoot = getWorkspaceRoot(tmp);
      expect(wsRoot.startsWith(tmp)).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── getMostRecentRun used by status and prompt ───────────────────────────────

describe('integration: getMostRecentRun for status and prompt', () => {
  it('getMostRecentRun returns the most recently created run', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'first', mode: 'feature', projectRoot: tmp });
      const recent = getMostRecentRun(tmp);
      expect(recent).not.toBeNull();
      expect(recent!.request).toBe('first');
    } finally {
      cleanup(tmp);
    }
  });

  it('getMostRecentRun returns null for empty workspace', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      expect(getMostRecentRun(tmp)).toBeNull();
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Cross-platform path tests ────────────────────────────────────────────────

describe('integration: cross-platform paths', () => {
  it('run folders use OS path separators (fs.existsSync works)', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'cross-platform test', mode: 'feature', projectRoot: tmp });
      expect(fs.existsSync(meta.runFolder)).toBe(true);
      expect(fs.existsSync(path.join(meta.runFolder, 'run.json'))).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('run.json projectRoot uses OS path', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'path test', mode: 'feature', projectRoot: tmp });
      const loaded = loadRun(meta.runFolder);
      expect(path.isAbsolute(loaded.projectRoot)).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Audit: v0.1.0 scope compliance ──────────────────────────────────────────

describe('audit: v0.1.0 scope compliance', () => {
  it('no LLM calls are made during init, start, or prompt generation', () => {
    // Structural test: we verify no network calls or LLM modules are imported
    const modules = ['anthropic', 'openai', 'langchain', 'llm', 'gpt'];
    const srcDir = path.join(__dirname, '..');
    const srcFiles = fs.readdirSync(srcDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.includes('__tests__'));

    for (const file of srcFiles) {
      const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
      for (const mod of modules) {
        expect(content.toLowerCase()).not.toContain(`require('${mod}')`);
        expect(content.toLowerCase()).not.toContain(`from '${mod}'`);
      }
    }
  });

  it('no JSON schema validation imports are present', () => {
    const schemaLibs = ['ajv', 'zod', 'yup', 'joi'];
    const srcDir = path.join(__dirname, '..');
    const srcFiles = fs.readdirSync(srcDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

    for (const file of srcFiles) {
      const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
      for (const lib of schemaLibs) {
        expect(content).not.toContain(`from '${lib}'`);
        expect(content).not.toContain(`require('${lib}')`);
      }
    }
  });

  it('command surface contains only v0.1.0 commands', () => {
    // Verified by unit tests in cli-foundation.test.ts
    // Structural assertion: no unsupported command files exist
    const cmdDir = path.join(__dirname, '../commands');
    const cmdFiles = fs.readdirSync(cmdDir).map((f) => f.replace('.ts', ''));
    const allowed = ['init', 'start', 'status', 'prompt', 'list'];
    for (const file of cmdFiles) {
      expect(allowed).toContain(file);
    }
  });

  it('prompts are stage-specific (no master prompt file)', () => {
    const srcDir = path.join(__dirname, '..');
    const srcFiles = fs.readdirSync(srcDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const fileNames = srcFiles.map((f) => f.toLowerCase());
    expect(fileNames).not.toContain('masterprompt.ts');
    expect(fileNames).not.toContain('global-prompt.ts');
  });

  it('test strategy prompts require behavior derivation', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const testStrategyPrompt = generateStagePrompt(meta, 'test-strategy');
      expect(testStrategyPrompt).toContain('behavior-model.txt');
      expect(testStrategyPrompt).toContain('pseudocode-packet.txt');
      expect(testStrategyPrompt).toContain('do not write test files in this stage');
    } finally {
      cleanup(tmp);
    }
  });

  it('implementation prompts do not claim verification', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const implPrompt = generateStagePrompt(meta, 'implementation');
      expect(implPrompt).not.toMatch(/verification.*passed/i);
      expect(implPrompt).not.toMatch(/tests.*passed/i);
      expect(implPrompt).toContain('do not claim verification success');
    } finally {
      cleanup(tmp);
    }
  });

  it('verification prompts require command evidence', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const verifyPrompt = generateStagePrompt(meta, 'verification');
      expect(verifyPrompt).toContain('do not claim checks passed unless command output was produced');
    } finally {
      cleanup(tmp);
    }
  });

  it('architecture-context prompts mention my-dev-kit only as prompt-driven guidance', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const archPrompt = generateStagePrompt(meta, 'architecture-context');
      expect(archPrompt).toContain('my-dev-kit');
      expect(archPrompt).not.toContain('automatically executes');
    } finally {
      cleanup(tmp);
    }
  });

  it('no generated prompt uses the forbidden legacy term', () => {
    for (const mode of VALID_MODES) {
      const tmp = makeTempDir();
      try {
        initWorkspace(tmp);
        const meta = createRun({ request: `${mode} vocab compliance check`, mode, projectRoot: tmp });
        for (const stage of meta.stages) {
          const prompt = generateStagePrompt(meta, stage.name);
          expect(prompt).not.toMatch(new RegExp(`\\b${['br', 'idge'].join('')}\\b`, 'i'));
        }
      } finally {
        cleanup(tmp);
      }
    }
  });
});

// ─── v0.2.0: graph-guided architecture context integration ────────────────────

describe('integration: v0.2.0 graph-guided architecture context', () => {
  it('architecture-context prompt includes retrieval report output path', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'add user auth', mode: 'feature', projectRoot: tmp });
      const archPrompt = generateStagePrompt(meta, 'architecture-context');
      expect(archPrompt).toContain('reports/architecture-context-retrieval-report.txt');
    } finally {
      cleanup(tmp);
    }
  });

  it('architecture-context prompt includes ArchitectureContextPacket output path', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const archPrompt = generateStagePrompt(meta, 'architecture-context');
      expect(archPrompt).toContain('artifacts/architecture-context-packet.txt');
    } finally {
      cleanup(tmp);
    }
  });

  it('architecture-context prompt instructs synthesis of retrieval evidence', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const archPrompt = generateStagePrompt(meta, 'architecture-context');
      expect(archPrompt).toContain('Synthesize retrieval evidence');
      expect(archPrompt).toContain('Do not dump raw retrieval output');
    } finally {
      cleanup(tmp);
    }
  });

  it('after writing both outputs, supporting report shows as present', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      fs.writeFileSync(path.join(meta.runFolder, 'reports/architecture-context-retrieval-report.txt'), 'evidence', 'utf8');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/architecture-context-packet.txt'), 'packet', 'utf8');
      const reports = getSupportingReportStatuses(meta);
      const archReport = reports.find((r) => r.stageName === 'architecture-context');
      expect(archReport!.present).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('stage progression advances when ArchitectureContextPacket exists, regardless of retrieval report', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/request-brief.txt'), 'done', 'utf8');
      // Write ArchitectureContextPacket but not retrieval report
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/architecture-context-packet.txt'), 'done', 'utf8');
      const next = getNextStage(meta);
      expect(next!.name).toBe('behavior-model');
    } finally {
      cleanup(tmp);
    }
  });

  it('non-extraction modes include architecture-context supporting report entry', () => {
    const nonExtractionModes = VALID_MODES.filter((m) => m !== 'extraction');
    for (const mode of nonExtractionModes) {
      const tmp = makeTempDir();
      try {
        initWorkspace(tmp);
        const meta = createRun({ request: `${mode} supporting report check`, mode, projectRoot: tmp });
        const reports = getSupportingReportStatuses(meta);
        expect(reports.some((r) => r.stageName === 'architecture-context')).toBe(true);
      } finally {
        cleanup(tmp);
      }
    }
  });

  it('extraction mode includes source-architecture-context supporting report entry', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'extraction supporting report check', mode: 'extraction', projectRoot: tmp });
      const reports = getSupportingReportStatuses(meta);
      expect(reports.some((r) => r.stageName === 'source-architecture-context')).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });
});
