import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  checkArtifactContract,
  checkRunArtifactContracts,
  resolveArtifactContractsForMode,
  isSectionPlaceholderContent,
} from '../contractChecker';
import { RunMetadata } from '../run';
import { VALID_MODES } from '../types';
import { resolveArtifactKind, getArtifactSectionRequirements } from '../artifactChecker';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-contract-test-'));
}

function writeArtifact(dir: string, relPath: string, content: string): string {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

const VALID_REQUEST_BRIEF = [
  'Artifact: RequestBrief',
  'Workflow mode: feature',
  'Original request: Add logging',
  'Requested change: Add structured logging',
  'Target area: pipeline',
  'User-visible or external behavior: logs appear in output',
  'Constraints: must not break existing tests',
  'Non-goals: no log aggregation',
  'Success criteria: logs visible',
  'Ambiguity or missing information: none',
  'Expected next stage: architecture-context',
  'Status: complete',
].join('\n');

const MINIMAL_ARCH_CONTEXT = [
  'Artifact: ArchitectureContextPacket',
  'Workflow mode: feature',
  'Project root: /repo',
  'Relevant files: src/pipeline.ts',
  'Relevant symbols: pipeline, logger',
  'Status: complete',
].join('\n');

function makeRunMeta(
  tmpDir: string,
  mode = 'feature',
  overrides: Partial<RunMetadata> = {},
): RunMetadata {
  const workflow = mode === 'feature'
    ? [
        { name: 'request-brief', artifactFile: 'artifacts/request-brief.txt', promptFile: 'prompts/01-request-brief.prompt.txt' },
        { name: 'architecture-context', artifactFile: 'artifacts/architecture-context-packet.txt', promptFile: 'prompts/02-architecture-context.prompt.txt' },
        { name: 'behavior-model', artifactFile: 'artifacts/behavior-model.txt', promptFile: 'prompts/03-behavior-model.prompt.txt' },
        { name: 'pseudocode-packet', artifactFile: 'artifacts/pseudocode-packet.txt', promptFile: 'prompts/04-pseudocode-packet.prompt.txt' },
        { name: 'test-strategy', artifactFile: 'artifacts/test-strategy-packet.txt', promptFile: 'prompts/05-test-strategy.prompt.txt' },
        { name: 'implementation', artifactFile: 'artifacts/implementation-report.txt', promptFile: 'prompts/06-implementation.prompt.txt' },
        { name: 'test-implementation', artifactFile: 'artifacts/test-implementation-report.txt', promptFile: 'prompts/07-test-implementation.prompt.txt' },
        { name: 'verification', artifactFile: 'artifacts/verification-report.txt', promptFile: 'prompts/08-verification.prompt.txt' },
        { name: 'judge', artifactFile: 'artifacts/judge-report.txt', promptFile: 'prompts/09-judge.prompt.txt' },
        { name: 'final-report', artifactFile: 'artifacts/final-report.txt', promptFile: 'prompts/10-final-report.prompt.txt' },
      ]
    : [];

  return {
    runId: 'test-run-001',
    mode: mode as RunMetadata['mode'],
    request: 'Test request',
    runFolder: tmpDir,
    projectRoot: tmpDir,
    stages: workflow,
    createdAt: new Date().toISOString(),
    currentStage: workflow[0]?.name ?? '',
    status: 'created' as const,
    ...overrides,
  };
}

// ─── isSectionPlaceholderContent ─────────────────────────────────────────────

describe('isSectionPlaceholderContent', () => {
  it('returns true for "TODO"', () => {
    expect(isSectionPlaceholderContent('TODO')).toBe(true);
  });

  it('returns true for "tbd" (case-insensitive)', () => {
    expect(isSectionPlaceholderContent('tbd')).toBe(true);
  });

  it('returns true for "N/A"', () => {
    expect(isSectionPlaceholderContent('N/A')).toBe(true);
  });

  it('returns true for "none"', () => {
    expect(isSectionPlaceholderContent('none')).toBe(true);
  });

  it('returns true for "to be filled"', () => {
    expect(isSectionPlaceholderContent('to be filled')).toBe(true);
  });

  it('returns true for "to be completed"', () => {
    expect(isSectionPlaceholderContent('to be completed')).toBe(true);
  });

  it('returns true for "placeholder"', () => {
    expect(isSectionPlaceholderContent('placeholder')).toBe(true);
  });

  it('returns false for actual content', () => {
    expect(isSectionPlaceholderContent('Add structured logging to the pipeline.')).toBe(false);
  });

  it('returns false for empty string (handled separately)', () => {
    expect(isSectionPlaceholderContent('')).toBe(false);
  });
});

// ─── checkArtifactContract ────────────────────────────────────────────────────

describe('checkArtifactContract', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('passes for a valid artifact with all required sections', () => {
    writeArtifact(tmpDir, 'artifacts/request-brief.txt', VALID_REQUEST_BRIEF);
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/request-brief.txt',
      'request-brief',
      'feature',
      [],
    );
    expect(result.passed).toBe(true);
    expect(result.issues.filter((i) => i.severity === 'fail')).toHaveLength(0);
  });

  it('fails for unknown mode', () => {
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/request-brief.txt',
      'request-brief',
      'unknown-mode',
      [],
    );
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'CONTRACT_UNKNOWN_MODE')).toBe(true);
  });

  it('fails for unknown stage in mode', () => {
    writeArtifact(tmpDir, 'artifacts/request-brief.txt', VALID_REQUEST_BRIEF);
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/request-brief.txt',
      'observed-behavior-report', // repair-only, not in feature
      'feature',
      [],
    );
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'CONTRACT_UNKNOWN_STAGE')).toBe(true);
  });

  it('fails for missing artifact file', () => {
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/request-brief.txt',
      'request-brief',
      'feature',
      [],
    );
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'CONTRACT_MISSING_FILE')).toBe(true);
  });

  it('fails for empty artifact file', () => {
    writeArtifact(tmpDir, 'artifacts/request-brief.txt', '');
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/request-brief.txt',
      'request-brief',
      'feature',
      [],
    );
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'CONTRACT_EMPTY_FILE')).toBe(true);
  });

  it('fails for missing required section', () => {
    writeArtifact(
      tmpDir,
      'artifacts/request-brief.txt',
      'Artifact: RequestBrief\nWorkflow mode: feature\nStatus: complete',
    );
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/request-brief.txt',
      'request-brief',
      'feature',
      [],
    );
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'CONTRACT_MISSING_SECTION')).toBe(true);
  });

  it('warns for blank required section in normal mode', () => {
    const content = VALID_REQUEST_BRIEF.replace(
      'Constraints: must not break existing tests',
      'Constraints:',
    );
    writeArtifact(tmpDir, 'artifacts/request-brief.txt', content);
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/request-brief.txt',
      'request-brief',
      'feature',
      [],
    );
    expect(result.passed).toBe(true);
    expect(result.issues.some((i) => i.code === 'CONTRACT_BLANK_SECTION' && i.severity === 'warn')).toBe(true);
  });

  it('fails for blank required section in strict mode', () => {
    const content = VALID_REQUEST_BRIEF.replace(
      'Constraints: must not break existing tests',
      'Constraints:',
    );
    writeArtifact(tmpDir, 'artifacts/request-brief.txt', content);
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/request-brief.txt',
      'request-brief',
      'feature',
      [],
      { strict: true },
    );
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'CONTRACT_BLANK_SECTION' && i.severity === 'fail')).toBe(true);
  });

  it('warns for placeholder-only required section in normal mode', () => {
    const content = VALID_REQUEST_BRIEF.replace(
      'Constraints: must not break existing tests',
      'Constraints: TODO',
    );
    writeArtifact(tmpDir, 'artifacts/request-brief.txt', content);
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/request-brief.txt',
      'request-brief',
      'feature',
      [],
    );
    expect(result.passed).toBe(true);
    expect(
      result.issues.some((i) => i.code === 'CONTRACT_PLACEHOLDER_SECTION' && i.severity === 'warn'),
    ).toBe(true);
  });

  it('fails for placeholder-only required section in strict mode', () => {
    const content = VALID_REQUEST_BRIEF.replace(
      'Constraints: must not break existing tests',
      'Constraints: n/a',
    );
    writeArtifact(tmpDir, 'artifacts/request-brief.txt', content);
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/request-brief.txt',
      'request-brief',
      'feature',
      [],
      { strict: true },
    );
    expect(result.passed).toBe(false);
    expect(
      result.issues.some((i) => i.code === 'CONTRACT_PLACEHOLDER_SECTION' && i.severity === 'fail'),
    ).toBe(true);
  });

  it('warns for missing predecessor artifact in normal mode', () => {
    writeArtifact(tmpDir, 'artifacts/architecture-context-packet.txt', MINIMAL_ARCH_CONTEXT);
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/architecture-context-packet.txt',
      'architecture-context',
      'feature',
      ['artifacts/request-brief.txt'], // predecessor missing
    );
    expect(result.passed).toBe(true);
    expect(result.issues.some((i) => i.code === 'CONTRACT_PREDECESSOR_MISSING' && i.severity === 'warn')).toBe(true);
  });

  it('fails for missing predecessor artifact in strict mode', () => {
    writeArtifact(tmpDir, 'artifacts/architecture-context-packet.txt', MINIMAL_ARCH_CONTEXT);
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/architecture-context-packet.txt',
      'architecture-context',
      'feature',
      ['artifacts/request-brief.txt'],
      { strict: true },
    );
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'CONTRACT_PREDECESSOR_MISSING' && i.severity === 'fail')).toBe(true);
  });

  it('warns for stage with no section contract (mode-specific artifact)', () => {
    writeArtifact(tmpDir, 'artifacts/observed-behavior-report.txt', 'Observed: the import fails\n');
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/observed-behavior-report.txt',
      'observed-behavior-report',
      'repair',
      [],
    );
    expect(result.passed).toBe(true);
    expect(result.issues.some((i) => i.code === 'CONTRACT_STAGE_NO_CONTRACT' && i.severity === 'warn')).toBe(true);
  });

  it('fails for stage with no section contract in strict mode', () => {
    writeArtifact(tmpDir, 'artifacts/observed-behavior-report.txt', 'Observed: the import fails\n');
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/observed-behavior-report.txt',
      'observed-behavior-report',
      'repair',
      [],
      { strict: true },
    );
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'CONTRACT_STAGE_NO_CONTRACT' && i.severity === 'fail')).toBe(true);
  });

  it('includes artifactKind in result', () => {
    writeArtifact(tmpDir, 'artifacts/request-brief.txt', VALID_REQUEST_BRIEF);
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/request-brief.txt',
      'request-brief',
      'feature',
      [],
    );
    expect(result.artifactKind).toBe('RequestBrief');
  });

  it('includes stageName and mode in result', () => {
    writeArtifact(tmpDir, 'artifacts/request-brief.txt', VALID_REQUEST_BRIEF);
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/request-brief.txt',
      'request-brief',
      'feature',
      [],
    );
    expect(result.stageName).toBe('request-brief');
    expect(result.mode).toBe('feature');
  });

  it('includes suggestedFix in issues', () => {
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/request-brief.txt',
      'request-brief',
      'feature',
      [],
    );
    const missingFile = result.issues.find((i) => i.code === 'CONTRACT_MISSING_FILE');
    expect(missingFile?.suggestedFix).toBeDefined();
  });
});

