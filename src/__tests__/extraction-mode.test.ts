/**
 * Tests for --mode extraction: stage order, artifact gates, prompt generation,
 * run metadata, source/target paths, and porting-map dual-artifact behavior.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initWorkspace } from '../workspace';
import { createRun, loadRun } from '../run';
import { getWorkflow } from '../workflows';
import { generateStagePrompt } from '../promptGenerator';
import { getNextStage, getArtifactStatuses, getMissingPriorArtifacts, getSupportingReportStatuses } from '../stageDetector';
import { isValidMode } from '../types';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-extraction-'));
}
function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Mode acceptance ──────────────────────────────────────────────────────────

describe('extraction mode acceptance', () => {
  it('extraction is accepted as a valid mode', () => {
    expect(isValidMode('extraction')).toBe(true);
  });

  it('existing modes still work', () => {
    expect(isValidMode('feature')).toBe(true);
    expect(isValidMode('repair')).toBe(true);
    expect(isValidMode('test')).toBe(true);
    expect(isValidMode('refactor')).toBe(true);
    expect(isValidMode('harden')).toBe(true);
  });

  it('invalid mode still fails', () => {
    expect(isValidMode('debug')).toBe(false);
    expect(isValidMode('extract')).toBe(false);
  });
});

// ─── Extraction stage order ───────────────────────────────────────────────────

describe('extraction mode stage order', () => {
  it('extraction mode uses the exact required stage order', () => {
    const wf = getWorkflow('extraction');
    const names = wf.stages.map((s) => s.name);
    expect(names).toEqual([
      'request-brief',
      'source-architecture-context',
      'source-workflow-map',
      'porting-map',
      'golden-behavior-contract',
      'target-architecture',
      'behavior-model',
      'pseudocode-packet',
      'test-strategy',
      'implementation',
      'test-implementation',
      'verification',
      'judge',
      'final-report',
    ]);
  });

  it('extraction mode has 14 stages', () => {
    const wf = getWorkflow('extraction');
    expect(wf.stages).toHaveLength(14);
  });
});

// ─── Run creation with source/target metadata ─────────────────────────────────

describe('extraction run creation', () => {
  it('createRun stores sourceRepoRoot and targetRepoRoot in metadata', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({
        request: 'extract search workflow',
        mode: 'extraction',
        projectRoot: tmp,
        sourceRepoRoot: '/source/repo',
        targetRepoRoot: '/target/repo',
      });
      expect(meta.mode).toBe('extraction');
      expect(meta.sourceRepoRoot).toBe('/source/repo');
      expect(meta.targetRepoRoot).toBe('/target/repo');
    } finally {
      cleanup(tmp);
    }
  });

  it('sourceRepoRoot and targetRepoRoot are persisted in run.json', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({
        request: 'extract search workflow',
        mode: 'extraction',
        projectRoot: tmp,
        sourceRepoRoot: '/source/repo',
        targetRepoRoot: '/target/repo',
      });
      const loaded = loadRun(meta.runFolder);
      expect(loaded.sourceRepoRoot).toBe('/source/repo');
      expect(loaded.targetRepoRoot).toBe('/target/repo');
    } finally {
      cleanup(tmp);
    }
  });

  it('non-extraction runs do not have sourceRepoRoot or targetRepoRoot', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'add login', mode: 'feature', projectRoot: tmp });
      expect(meta.sourceRepoRoot).toBeUndefined();
      expect(meta.targetRepoRoot).toBeUndefined();
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Artifact progression ─────────────────────────────────────────────────────

describe('extraction artifact progression', () => {
  it('first next stage is request-brief on fresh extraction run', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'extract workflow', mode: 'extraction', projectRoot: tmp });
      const next = getNextStage(meta);
      expect(next!.name).toBe('request-brief');
    } finally {
      cleanup(tmp);
    }
  });

  it('source-workflow-map stage requires source-workflow-map.txt', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'extract workflow', mode: 'extraction', projectRoot: tmp });
      const stage = meta.stages.find((s) => s.name === 'source-workflow-map');
      expect(stage!.artifactFile).toBe('artifacts/source-workflow-map.txt');
    } finally {
      cleanup(tmp);
    }
  });

  it('porting-map stage requires source-to-target-porting-map.txt as primary', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'extract workflow', mode: 'extraction', projectRoot: tmp });
      const stage = meta.stages.find((s) => s.name === 'porting-map');
      expect(stage!.artifactFile).toBe('artifacts/source-to-target-porting-map.txt');
    } finally {
      cleanup(tmp);
    }
  });

  it('porting-map stage requires do-not-port-list.txt as additional artifact', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'extract workflow', mode: 'extraction', projectRoot: tmp });
      const stage = meta.stages.find((s) => s.name === 'porting-map');
      expect(stage!.additionalArtifactFiles).toEqual(['artifacts/do-not-port-list.txt']);
    } finally {
      cleanup(tmp);
    }
  });

  it('golden-behavior-contract stage requires golden-behavior-contract.txt', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'extract workflow', mode: 'extraction', projectRoot: tmp });
      const stage = meta.stages.find((s) => s.name === 'golden-behavior-contract');
      expect(stage!.artifactFile).toBe('artifacts/golden-behavior-contract.txt');
    } finally {
      cleanup(tmp);
    }
  });

  it('target-architecture stage requires target-architecture-proposal.txt', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'extract workflow', mode: 'extraction', projectRoot: tmp });
      const stage = meta.stages.find((s) => s.name === 'target-architecture');
      expect(stage!.artifactFile).toBe('artifacts/target-architecture-proposal.txt');
    } finally {
      cleanup(tmp);
    }
  });

  it('porting-map stage is not complete when only primary artifact is present', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'extract workflow', mode: 'extraction', projectRoot: tmp });
      // Write all stages up to porting-map primary, but not do-not-port-list
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/request-brief.txt'), 'done', 'utf8');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/source-architecture-context-packet.txt'), 'done', 'utf8');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/source-workflow-map.txt'), 'done', 'utf8');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/source-to-target-porting-map.txt'), 'done', 'utf8');
      // do-not-port-list.txt is NOT written
      const next = getNextStage(meta);
      expect(next!.name).toBe('porting-map');
    } finally {
      cleanup(tmp);
    }
  });

  it('porting-map stage completes when both artifacts are present', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'extract workflow', mode: 'extraction', projectRoot: tmp });
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/request-brief.txt'), 'done', 'utf8');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/source-architecture-context-packet.txt'), 'done', 'utf8');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/source-workflow-map.txt'), 'done', 'utf8');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/source-to-target-porting-map.txt'), 'done', 'utf8');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/do-not-port-list.txt'), 'done', 'utf8');
      const next = getNextStage(meta);
      expect(next!.name).toBe('golden-behavior-contract');
    } finally {
      cleanup(tmp);
    }
  });

  it('pseudocode stage is not reached before GoldenBehaviorContract exists', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'extract workflow', mode: 'extraction', projectRoot: tmp });
      // Write through target-architecture but not golden-behavior-contract
      const preGolden = [
        'artifacts/request-brief.txt',
        'artifacts/source-architecture-context-packet.txt',
        'artifacts/source-workflow-map.txt',
        'artifacts/source-to-target-porting-map.txt',
        'artifacts/do-not-port-list.txt',
      ];
      for (const f of preGolden) {
        fs.writeFileSync(path.join(meta.runFolder, f), 'done', 'utf8');
      }
      const next = getNextStage(meta);
      expect(next!.name).toBe('golden-behavior-contract');
    } finally {
      cleanup(tmp);
    }
  });

  it('implementation is not reached before all pre-implementation extraction artifacts exist', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'extract workflow', mode: 'extraction', projectRoot: tmp });
      // Write through target-architecture (all 6 pre-implementation stages)
      const preImpl = [
        'artifacts/request-brief.txt',
        'artifacts/source-architecture-context-packet.txt',
        'artifacts/source-workflow-map.txt',
        'artifacts/source-to-target-porting-map.txt',
        'artifacts/do-not-port-list.txt',
        'artifacts/golden-behavior-contract.txt',
        'artifacts/target-architecture-proposal.txt',
      ];
      for (const f of preImpl) {
        fs.writeFileSync(path.join(meta.runFolder, f), 'done', 'utf8');
      }
      const next = getNextStage(meta);
      expect(next!.name).toBe('behavior-model');
    } finally {
      cleanup(tmp);
    }
  });

  it('getMissingPriorArtifacts includes do-not-port-list.txt when porting-map is incomplete', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'extract workflow', mode: 'extraction', projectRoot: tmp });
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/request-brief.txt'), 'done', 'utf8');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/source-architecture-context-packet.txt'), 'done', 'utf8');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/source-workflow-map.txt'), 'done', 'utf8');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/source-to-target-porting-map.txt'), 'done', 'utf8');
      // do-not-port-list.txt NOT written
      const missing = getMissingPriorArtifacts(meta, 'golden-behavior-contract');
      expect(missing).toContain('artifacts/do-not-port-list.txt');
    } finally {
      cleanup(tmp);
    }
  });

  it('getArtifactStatuses includes both porting-map artifacts', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'extract workflow', mode: 'extraction', projectRoot: tmp });
      const statuses = getArtifactStatuses(meta);
      const portingMap = statuses.find((s) => s.artifactFile === 'artifacts/source-to-target-porting-map.txt');
      const doNotPort = statuses.find((s) => s.artifactFile === 'artifacts/do-not-port-list.txt');
      expect(portingMap).toBeDefined();
      expect(doNotPort).toBeDefined();
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Supporting reports ───────────────────────────────────────────────────────

describe('extraction supporting reports', () => {
  it('extraction mode has source-architecture-context supporting report', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'extract workflow', mode: 'extraction', projectRoot: tmp });
      const reports = getSupportingReportStatuses(meta);
      const sourceReport = reports.find((r) => r.stageName === 'source-architecture-context');
      expect(sourceReport).toBeDefined();
      expect(sourceReport!.reportFile).toBe('reports/source-architecture-context-retrieval-report.txt');
    } finally {
      cleanup(tmp);
    }
  });

  it('extraction mode does not include architecture-context supporting report', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'extract workflow', mode: 'extraction', projectRoot: tmp });
      const reports = getSupportingReportStatuses(meta);
      const archReport = reports.find((r) => r.stageName === 'architecture-context');
      expect(archReport).toBeUndefined();
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Prompt generation ────────────────────────────────────────────────────────

function makeExtractionMeta() {
  const wf = getWorkflow('extraction');
  return {
    runId: '20240101T120000-extraction-test',
    mode: 'extraction' as const,
    request: 'extract search and pagination workflow',
    projectRoot: '/target/repo',
    runFolder: '/target/repo/.my-dev-kit-orchestrator/runs/20240101T120000-extraction-test',
    createdAt: '2024-01-01T12:00:00.000Z',
    currentStage: 'request-brief',
    stages: wf.stages,
    status: 'created' as const,
    sourceRepoRoot: '/source/repo',
    targetRepoRoot: '/target/repo',
  };
}

describe('extraction prompt generation — required fields', () => {
  const REQUIRED = ['Stage:', 'Workflow mode:', 'Run ID:', 'Project root:', 'Run folder:', 'Task:', 'Required output artifact:', 'Output file:', 'Stop conditions:', 'Return format:'];

  for (const stage of getWorkflow('extraction').stages) {
    it(`${stage.name} prompt has all required sections`, () => {
      const meta = makeExtractionMeta();
      const prompt = generateStagePrompt(meta, stage.name);
      for (const field of REQUIRED) {
        expect(prompt).toContain(field);
      }
    });
  }
});

describe('extraction prompt generation — stage identity', () => {
  it('each extraction prompt contains its own stage name', () => {
    const meta = makeExtractionMeta();
    for (const stage of getWorkflow('extraction').stages) {
      const prompt = generateStagePrompt(meta, stage.name);
      expect(prompt).toContain(`Stage: ${stage.name}`);
      expect(prompt).toContain('Workflow mode: extraction');
    }
  });
});

describe('extraction prompt generation — source/target context', () => {
  it('request-brief prompt includes source and target repo', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'request-brief');
    expect(prompt).toContain('/source/repo');
    expect(prompt).toContain('/target/repo');
    expect(prompt).toContain('source repository');
    expect(prompt).toContain('target repository');
  });

  it('source-architecture-context prompt uses source repo index directory', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'source-architecture-context');
    expect(prompt).toContain('/source/repo/.my-dev-kit');
    expect(prompt).toContain('my-dev-kit');
  });

  it('source-workflow-map prompt writes source-workflow-map.txt', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'source-workflow-map');
    expect(prompt).toContain('artifacts/source-workflow-map.txt');
    expect(prompt).toContain('source-workflow-map.txt');
  });

  it('source-workflow-map prompt does not decide porting in this stage', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'source-workflow-map');
    expect(prompt).toContain('does not decide what to port');
  });

  it('porting-map prompt writes both porting map and do-not-port list', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'porting-map');
    expect(prompt).toContain('artifacts/source-to-target-porting-map.txt');
    expect(prompt).toContain('artifacts/do-not-port-list.txt');
  });

  it('golden-behavior-contract prompt writes golden-behavior-contract.txt', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'golden-behavior-contract');
    expect(prompt).toContain('artifacts/golden-behavior-contract.txt');
    expect(prompt).toContain('GoldenBehaviorContract');
  });

  it('golden-behavior-contract prompt includes specific testable behavior sections', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'golden-behavior-contract');
    expect(prompt).toContain('User-visible behavior');
    expect(prompt).toContain('Non-negotiable regression tests');
    expect(prompt).toContain('Acceptance criteria');
  });

  it('target-architecture prompt writes target-architecture-proposal.txt', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'target-architecture');
    expect(prompt).toContain('artifacts/target-architecture-proposal.txt');
    expect(prompt).toContain('TargetArchitectureProposal');
  });

  it('target-architecture prompt instructs inspecting target repo separately', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'target-architecture');
    expect(prompt).toContain('/target/repo/.my-dev-kit');
  });

  it('behavior-model prompt uses GoldenBehaviorContract as source of truth', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'behavior-model');
    expect(prompt).toContain('GoldenBehaviorContract');
    expect(prompt).toContain('golden-behavior-contract.txt');
  });

  it('pseudocode prompt maps to target architecture not source architecture', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'pseudocode-packet');
    expect(prompt).toContain('target architecture');
    expect(prompt).toContain('golden-behavior-contract.txt');
  });

  it('test-strategy prompt includes contract/backend/frontend/state/integration/E2E/regression tests', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'test-strategy');
    expect(prompt).toContain('contract tests');
    expect(prompt).toContain('backend unit tests');
    expect(prompt).toContain('frontend component tests');
    expect(prompt).toContain('state behavior tests');
    expect(prompt).toContain('integration tests');
    expect(prompt).toContain('E2E tests');
    expect(prompt).toContain('regression tests');
  });

  it('implementation prompt modifies target repo only by default', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'implementation');
    expect(prompt).toContain('target repository');
    expect(prompt).toContain('read-only evidence');
    expect(prompt).toContain('GoldenBehaviorContract');
  });

  it('implementation prompt references DoNotPortList', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'implementation');
    expect(prompt).toContain('DoNotPortList');
    expect(prompt).toContain('do-not-port-list.txt');
  });

  it('test-implementation prompt adds tests to target repo', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'test-implementation');
    expect(prompt).toContain('target repository');
    expect(prompt).toContain('GoldenBehaviorContract');
    expect(prompt).toContain('test-strategy-packet.txt');
  });

  it('verification prompt runs validation on target repo', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'verification');
    expect(prompt).toContain('target repository');
    expect(prompt).toContain('/target/repo');
  });

  it('judge prompt compares against all extraction artifacts', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'judge');
    expect(prompt).toContain('source-workflow-map.txt');
    expect(prompt).toContain('source-to-target-porting-map.txt');
    expect(prompt).toContain('do-not-port-list.txt');
    expect(prompt).toContain('golden-behavior-contract.txt');
    expect(prompt).toContain('target-architecture-proposal.txt');
    expect(prompt).toContain('GoldenBehaviorContract');
  });

  it('final-report prompt includes all required summary fields', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'final-report');
    expect(prompt).toContain('Source repository');
    expect(prompt).toContain('Target repository');
    expect(prompt).toContain('source-workflow-map.txt');
    expect(prompt).toContain('golden-behavior-contract.txt');
    expect(prompt).toContain('target-architecture-proposal.txt');
    expect(prompt).toContain('Source components reused');
    expect(prompt).toContain('Source components rewritten');
    expect(prompt).toContain('Source components discarded');
  });
});

describe('extraction prompt guardrails', () => {
  const GUARDRAIL_STAGES = getWorkflow('extraction').stages.map((s) => s.name);

  it('no extraction prompt uses the forbidden legacy term', () => {
    const meta = makeExtractionMeta();
    for (const stageName of GUARDRAIL_STAGES) {
      const prompt = generateStagePrompt(meta, stageName);
      expect(prompt).not.toMatch(new RegExp(`\\b${['br', 'idge'].join('')}\\b`, 'i'));
    }
  });

  it('pre-implementation extraction prompts prohibit implementing in that stage', () => {
    const meta = makeExtractionMeta();
    const preImpl = ['request-brief', 'source-architecture-context', 'source-workflow-map', 'porting-map', 'golden-behavior-contract', 'target-architecture'];
    for (const stageName of preImpl) {
      const prompt = generateStagePrompt(meta, stageName);
      expect(prompt).toContain('do not start implementing');
    }
  });

  it('extraction prompts include the source-is-evidence guardrail', () => {
    const meta = makeExtractionMeta();
    const earlyStages = ['request-brief', 'source-architecture-context', 'source-workflow-map', 'porting-map'];
    for (const stageName of earlyStages) {
      const prompt = generateStagePrompt(meta, stageName);
      expect(prompt).toContain('evidence, not destiny');
    }
  });

  it('source-architecture-context prompt prohibits modifying the source repo', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'source-architecture-context');
    expect(prompt).toContain('Do not modify the source repository');
  });

  it('implementation prompt prohibits porting DoNotPortList systems', () => {
    const meta = makeExtractionMeta();
    const prompt = generateStagePrompt(meta, 'implementation');
    expect(prompt).toContain('DoNotPortList');
  });
});
