import * as fs from 'fs';
import * as path from 'path';
import { getAllWorkflows } from '../src/workflows';
import { buildInstructionCatalog } from '../src/instructions/catalog';
import { validateCatalog } from '../src/instructions/catalogValidation';

interface ContractInventory {
  packageContract: { name: string; version: string; files: string[] };
  modeContract: Array<{ mode: string; stageCount: number; stageOrder: string[] }>;
  stageContract: Array<{
    mode: string;
    position: number;
    stageName: string;
    artifactFile: string;
    promptFile: string;
    additionalArtifactFiles: string[];
  }>;
}

function loadInventory(): ContractInventory {
  const inventoryPath = path.join(__dirname, 'fixtures', 'v120-baseline', 'contract-inventory.json');
  const raw = fs.readFileSync(inventoryPath, 'utf8');
  return JSON.parse(raw) as ContractInventory;
}

describe('v1.2.0 baseline compatibility (Batch 1)', () => {
  const inventory = loadInventory();

  it('preserves the package name while reporting the v1.3.0 release version', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    expect(pkg.name).toBe(inventory.packageContract.name);
    expect(inventory.packageContract.version).toBe('1.2.0');
    expect(pkg.version).toBe('1.3.0');
  });

  it('exactly seven modes exist, matching the baseline', () => {
    const runtimeModes = getAllWorkflows().map((wf) => wf.mode).sort();
    const baselineModes = inventory.modeContract.map((m) => m.mode).sort();
    expect(runtimeModes).toEqual(baselineModes);
    expect(runtimeModes).toHaveLength(7);
  });

  it('exactly 79 stages exist across all modes, matching the baseline', () => {
    const runtimeStageCount = getAllWorkflows().reduce((sum, wf) => sum + wf.stages.length, 0);
    const baselineStageCount = inventory.stageContract.length;
    expect(runtimeStageCount).toBe(79);
    expect(baselineStageCount).toBe(79);
    expect(runtimeStageCount).toBe(baselineStageCount);
  });

  it('exact stage order matches the baseline for every mode', () => {
    for (const modeEntry of inventory.modeContract) {
      const wf = getAllWorkflows().find((w) => w.mode === modeEntry.mode)!;
      expect(wf.stages.map((s) => s.name)).toEqual(modeEntry.stageOrder);
    }
  });

  it('prompt filenames match the baseline', () => {
    for (const stageEntry of inventory.stageContract) {
      const wf = getAllWorkflows().find((w) => w.mode === stageEntry.mode)!;
      const stage = wf.stages[stageEntry.position - 1];
      expect(stage.promptFile).toBe(stageEntry.promptFile);
    }
  });

  it('artifact filenames and additional artifact files match the baseline', () => {
    for (const stageEntry of inventory.stageContract) {
      const wf = getAllWorkflows().find((w) => w.mode === stageEntry.mode)!;
      const stage = wf.stages[stageEntry.position - 1];
      expect(stage.artifactFile).toBe(stageEntry.artifactFile);
      expect(stage.additionalArtifactFiles ?? []).toEqual(stageEntry.additionalArtifactFiles);
    }
  });

  it('the instruction catalog reflects the same mode and stage-order baseline with no validation issues', () => {
    const result = validateCatalog(buildInstructionCatalog());
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('test fixtures are excluded from the packaged files list', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    expect(pkg.files).toEqual(inventory.packageContract.files);
    expect(pkg.files).not.toEqual(expect.arrayContaining(['tests']));
  });
});