// ─── checkRunArtifactContracts ────────────────────────────────────────────────

describe('checkRunArtifactContracts', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns modeValid false for unknown mode', () => {
    const meta = makeRunMeta(tmpDir, 'unknown-mode' as never);
    const result = checkRunArtifactContracts(meta);
    expect(result.modeValid).toBe(false);
    expect(result.modeIssues.some((i) => i.code === 'CONTRACT_UNKNOWN_MODE')).toBe(true);
  });

  it('flags unknown stage in run metadata', () => {
    const meta = makeRunMeta(tmpDir, 'feature', {
      stages: [
        {
          name: 'not-a-stage' as never,
          artifactFile: 'artifacts/not-a-stage.txt',
          promptFile: 'prompts/01-not-a-stage.prompt.txt',
        },
      ],
    });
    const result = checkRunArtifactContracts(meta);
    expect(result.modeValid).toBe(true);
    expect(result.modeIssues.some((i) => i.code === 'CONTRACT_UNKNOWN_STAGE')).toBe(true);
  });

  it('returns results for all expected stages', () => {
    const meta = makeRunMeta(tmpDir, 'feature');
    const result = checkRunArtifactContracts(meta);
    expect(result.results.length).toBe(10); // feature has 10 stages
  });

  it('all results fail when no artifacts exist', () => {
    const meta = makeRunMeta(tmpDir, 'feature');
    const result = checkRunArtifactContracts(meta);
    const fails = result.results.filter((r) => !r.passed);
    expect(fails.length).toBeGreaterThan(0);
  });

  it('passes for run with all valid artifacts', () => {
    const meta = makeRunMeta(tmpDir, 'feature');
    // Write just the first stage artifact with valid content
    writeArtifact(tmpDir, 'artifacts/request-brief.txt', VALID_REQUEST_BRIEF);
    const result = checkRunArtifactContracts(meta);
    const requestBriefResult = result.results.find((r) => r.stageName === 'request-brief');
    expect(requestBriefResult?.passed).toBe(true);
  });

  it('propagates strict mode to results', () => {
    const meta = makeRunMeta(tmpDir, 'feature');
    writeArtifact(tmpDir, 'artifacts/request-brief.txt', VALID_REQUEST_BRIEF);
    writeArtifact(tmpDir, 'artifacts/architecture-context-packet.txt', MINIMAL_ARCH_CONTEXT);
    const result = checkRunArtifactContracts(meta, { strict: true });
    // Architecture-context has no predecessor file in place for the request-brief check
    // because in the fixture request-brief IS present, but architecture-context's predecessor
    // is request-brief, and it IS there, so no predecessor warn
    // But pseudocode-packet has no predecessor behavior-model written, so predecessor warn->fail in strict
    const pse = result.results.find((r) => r.stageName === 'pseudocode-packet');
    expect(pse?.issues.some((i) => i.code === 'CONTRACT_PREDECESSOR_MISSING')).toBe(true);
    expect(pse?.issues.find((i) => i.code === 'CONTRACT_PREDECESSOR_MISSING')?.severity).toBe('fail');
  });

  it('includes runId and mode in result', () => {
    const meta = makeRunMeta(tmpDir, 'feature');
    const result = checkRunArtifactContracts(meta);
    expect(result.runId).toBe('test-run-001');
    expect(result.mode).toBe('feature');
  });
});

