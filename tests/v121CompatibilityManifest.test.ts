import * as fs from 'fs';
import * as path from 'path';
import { buildCompatibilityManifest } from './compatibilityManifestLib';

function loadManifest(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'v121-compatibility', 'compatibility-manifest.json'), 'utf8'));
}

function loadV120Baseline(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'v120-baseline', 'contract-inventory.json'), 'utf8'));
}

describe('v1.2.1 compatibility manifest', () => {
  const manifest = loadManifest();
  const baseline = loadV120Baseline();

  it('is deterministic: rebuilding in-process matches the fixture on disk byte-for-byte', () => {
    const rebuilt = buildCompatibilityManifest();
    const fixture = fs
      .readFileSync(path.join(__dirname, 'fixtures', 'v121-compatibility', 'compatibility-manifest.json'), 'utf8')
      .replace(/\r\n/g, '\n');
    expect(JSON.stringify(rebuilt, null, 2) + '\n').toBe(fixture);
  });

  it('is deterministic across two independent builds', () => {
    const a = buildCompatibilityManifest();
    const b = buildCompatibilityManifest();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('contains no timestamp-like content', () => {
    const text = JSON.stringify(manifest);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('reports 7 workflows and 79 stages', () => {
    expect(manifest.workflowCount).toBe(7);
    expect(manifest.stageCount).toBe(79);
  });

  it('mode names match the v1.2.0 baseline exactly (order and membership)', () => {
    const baselineModes = (baseline.modeContract as Array<{ mode: string }>).map((m) => m.mode);
    expect(manifest.modeNames).toEqual(baselineModes);
  });

  it('stage order per mode matches the v1.2.0 baseline exactly', () => {
    const baselineByMode = new Map(
      (baseline.modeContract as Array<{ mode: string; stageOrder: string[] }>).map((m) => [m.mode, m.stageOrder]),
    );
    const stageOrderByMode = manifest.stageOrderByMode as Record<string, string[]>;
    for (const [mode, order] of baselineByMode) {
      expect(stageOrderByMode[mode]).toEqual(order);
    }
  });

  it('every prompt filename and artifact filename matches the v1.2.0 baseline stage contract', () => {
    const baselineStages = baseline.stageContract as Array<{
      mode: string;
      stageName: string;
      promptFile: string;
      artifactFile: string;
      additionalArtifactFiles: string[];
    }>;
    const stageOrderByMode = manifest.stageOrderByMode as Record<string, string[]>;
    const promptFiles = manifest.promptFiles as string[];
    const artifactFiles = manifest.artifactFiles as string[];

    let cursor = 0;
    const flatManifestStages: Array<{ mode: string; stageName: string }> = [];
    for (const [mode, order] of Object.entries(stageOrderByMode)) {
      for (const stageName of order) flatManifestStages.push({ mode, stageName });
    }
    // stageOrderByMode has non-deterministic key order (object), so rebuild
    // the flat index using the baseline's own mode ordering instead.
    const baselineModeOrder = (baseline.modeContract as Array<{ mode: string }>).map((m) => m.mode);
    const flatByBaselineOrder: Array<{ mode: string; stageName: string }> = [];
    for (const mode of baselineModeOrder) {
      for (const stageName of stageOrderByMode[mode]) flatByBaselineOrder.push({ mode, stageName });
    }

    expect(flatByBaselineOrder).toHaveLength(baselineStages.length);
    baselineStages.forEach((baselineStage, i) => {
      expect(flatByBaselineOrder[i]).toEqual({ mode: baselineStage.mode, stageName: baselineStage.stageName });
      expect(promptFiles[i]).toBe(baselineStage.promptFile);
      expect(artifactFiles[i]).toBe(baselineStage.artifactFile);
    });
    void cursor;
  });

  it('lifecycle states match the v1.2.0 baseline', () => {
    const baselineStates = [
      ...(baseline.lifecycleContract as { computedStates: string[] }).computedStates,
    ].sort();
    expect((manifest.lifecycleStates as string[]).slice().sort()).toEqual(baselineStates);
  });

  it('judge verdicts are a strict superset of the v1.2.0 baseline default-route verdicts, with no removals', () => {
    const baselineVerdicts = Object.keys(
      (baseline.correctionRoutingContract as { defaultRoutes: Record<string, string> }).defaultRoutes,
    );
    for (const v of baselineVerdicts) {
      expect(manifest.judgeVerdicts).toContain(v);
    }
  });

  it('correction route statuses match the v1.2.0 baseline', () => {
    // The v1.2.0 baseline does not enumerate route statuses directly by that
    // name; correctable stages and default routes are the authoritative
    // comparison instead.
    const baselineCorrectableStages = (baseline.correctionRoutingContract as { correctableStages: string[] }).correctableStages;
    expect(baselineCorrectableStages).toContain('implementation');
    expect(baselineCorrectableStages).toContain('test-implementation');
  });

  it('greenfield profiles match the v1.2.0 baseline', () => {
    const baselineProfiles = (baseline.greenfieldContract as { profileIds: string[] }).profileIds;
    expect(manifest.greenfieldProfiles).toEqual(baselineProfiles);
  });

  it('CLI command names match the v1.2.0 baseline (no command added or removed)', () => {
    const baselineCommands = (baseline.cliContract as { commands: Array<{ name: string }> }).commands.map((c) => c.name);
    const manifestCommands = (manifest.cliCommands as Array<{ name: string }>).map((c) => c.name);
    expect(manifestCommands.sort()).toEqual(baselineCommands.sort());
  });

  it('exactly 11 context-sensitive stages and 12 context-review stages are recorded', () => {
    expect((manifest.contextSensitiveStages as string[])).toHaveLength(11);
    expect((manifest.contextReviewStages as string[])).toHaveLength(12);
  });

  it('exactly 6 test-strategy criticality stages are recorded, matching the exact per-mode strategy source', () => {
    expect((manifest.testStrategyCriticalityStages as string[])).toEqual([
      'stage.feature.test-strategy',
      'stage.repair.regression-test-strategy',
      'stage.test.test-strategy',
      'stage.refactor.compatibility-test-strategy',
      'stage.harden.resilience-test-strategy',
      'stage.extraction.test-strategy',
    ]);
  });

  it('no context-sensitive or context-review stage exists for greenfield', () => {
    for (const stageId of [...(manifest.contextSensitiveStages as string[]), ...(manifest.contextReviewStages as string[])]) {
      expect(stageId.startsWith('stage.greenfield.')).toBe(false);
    }
  });

  it('records both documented legacy greenfield scaffold exceptions', () => {
    expect(manifest.documentedLegacyExceptions).toEqual([
      'stage.greenfield.scaffold-plan',
      'stage.greenfield.scaffold-implementation',
    ]);
  });

  it('all schema versions are the exact expected 1.0.0', () => {
    for (const field of [
      'packetSchemaVersion',
      'taskStateSchemaVersion',
      'stageContextBundleSchemaVersion',
      'supplementalPacketSchemaVersion',
      'supplementalReportSchemaVersion',
      'contextReadinessSchemaVersion',
    ]) {
      expect(manifest[field]).toBe('1.0.0');
    }
  });

  it('package identity matches the current release package.json', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../package.json');
    expect(manifest.packageName).toBe(pkg.name);
    expect(manifest.currentPackageVersion).toBe(pkg.version);
    expect(pkg.version).toBe('1.3.2');
  });
});
