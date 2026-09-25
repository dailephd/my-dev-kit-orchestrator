// v1.5.0 Batch 5: Semantic Continuity activation and prompt authoring contract.
//
// Covers (1) automatic activation through the real `start` command,
// (2) the conditional prompt contract for every stage role in every activated
// mode, (3) legacy / greenfield / proof-only prompt isolation, (4) RSP
// propagation into context-refresh prompts, and (5) the live `prompt`
// command's semantic-blocked behavior. Continuity policy itself is owned by
// Batches 0-4; this file only proves the prompts teach and enforce it.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRun, getMostRecentRun, RunMetadata } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { getWorkflow } from '../src/workflows';
import { WorkflowMode } from '../src/types';
import { generateCorrectionPrompt, generateStagePrompt, writeStagePrompts } from '../src/promptGenerator';
import { CorrectionRouteResult } from '../src/correctionRouter';
import {
  isSemanticContinuityPromptActive,
  semanticPromptRoleForStage,
  shouldActivateSemanticContinuity,
} from '../src/instructions/semanticContinuityPrompt';
import { findTestStrategySourceRequirement, TEST_STRATEGY_SOURCE_REQUIREMENTS } from '../src/instructions/testResponsibilityCriticality';
import { runCli } from './cliTestHelpers';
import { makeSemanticRun, strategyBlock, writePriorArtifacts } from './semanticRunTestHelpers';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { parseDeclaredTraceIds } from '../src/traceChecker';

const ACTIVATED_MODES: WorkflowMode[] = ['feature', 'repair', 'test', 'refactor', 'harden', 'extraction'];
const MARKER = 'SEMANTIC CONTINUITY';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-semantic-prompt-'));
}