// ─── resolveArtifactContractsForMode ─────────────────────────────────────────

describe('resolveArtifactContractsForMode', () => {
  it('returns null for unknown mode', () => {
    expect(resolveArtifactContractsForMode('unknown')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveArtifactContractsForMode('')).toBeNull();
  });

  it('resolves feature mode contracts', () => {
    const summary = resolveArtifactContractsForMode('feature');
    expect(summary).not.toBeNull();
    expect(summary!.mode).toBe('feature');
    expect(summary!.stages.length).toBe(10);
  });

  it('feature mode first stage has no predecessors', () => {
    const summary = resolveArtifactContractsForMode('feature')!;
    expect(summary.stages[0].stageName).toBe('request-brief');
    expect(summary.stages[0].predecessors).toHaveLength(0);
  });

  it('feature mode second stage has first stage as predecessor', () => {
    const summary = resolveArtifactContractsForMode('feature')!;
    expect(summary.stages[1].stageName).toBe('architecture-context');
    expect(summary.stages[1].predecessors).toContain('artifacts/request-brief.txt');
  });

  it('resolves repair mode contracts', () => {
    const summary = resolveArtifactContractsForMode('repair');
    expect(summary).not.toBeNull();
    expect(summary!.mode).toBe('repair');
    expect(summary!.stages[0].stageName).toBe('observed-behavior-report');
  });

  it('resolves test mode contracts', () => {
    const summary = resolveArtifactContractsForMode('test');
    expect(summary).not.toBeNull();
    expect(summary!.stages[0].stageName).toBe('test-target-brief');
  });

  it('resolves refactor mode contracts', () => {
    const summary = resolveArtifactContractsForMode('refactor');
    expect(summary).not.toBeNull();
    expect(summary!.stages[0].stageName).toBe('refactor-brief');
  });

  it('resolves harden mode contracts', () => {
    const summary = resolveArtifactContractsForMode('harden');
    expect(summary).not.toBeNull();
    expect(summary!.stages[0].stageName).toBe('hardening-brief');
  });

  it('resolves extraction mode contracts', () => {
    const summary = resolveArtifactContractsForMode('extraction');
    expect(summary).not.toBeNull();
    expect(summary!.stages[0].stageName).toBe('request-brief');
  });

  it('includes requiredSections for stages with contracts', () => {
    const summary = resolveArtifactContractsForMode('feature')!;
    const requestBrief = summary.stages.find((s) => s.stageName === 'request-brief')!;
    expect(requestBrief.requiredSections.length).toBeGreaterThan(0);
    expect(requestBrief.requiredSections).toContain('Artifact');
    expect(requestBrief.requiredSections).toContain('Status');
  });

  it('returns empty requiredSections for stages without contracts', () => {
    const summary = resolveArtifactContractsForMode('repair')!;
    const obr = summary.stages.find((s) => s.stageName === 'observed-behavior-report')!;
    expect(obr.requiredSections).toHaveLength(0);
  });

  it('resolves for all valid modes without throwing', () => {
    for (const mode of VALID_MODES) {
      expect(() => resolveArtifactContractsForMode(mode)).not.toThrow();
      expect(resolveArtifactContractsForMode(mode)).not.toBeNull();
    }
  });
});

