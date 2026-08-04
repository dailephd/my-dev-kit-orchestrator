import * as fs from 'fs';
import * as path from 'path';
import { PromptHashFixture } from './promptHashFixtureLib';
import { STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from '../src/instructions/stageRepositoryEvidenceRequirements';

function loadFixture(dir: string): PromptHashFixture {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', dir, 'prompt-hashes.json'), 'utf8')) as PromptHashFixture;
}

const EXPECTED_CHANGED_STAGE_IDS = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.map((r) => r.stageId).sort();

describe('v1.2.1 Batch 4 prompt compatibility', () => {
  const baseline = loadFixture('v121-packet-prompts');
  const batch4 = loadFixture('v121-context-references');

  it('both fixtures cover all 79 native stage prompts', () => {
    expect(baseline.entries).toHaveLength(79);
    expect(batch4.entries).toHaveLength(79);
  });

  it('changes exactly the 11 context-sensitive stage prompts and leaves the other 68 byte-identical (normalized)', () => {
    const baselineByStageId = new Map(baseline.entries.map((e) => [e.stageId, e]));
    const changed: string[] = [];
    const unchanged: string[] = [];

    for (const entry of batch4.entries) {
      const before = baselineByStageId.get(entry.stageId);
      expect(before).toBeDefined();
      if (before!.normalizedSha256 !== entry.normalizedSha256) {
        changed.push(entry.stageId);
      } else {
        unchanged.push(entry.stageId);
      }
    }

    expect(changed.sort()).toEqual(EXPECTED_CHANGED_STAGE_IDS);
    expect(unchanged).toHaveLength(79 - EXPECTED_CHANGED_STAGE_IDS.length);
  });

  it('prompt filenames and workflow/stage IDs are identical between fixtures', () => {
    const byStageId = new Map(baseline.entries.map((e) => [e.stageId, e]));
    for (const entry of batch4.entries) {
      const before = byStageId.get(entry.stageId)!;
      expect(entry.promptFile).toBe(before.promptFile);
      expect(entry.workflowId).toBe(before.workflowId);
      expect(entry.mode).toBe(before.mode);
      expect(entry.stage).toBe(before.stage);
    }
  });

  it('the two documented legacy greenfield scaffold prompts are among the unchanged 68', () => {
    const changedSet = new Set(EXPECTED_CHANGED_STAGE_IDS);
    expect(changedSet.has('stage.greenfield.scaffold-plan')).toBe(false);
    expect(changedSet.has('stage.greenfield.scaffold-implementation')).toBe(false);
  });
});