function withTmp<T>(fn: (tmp: string) => T): T {
  const tmp = tmpDir();
  try {
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function newRun(tmp: string, mode: WorkflowMode, version?: string): RunMetadata {
  initWorkspace(tmp);
  return createRun({
    request: 'add configuration validation',
    mode,
    projectRoot: tmp,
    ...(mode === 'extraction' ? { sourceRepoRoot: path.join(tmp, 'src-repo'), targetRepoRoot: tmp } : {}),
    ...(version !== undefined ? { semanticContinuityVersion: version } : {}),
  });
}

// Activated run with ready repository context, so implementation/test-implementation
// render their normal (not refresh-only) prompts.
function readyRun(tmp: string, mode: WorkflowMode): RunMetadata {
  const meta = newRun(tmp, mode, '1.0.0');
  makeReadyRunFolder(meta.runFolder, mode);
  return meta;
}

function strategyStageOf(mode: WorkflowMode): string {
  return (findTestStrategySourceRequirement(mode) as { strategyStageId: string }).strategyStageId.replace(`stage.${mode}.`, '');
}

function stagesWithRole(mode: WorkflowMode, role: string): string[] {
  return getWorkflow(mode)
    .stages.map((s) => s.name)
    .filter((name) => semanticPromptRoleForStage(mode, name) === role);
}

// ─── Activation through the real `start` command ────────────────────────────

describe('automatic activation through `start`', () => {
  function startAndLoad(args: string[], root: string): { meta: RunMetadata; output: string } {
    const { output, exitCode } = runCli(['start', 'activation smoke', '--root', root, ...args]);
    expect(exitCode).toBeUndefined();
    const meta = getMostRecentRun(root) as RunMetadata;
    return { meta, output };
  }

  it.each(ACTIVATED_MODES.filter((m) => m !== 'extraction'))('%s run persists semanticContinuityVersion 1.0.0', (mode) => {
    withTmp((tmp) => {
      const { meta, output } = startAndLoad(['--mode', mode], tmp);
      const persisted = JSON.parse(fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8'));
      expect(persisted.semanticContinuityVersion).toBe('1.0.0');
      expect(output).toContain('Semantic continuity:\n  active (1.0.0)');
    });
  });

  it('extraction run persists semanticContinuityVersion 1.0.0', () => {
    withTmp((tmp) => {
      const source = path.join(tmp, 'source');
      const target = path.join(tmp, 'target');
      fs.mkdirSync(source);
      fs.mkdirSync(target);
      const { meta, output } = startAndLoad(['--mode', 'extraction', '--source', source, '--target', target], target);
      expect(meta.semanticContinuityVersion).toBe('1.0.0');
      expect(output).toContain('Semantic continuity:\n  active (1.0.0)');
    });
  });

  it('greenfield does not auto-activate and reports no active continuity', () => {
    withTmp((tmp) => {
      const { meta, output } = startAndLoad(['--mode', 'greenfield'], tmp);
      const persisted = JSON.parse(fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8'));
      expect('semanticContinuityVersion' in persisted).toBe(false);
      expect(output).not.toContain('Semantic continuity');
    });
  });

  it('proof-only does not auto-activate', () => {
    withTmp((tmp) => {
      const { meta, output } = startAndLoad(['--mode', 'feature', '--proof-only', '--verification-responsibility', 'proof/result.txt'], tmp);
      const persisted = JSON.parse(fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8'));
      expect('semanticContinuityVersion' in persisted).toBe(false);
      expect(persisted.proofOnly).toBe(true);
      expect(output).not.toContain('Semantic continuity');
    });
  });

  it('bare programmatic createRun() without a version stays legacy', () => {
    withTmp((tmp) => {
      const meta = newRun(tmp, 'feature');
      const persisted = JSON.parse(fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8'));
      expect('semanticContinuityVersion' in persisted).toBe(false);
    });
  });

  it('the activated-mode set is derived from the strategy registry, not a second list', () => {
    const derived = TEST_STRATEGY_SOURCE_REQUIREMENTS.map((r) => r.mode).sort();
    expect(derived).toEqual([...ACTIVATED_MODES].sort());
    for (const mode of ACTIVATED_MODES) expect(shouldActivateSemanticContinuity(mode, false)).toBe(true);
    expect(shouldActivateSemanticContinuity('greenfield', false)).toBe(false);
    expect(shouldActivateSemanticContinuity('feature', true)).toBe(false);
  });

  it('adds no activation flag and no new mode or command', () => {
    const help = runCli(['start', '--help']).output;
    for (const flag of ['--semantic', '--continuity', '--rsp', '--direct', '--full-stage-context']) {
      expect(help).not.toContain(flag);
    }
    expect(runCli(['status', '--help']).output).not.toContain('--json');
  });
});

// ─── Prompt predicate ───────────────────────────────────────────────────────

describe('prompt activation predicate', () => {
  it('is active only for version 1.0.0 in a capable, non-proof-only mode', () => {
    expect(isSemanticContinuityPromptActive({ mode: 'feature', semanticContinuityVersion: '1.0.0' })).toBe(true);
    expect(isSemanticContinuityPromptActive({ mode: 'feature' })).toBe(false);
    expect(isSemanticContinuityPromptActive({ mode: 'feature', semanticContinuityVersion: '9.9.9' })).toBe(false);
    expect(isSemanticContinuityPromptActive({ mode: 'greenfield', semanticContinuityVersion: '1.0.0' })).toBe(false);
    expect(isSemanticContinuityPromptActive({ mode: 'feature', semanticContinuityVersion: '1.0.0', proofOnly: true })).toBe(false);
  });
});

// ─── Upstream trace authoring ───────────────────────────────────────────────

describe('upstream trace authoring guidance', () => {
  it.each(ACTIVATED_MODES)('%s: every pre-strategy stage teaches canonical trace declarations', (mode) => {
    withTmp((tmp) => {
      const meta = newRun(tmp, mode, '1.0.0');
      const upstream = stagesWithRole(mode, 'upstream');
      expect(upstream.length).toBeGreaterThan(0);
      for (const stage of upstream) {
        const prompt = generateStagePrompt(meta, stage);
        expect(prompt).toContain('UPSTREAM TRACE AUTHORING');
        for (const prefix of ['REQ', 'CTX', 'BEH', 'INV', 'TRN', 'PSE']) expect(prompt).toContain(`${prefix} = `);
        expect(prompt).toContain('BEH-001: Reject malformed configuration before execution.');
        expect(prompt).toContain('INV-001: Invalid configuration never reaches command execution.');
        expect(prompt).toContain('TRN-001: invalid-input -> validation-error');
        expect(prompt).toContain('preserve an existing trace ID when correcting the same semantic item');
        expect(prompt).toContain('do not renumber unaffected IDs');
        expect(prompt).toContain('do not reuse an existing ID for a different meaning');
        expect(prompt).toContain('add new IDs using a new unused canonical number');
        expect(prompt).toContain('do not fabricate a trace link');
        expect(prompt).toContain('not every prefix is required in every artifact');
      }
    });
  });

  it('every canonical declaration the prompt teaches is recognized by the declaration parser', () => {
    withTmp((tmp) => {
      const prompt = generateStagePrompt(newRun(tmp, 'feature', '1.0.0'), 'request-brief');
      const taught = prompt.split('\n').filter((l) => /^\s+(BEH|INV|TRN)-\d{3}: /.test(l));
      expect(taught).toHaveLength(3);
      expect(parseDeclaredTraceIds(taught.join('\n')).map((t) => t.id)).toEqual(['BEH-001', 'INV-001', 'TRN-001']);
    });
  });

  it('a link expression still does not declare its target, but a declaration containing "->" does', () => {
    const declared = (text: string) => parseDeclaredTraceIds(text).map((t) => t.id);
    expect(declared('REQ-001 -> BEH-999\n')).toEqual([]);
    expect(declared('TRN-002: idle -> running\n- INV-003: stays true\n')).toEqual(['TRN-002', 'INV-003']);
  });

  it('does not teach trace authoring after the strategy stage', () => {
    withTmp((tmp) => {
      const meta = newRun(tmp, 'feature', '1.0.0');
      expect(generateStagePrompt(meta, 'implementation')).not.toContain('UPSTREAM TRACE AUTHORING');
      expect(generateStagePrompt(meta, 'final-report')).not.toContain(MARKER);
    });
  });
});

// ─── Strategy RSP authoring ─────────────────────────────────────────────────

describe('strategy responsibility authoring guidance', () => {
  it.each(ACTIVATED_MODES)('%s: the mode-owned strategy stage requires canonical RSP blocks', (mode) => {
    withTmp((tmp) => {
      const meta = newRun(tmp, mode, '1.0.0');
      const stage = strategyStageOf(mode);
      expect(stagesWithRole(mode, 'strategy')).toEqual([stage]);
      const prompt = generateStagePrompt(meta, stage);
      for (const field of [
        'test responsibility ID: RSP-001',
        'criticality: critical',
        'criticality: critical | noncritical',
        'responsibility: Reject malformed configuration before execution',
        'traces to: REQ-002, BEH-004, INV-003',
        'setup: malformed configuration input',
        'action or trigger: invoke configuration validation',
        'expected result: validation fails before execution begins',
        'test level: unit',
      ]) {
        expect(prompt).toContain(field);
      }
      expect(prompt).toContain('at least one canonical RSP responsibility must exist');
      expect(prompt).toContain('ACTUALLY DECLARED');
      expect(prompt).toContain('do not invent trace IDs');
      expect(prompt).toContain('stop and report which upstream');
      expect(prompt).toContain('do not substitute TST-NNN for RSP-NNN');
      expect(prompt).toContain('Do not mark a required responsibility noncritical merely to avoid a blocking gate.');
      expect(prompt).toContain('critical    = absence or failure would violate explicit requested behavior');
      expect(prompt).toContain('noncritical = supplementary coverage');
      expect(prompt).toContain('preserve the RSP ID of a responsibility whose meaning is preserved');
      expect(prompt).toContain('do not renumber unchanged responsibilities');
      expect(prompt).toContain('remove obsolete responsibilities rather than silently repurposing their IDs');
      // Lists the actual upstream artifacts of this mode.
      const firstUpstream = getWorkflow(mode).stages[0].artifactFile;
      expect(prompt).toContain(firstUpstream);
    });
  });
});

// ─── Implementation / test-implementation / verification ───────────────────

describe('implementation mapping guidance', () => {
  it.each(ACTIVATED_MODES.filter((m) => m !== 'test'))('%s: requires RSP -> production mapping and post-change refresh', (mode) => {
    withTmp((tmp) => {
      const prompt = generateStagePrompt(readyRun(tmp, mode), 'implementation');
      expect(prompt).toContain('implementation responsibility ID: RSP-001');
      expect(prompt).toContain('production file: src/config/schema.ts');
      expect(prompt).toContain('production symbol: symbol:src/config/validate.ts#validateConfig');
      expect(prompt).toContain('at least one "production file:" or "production symbol:" line');
      expect(prompt).toContain('does NOT prove semantic causality');
      expect(prompt).toContain('do not claim every');
      expect(prompt).toContain('Post-change evidence refresh (REQUIRED before this stage is ready to advance)');
      expect(prompt).toContain('"testResponsibilityRefs"');
      expect(prompt).toContain('"responsibility-mappings"');
      expect(prompt).toContain('do not replace the existing required evidence kinds');
      expect(prompt).toContain('Do not create a new semantic context artifact');
      expect(prompt).toContain('Do not claim verification success');
    });
  });

  it('extraction scopes production identity to the TARGET repository', () => {
    withTmp((tmp) => {
      const prompt = generateStagePrompt(readyRun(tmp, 'extraction'), 'implementation');
      expect(prompt).toContain('TARGET repository identities');
      expect(prompt).toContain('source file is never implementation evidence');
      expect(prompt).toContain('Target repository:');
    });
  });

  it('test mode has no native implementation stage and gets no production implementation contract', () => {
    withTmp((tmp) => {
      const meta = readyRun(tmp, 'test');
      expect(meta.stages.some((s) => s.name === 'implementation')).toBe(false);
      for (const stage of meta.stages) {
        const prompt = generateStagePrompt(meta, stage.name);
        expect(prompt).not.toMatch(/^s*implementation responsibility ID:/m);
        expect(prompt).not.toContain('production file:');
      }
      expect(generateStagePrompt(meta, 'test-implementation')).toContain('no production implementation responsibility blocks are required');
    });
  });
});

describe('test implementation mapping guidance', () => {
  it.each(ACTIVATED_MODES)('%s: requires RSP -> test-file mapping and post-test refresh, file-level only', (mode) => {
    withTmp((tmp) => {
      const prompt = generateStagePrompt(readyRun(tmp, mode), 'test-implementation');
      expect(prompt).toContain('test implementation responsibility ID: RSP-001');
      expect(prompt).toContain('test file: tests/config/validate.spec.ts');
      expect(prompt).toContain('exact project-relative "test file:" line');
      expect(prompt).toContain('file-level only');
      expect(prompt).not.toContain('test symbol:');
      expect(prompt).toContain('Post-test evidence refresh (REQUIRED before this stage is ready to advance)');
      expect(prompt).toContain('"testResponsibilityRefs"');
      expect(prompt).toContain('"responsibility-mappings"');
      expect(prompt).toContain('closest tests and test-infrastructure');
      expect(prompt).toContain('does not prove the assertions are correct or that the tests were executed');
    });
  });

  it('extraction scopes test files to the TARGET repository', () => {
    withTmp((tmp) => {
      expect(generateStagePrompt(readyRun(tmp, 'extraction'), 'test-implementation')).toContain('TARGET repository identities');
    });
  });
});

describe('verification attribution guidance', () => {
  it.each(ACTIVATED_MODES)('%s: requires a per-RSP verification block', (mode) => {
    withTmp((tmp) => {
      const prompt = generateStagePrompt(newRun(tmp, mode, '1.0.0'), 'verification');
      expect(prompt).toContain('verification responsibility ID: RSP-001');
      expect(prompt).toContain('verification status: pass');
      expect(prompt).toContain('verification evidence:');
      expect(prompt).toContain('command: npm test -- tests/config/validate.spec.ts');
      expect(prompt).toContain('working directory: .');
      expect(prompt).toContain('exit code: 0');
      expect(prompt).toContain('Allowed statuses are exactly: pass | fail | skipped | blocked.');
      expect(prompt).toContain('pass / fail require command-result evidence');
      expect(prompt).toContain('skipped / blocked require a "reason:" line');
      expect(prompt).toContain('do not infer or invent command results');
      expect(prompt).toContain('the same real command evidence may then be referenced under');
      expect(prompt).toContain('does not execute it while parsing');
    });
  });
});

// ─── Judge (saved template) ─────────────────────────────────────────────────

describe('judge template guidance', () => {
  it.each(ACTIVATED_MODES)('%s: judge prompt states the gate-owned policy and no longer says "judge freely"', (mode) => {
    withTmp((tmp) => {
      const meta = makeSemanticRun(tmp, { mode });
      writePriorArtifacts(meta, 'judge');
      const prompt = generateStagePrompt(meta, 'judge');
      expect(prompt).toContain('JUDGE REVIEW');
      expect(prompt).toContain('Do not re-derive semantic continuity from prose');
      expect(prompt).toContain('do not override a canonical NEED_CONTEXT with PASS');
      expect(prompt).toContain('do not invent a stage');
      expect(prompt).toContain('noncritical semantic warnings alone do not require a non-PASS verdict');
      expect(prompt).not.toContain('Judge freely on the complete evidence');
    });
  });
});

// ─── Legacy / greenfield / proof-only isolation ─────────────────────────────

describe('legacy, greenfield, and proof-only prompts are unchanged', () => {
  it.each(ACTIVATED_MODES)('%s: an absent-version run receives no semantic contract in any stage prompt', (mode) => {
    withTmp((tmp) => {
      const meta = newRun(tmp, mode);
      for (const stage of meta.stages) {
        const prompt = generateStagePrompt(meta, stage.name);
        expect(prompt).not.toContain(MARKER);
        expect(prompt).not.toContain('RSP-001');
      }
      // Saved prompt files for a legacy run carry none either.
      for (const stage of meta.stages) {
        expect(fs.readFileSync(path.join(meta.runFolder, stage.promptFile), 'utf8')).not.toContain(MARKER);
      }
    });
  });

  it('a legacy judge prompt keeps its ordinary "judge freely" wording', () => {
    withTmp((tmp) => {
      const meta = makeSemanticRun(tmp, { version: null });
      writePriorArtifacts(meta, 'judge');
      expect(generateStagePrompt(meta, 'judge')).toContain('Judge freely on the complete evidence');
    });
  });

  it('greenfield never receives the semantic contract, even with a version present', () => {
    withTmp((tmp) => {
      const meta = createRun({ request: 'new app', mode: 'greenfield', projectRoot: tmp, semanticContinuityVersion: '1.0.0' });
      for (const stage of meta.stages) expect(generateStagePrompt(meta, stage.name)).not.toContain(MARKER);
    });
  });

  it('proof-only never receives the semantic contract or RSP/responsibility requirements', () => {
    withTmp((tmp) => {
      initWorkspace(tmp);
      const meta = createRun({
        request: 'proof',
        mode: 'feature',
        projectRoot: tmp,
        proofOnly: true,
        verificationResponsibility: 'proof/result.txt',
        semanticContinuityVersion: '1.0.0',
      });
      for (const stage of meta.stages) {
        const prompt = generateStagePrompt(meta, stage.name);
        expect(prompt).not.toContain(MARKER);
        expect(prompt).not.toContain('implementation responsibility ID');
        expect(prompt).not.toContain('test implementation responsibility ID');
      }
      expect(generateStagePrompt(meta, 'verification')).toContain('Proof result: PASS');
    });
  });

  it('an activated run saves the authoring contract into its initial prompt files without live gate state', () => {
    withTmp((tmp) => {
      const meta = newRun(tmp, 'feature', '1.0.0');
      writeStagePrompts(meta);
      const saved = (stage: string) =>
        fs.readFileSync(path.join(meta.runFolder, meta.stages.find((s) => s.name === stage)!.promptFile), 'utf8');
      expect(saved('request-brief')).toContain('UPSTREAM TRACE AUTHORING');
      expect(saved('test-strategy')).toContain('STRATEGY RESPONSIBILITIES');
      // A fresh run's test-implementation template is refresh-only until context is populated;
      // it still carries the RSP request guidance.
      expect(saved('test-implementation')).toContain('Semantic continuity request requirements');
      // Future stages are templates, never permanently "blocked".
      for (const stage of meta.stages) expect(saved(stage.name)).not.toContain('BLOCKED by Semantic Continuity');
    });
  });
});

// ─── Context refresh: RSP propagation ───────────────────────────────────────

function blockContext(meta: RunMetadata, kind: 'implementation' | 'test'): void {
  const files =
    kind === 'implementation'
      ? ['artifacts/implementation-context-packet.txt', 'reports/implementation-context-retrieval-report.txt']
      : ['artifacts/test-context-packet.txt', 'reports/test-context-retrieval-report.txt'];
  for (const rel of files) {
    const p = path.join(meta.runFolder, rel);
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('Status: populated', 'Status: template'), 'utf8');
  }
}

describe('context refresh carries the canonical RSP IDs', () => {
  const TWO = `${strategyBlock('RSP-001')}\n${strategyBlock('RSP-002')}`;

  it.each([
    ['implementation', 'implementation'],
    ['test-implementation', 'test'],
  ] as const)('%s refresh-only prompt lists the exact strategy RSP IDs and responsibility-mappings', (stage, kind) => {
    withTmp((tmp) => {
      const meta = makeSemanticRun(tmp, { strategy: TWO });
      blockContext(meta, kind);
      const prompt = generateStagePrompt(meta, stage);
      expect(prompt).toContain('BLOCKED on repository context');
      expect(prompt).toContain('Canonical semantic responsibility IDs for this run:\n  - RSP-001\n  - RSP-002');
      expect(prompt).toContain("Use exactly these IDs in my-dev-kit's testResponsibilityRefs.");
      expect(prompt).toContain('Do not substitute TST IDs or invent a separate responsibility namespace.');
      expect(prompt).toContain('"testResponsibilityRefs": ["RSP-001", "RSP-002"]');
      expect(prompt).toContain('responsibility-mappings');
      expect(prompt).toContain('do not replace the existing required evidence kinds');
      expect(prompt).not.toContain('RSP-003');
    });
  });

  it('never invents IDs when the strategy cannot provide a valid canonical list', () => {
    withTmp((tmp) => {
      const meta = makeSemanticRun(tmp, { strategy: 'no responsibilities declared here\n' });
      blockContext(meta, 'implementation');
      const prompt = generateStagePrompt(meta, 'implementation');
      expect(prompt).toContain('Canonical semantic responsibility IDs are not available');
      expect(prompt).not.toContain('Canonical semantic responsibility IDs for this run:');
      expect(prompt).toContain('Do not invent IDs');
      expect(prompt).not.toContain('"RSP-001"');
    });
  });

  it('a legacy refresh-only prompt carries no RSP guidance', () => {
    withTmp((tmp) => {
      const meta = makeSemanticRun(tmp, { version: null, strategy: TWO });
      blockContext(meta, 'implementation');
      const prompt = generateStagePrompt(meta, 'implementation');
      expect(prompt).toContain('BLOCKED on repository context');
      expect(prompt).not.toContain('testResponsibilityRefs');
    });
  });

  it('a judge-correction context refresh also lists the exact IDs', () => {
    withTmp((tmp) => {
      const meta = makeSemanticRun(tmp, { strategy: TWO });
      blockContext(meta, 'implementation');
      const route: CorrectionRouteResult = {
        verdict: 'IMPLEMENTATION_MISMATCH',
        recommendedStage: 'implementation',
        routedStage: 'implementation',
        routeStatus: 'correction_required',
        warnings: [],
        errors: [],
        isBlocked: false,
        strictFail: false,
      };
      const prompt = generateCorrectionPrompt(meta, route);
      expect(prompt).toContain('BLOCKED on repository context');
      expect(prompt).toContain('- RSP-001');
      expect(prompt).toContain('- RSP-002');
      expect(prompt).toContain('responsibility-mappings');
    });
  });
});

// ─── Mode-specific strategy correction prompts ──────────────────────────────

describe('mode-specific strategy correction prompts', () => {
  const CASES: Array<{ mode: WorkflowMode; stage: string; kind: string; output: string; inputs: string[] }> = [
    {
      mode: 'repair',
      stage: 'regression-test-strategy',
      kind: 'RegressionTestStrategy',
      output: 'artifacts/regression-test-strategy.txt',
      inputs: ['divergence-report.txt', 'correction-design.txt', 'architecture-context-packet.txt'],
    },
    {
      mode: 'refactor',
      stage: 'compatibility-test-strategy',
      kind: 'CompatibilityTestStrategy',
      output: 'artifacts/compatibility-test-strategy.txt',
      inputs: ['existing-behavior-map.txt', 'preserved-invariant-list.txt', 'architecture-context-packet.txt'],
    },
    {
      mode: 'harden',
      stage: 'resilience-test-strategy',
      kind: 'ResilienceTestStrategy',
      output: 'artifacts/resilience-test-strategy.txt',
      inputs: ['assumption-report.txt', 'failure-mode-matrix.txt', 'guard-pseudocode-packet.txt', 'architecture-context-packet.txt'],
    },
  ];

  it.each(CASES)('$mode: $stage correction uses the exact inputs, output, kind, and RSP contract', ({ mode, stage, kind, output, inputs }) => {
    withTmp((tmp) => {
      const meta = makeSemanticRun(tmp, { mode });
      const route: CorrectionRouteResult = {
        verdict: 'PASS',
        recommendedStage: null,
        routedStage: stage as CorrectionRouteResult['routedStage'],
        routeStatus: 'correction_required',
        warnings: [],
        errors: [],
        isBlocked: false,
        strictFail: false,
      };
      const prompt = generateCorrectionPrompt(meta, route);
      expect(prompt).toContain(`Stage: ${stage} (correction)`);
      for (const input of inputs) expect(prompt).toContain(`${meta.runFolder}/artifacts/${input}`);
      expect(prompt).toContain(`Required output artifact: ${kind}`);
      expect(prompt).toContain(path.join(meta.runFolder, output));
      expect(prompt).toContain('STRATEGY RESPONSIBILITIES');
      expect(prompt).toContain('test responsibility ID: RSP-001');
      expect(prompt).toContain('Keep unaffected RSP IDs and blocks');
      expect(prompt).toContain('do not regenerate or renumber the whole strategy');
      // Never another mode's strategy stage.
      for (const other of CASES.filter((c) => c.stage !== stage)) expect(prompt).not.toContain(other.kind);
    });
  });
});

// ─── Live `prompt` command: semantic-blocked stages ─────────────────────────

describe('semantic-blocked live prompt', () => {
  function livePrompt(tmp: string): string {
    const { output, exitCode } = runCli(['prompt', '--root', tmp]);
    expect(exitCode).toBeUndefined();
    return output;
  }

  it('test-implementation blocked by an implementation gap gets implementation repair guidance, not test writing', () => {
    withTmp((tmp) => {
      const meta = makeSemanticRun(tmp, { impl: null, test: null, ver: null });
      writePriorArtifacts(meta, 'test-implementation');
      const out = livePrompt(tmp);
      expect(out).toContain('Current blocked stage: test-implementation');
      expect(out).toContain('Semantic blocker: SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED');
      expect(out).toContain('Affected responsibility: RSP-001');
      expect(out).toContain('Broken leg: implementation');
      expect(out).toContain('Recommended correction stage: implementation');
      expect(out).toContain('repair ONLY the implementation contract/evidence');
      expect(out).toContain('Required output artifact: ImplementationReport');
      expect(out).toContain('implementation responsibility ID: RSP-001');
      expect(out).toContain('Preserve every unaffected RSP ID');
      // No normal downstream work and no blocked-stage artifact.
      expect(out).not.toContain('TestImplementationReport');
      expect(out).not.toContain('test-implementation-report.txt');
      expect(out).not.toContain('test implementation responsibility ID');
      expect(out).not.toContain('LIFECYCLE CONTEXT');
      expect(out).toContain('do not perform the blocked stage');
    });
  });

  it('verification blocked by a test-implementation gap gets test-implementation repair guidance', () => {
    withTmp((tmp) => {
      const meta = makeSemanticRun(tmp, { test: null, ver: null });
      writePriorArtifacts(meta, 'verification');
      const out = livePrompt(tmp);
      expect(out).toContain('Current blocked stage: verification');
      expect(out).toContain('Broken leg: test-implementation');
      expect(out).toContain('Recommended correction stage: test-implementation');
      expect(out).toContain('Required output artifact: TestImplementationReport');
      expect(out).not.toContain('Required output artifact: VerificationReport');
      expect(out).not.toContain('verification responsibility ID');
    });
  });

  it('judge blocked by a verification gap gets verification repair guidance and the canonical verdict summary', () => {
    withTmp((tmp) => {
      const meta = makeSemanticRun(tmp, { ver: null });
      writePriorArtifacts(meta, 'judge');
      const out = livePrompt(tmp);
      expect(out).toContain('Current blocked stage: judge');
      expect(out).toContain('Broken leg: verification');
      expect(out).toContain('Recommended correction stage: verification');
      expect(out).toContain('Required output artifact: VerificationReport');
      expect(out).toContain('Expected judge verdict: NEED_CONTEXT');
      expect(out).toContain('Blocking responsibility IDs: RSP-001');
      expect(out).toContain('Canonical recommended correction stage: verification');
      expect(out).toContain('Do not return PASS');
      expect(out).not.toContain('Required output artifact: JudgeReport');
    });
  });

  it('an explicit `prompt <stage>` for the blocked stage is blocked the same way', () => {
    withTmp((tmp) => {
      const meta = makeSemanticRun(tmp, { impl: null, test: null, ver: null });
      writePriorArtifacts(meta, 'test-implementation');
      const out = runCli(['prompt', 'test-implementation', '--root', tmp]).output;
      expect(out).toContain('Recommended correction stage: implementation');
      expect(out).not.toContain('TestImplementationReport');
    });
  });

  it('a mode-owned strategy stage is the correction target for repair', () => {
    withTmp((tmp) => {
      const meta = makeSemanticRun(tmp, { mode: 'repair', upstream: 'REQ-001: only one\n', impl: null, test: null, ver: null });
      writePriorArtifacts(meta, 'implementation');
      const out = livePrompt(tmp);
      expect(out).toContain('Recommended correction stage: regression-test-strategy');
      expect(out).toContain('Required output artifact: RegressionTestStrategy');
      expect(out).toContain('Broken leg: strategy');
    });
  });

  it('context-blocked correction target keeps the refresh-only behavior (context blocker wins)', () => {
    withTmp((tmp) => {
      const meta = makeSemanticRun(tmp, { impl: null, test: null, ver: null, strategy: `${strategyBlock('RSP-001')}\n${strategyBlock('RSP-002')}` });
      writePriorArtifacts(meta, 'test-implementation');
      blockContext(meta, 'implementation');
      const out = livePrompt(tmp);
      // Whatever renders must be refresh-only guidance, never a normal repair/work prompt.
      expect(out).toContain('BLOCKED on repository context');
      expect(out).not.toContain('Required output artifact:');
    });
  });

  it('an unsupported contract version returns a blocked prompt with no guessed stage or normal work', () => {
    withTmp((tmp) => {
      makeSemanticRun(tmp, { version: '9.9.9' });
      const out = livePrompt(tmp);
      expect(out).toContain('BLOCKED by Semantic Continuity');
      expect(out).toContain('Semantic blocker: SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED');
      expect(out).toContain('Recommended correction stage: none (external resolution required)');
      expect(out).toContain('external / run-contract resolution is required');
      expect(out).toContain('Do not guess a correction stage');
      expect(out).not.toContain('Required output artifact');
      expect(out).not.toContain('Output file:');
      expect(out).not.toContain('Correction task');
    });
  });

  it('a ready activated run renders its normal stage prompt (with the authoring contract)', () => {
    withTmp((tmp) => {
      const meta = makeSemanticRun(tmp, { impl: null, test: null, ver: null });
      writePriorArtifacts(meta, 'implementation');
      const out = livePrompt(tmp);
      expect(out).not.toContain('BLOCKED by Semantic Continuity');
      expect(out).toContain('Required output artifact: ImplementationReport');
      expect(out).toContain('implementation responsibility ID: RSP-001');
    });
  });

  it('a legacy run with the same gaps is never semantically blocked', () => {
    withTmp((tmp) => {
      const meta = makeSemanticRun(tmp, { version: null, impl: null, test: null, ver: null });
      writePriorArtifacts(meta, 'test-implementation');
      const out = livePrompt(tmp);
      expect(out).not.toContain('Semantic continuity');
      expect(out).not.toContain('SEMANTIC CONTINUITY');
      expect(out).toContain('Required output artifact: TestImplementationReport');
    });
  });
});