// ─── v0.5.0 DesignMap contract compatibility ──────────────────────────────────

describe('v0.5.0 DesignMap contract', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves DesignMap artifact kind for design-map stage', () => {
    // design-map is not in the feature workflow stages directly, but via STAGE_TO_KIND
    // The contract checker resolves it via resolveArtifactKind
    const content = [
      'Artifact: DesignMap',
      'DesignMap: v1',
      'Workflow mode: feature',
      'Inputs used: all artifacts',
      'Trace ID registry: see below',
      'Requirement links: none',
      'Context links: none',
      'Behavior links: none',
      'Invariant links: none',
      'Transition links: none',
      'Pseudocode links: none',
      'Test responsibility links: none',
      'Implementation links: none',
      'Verification links: none',
      'Risk links: none',
      'Orphan or missing links: none',
      'Trace gaps: none',
      'Status: complete',
    ].join('\n');
    writeArtifact(tmpDir, 'artifacts/design-map.txt', content);

    // design-map is its own stage kind - use feature mode with a fake stage
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/design-map.txt',
      'design-map',
      'feature',
      [],
    );
    // design-map is not in feature workflow stages, so CONTRACT_UNKNOWN_STAGE expected
    expect(result.issues.some((i) => i.code === 'CONTRACT_UNKNOWN_STAGE')).toBe(true);
  });

  it('recognizes DesignMap section requirements via artifactChecker', () => {
    const kind = resolveArtifactKind('design-map');
    expect(kind).toBe('DesignMap');
    const reqs = getArtifactSectionRequirements('DesignMap');
    expect(reqs).not.toBeNull();
    expect(reqs!.required).toContain('Trace ID registry');
  });
});

// ─── v0.6.0 JudgeReport compatibility ────────────────────────────────────────

describe('v0.6.0 JudgeReport contract', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('passes for valid JudgeReport with Verdict section', () => {
    const content = [
      'Artifact: JudgeReport',
      'Workflow mode: feature',
      'Verdict: PASS',
      'Status: complete',
    ].join('\n');
    writeArtifact(tmpDir, 'artifacts/judge-report.txt', content);
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/judge-report.txt',
      'judge',
      'feature',
      [],
    );
    expect(result.passed).toBe(true);
    expect(result.artifactKind).toBe('JudgeReport');
  });

  it('fails for JudgeReport missing Verdict section', () => {
    const content = [
      'Artifact: JudgeReport',
      'Workflow mode: feature',
      'Status: complete',
    ].join('\n');
    writeArtifact(tmpDir, 'artifacts/judge-report.txt', content);
    const result = checkArtifactContract(
      tmpDir,
      'artifacts/judge-report.txt',
      'judge',
      'feature',
      [],
    );
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'CONTRACT_MISSING_SECTION' && i.section === 'Verdict')).toBe(true);
  });
});

// ─── Mode parity: all modes have contracts ────────────────────────────────────

describe('mode parity', () => {
  it.each(VALID_MODES as readonly string[])(
    'mode %s resolves non-null contracts',
    (mode) => {
      const summary = resolveArtifactContractsForMode(mode);
      expect(summary).not.toBeNull();
      expect(summary!.stages.length).toBeGreaterThan(0);
    },
  );

  it('feature mode has 10 stages', () => {
    const summary = resolveArtifactContractsForMode('feature')!;
    expect(summary.stages.length).toBe(10);
  });

  it('repair mode has 11 stages', () => {
    const summary = resolveArtifactContractsForMode('repair')!;
    expect(summary.stages.length).toBe(11);
  });

  it('test mode has 9 stages', () => {
    const summary = resolveArtifactContractsForMode('test')!;
    expect(summary.stages.length).toBe(9);
  });

  it('refactor mode has 11 stages', () => {
    const summary = resolveArtifactContractsForMode('refactor')!;
    expect(summary.stages.length).toBe(11);
  });

  it('harden mode has 11 stages', () => {
    const summary = resolveArtifactContractsForMode('harden')!;
    expect(summary.stages.length).toBe(11);
  });

  it('extraction mode has 14 stages', () => {
    const summary = resolveArtifactContractsForMode('extraction')!;
    expect(summary.stages.length).toBe(14);
  });
});

// ─── Stage predecessor chain integrity ────────────────────────────────────────

describe('predecessor chain', () => {
  it('feature mode pseudocode-packet predecessor is behavior-model', () => {
    const summary = resolveArtifactContractsForMode('feature')!;
    const pse = summary.stages.find((s) => s.stageName === 'pseudocode-packet')!;
    expect(pse.predecessors).toContain('artifacts/behavior-model.txt');
  });

  it('feature mode implementation predecessor is test-strategy', () => {
    const summary = resolveArtifactContractsForMode('feature')!;
    const impl = summary.stages.find((s) => s.stageName === 'implementation')!;
    expect(impl.predecessors).toContain('artifacts/test-strategy-packet.txt');
  });

  it('feature mode judge predecessor is verification', () => {
    const summary = resolveArtifactContractsForMode('feature')!;
    const judge = summary.stages.find((s) => s.stageName === 'judge')!;
    expect(judge.predecessors).toContain('artifacts/verification-report.txt');
  });
});
