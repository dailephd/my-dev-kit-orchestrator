import * as fs from 'fs';
import * as path from 'path';
import { PromptHashFixture } from './promptHashFixtureLib';
import { STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from '../src/instructions/stageRepositoryEvidenceRequirements';
import { TEST_STRATEGY_SOURCE_REQUIREMENTS } from '../src/instructions/testResponsibilityCriticality';
import { VALID_MODES } from '../src/types';

function loadFixture(dir: string): PromptHashFixture {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', dir, 'prompt-hashes.json'), 'utf8')) as PromptHashFixture;
}

// The exact stage keys Batch 5 may intentionally change, relative to the
// Batch 4 fixture (which used a fake, nonexistent runFolder -- so Batch 5's
// readiness evaluation always resolves to "missing"/"template" there):
//
//   - the 11 direct context-sensitive stages (now context-refresh-only
//     prompts instead of normal work prompts)
//   - the non-greenfield verification/judge stages (now carry a Context
//     readiness review section)
//   - the six mode-specific test-strategy stages (now require explicit
//     per-responsibility criticality)
const NON_GREENFIELD_MODES = VALID_MODES.filter((m) => m !== 'greenfield');

const EXPECTED_CHANGED_KEYS = new Set<string>([
  ...STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.map((r) => {
    const [, mode, stage] = r.stageId.split('.');
    return `${mode}:${stage}`;
  }),
  ...NON_GREENFIELD_MODES.map((m) => `${m}:verification`),
  ...NON_GREENFIELD_MODES.map((m) => `${m}:judge`),
  ...TEST_STRATEGY_SOURCE_REQUIREMENTS.map((r) => `${r.mode}:${r.strategyStageId.split('.')[2]}`),
]);

describe('v1.2.1 Batch 5 prompt compatibility', () => {
  const batch4 = loadFixture('v121-context-references');
  const batch5 = loadFixture('v121-batch5-prompts');

  it('both fixtures cover all 79 native stage prompts', () => {
    expect(batch4.entries).toHaveLength(79);
    expect(batch5.entries).toHaveLength(79);
  });

  it('changes exactly the expected stage set and leaves everything else byte-identical (normalized)', () => {
    const batch4ByStageId = new Map(batch4.entries.map((e) => [e.stageId, e]));
    const changed: string[] = [];
    const unchanged: string[] = [];

    for (const entry of batch5.entries) {
      const before = batch4ByStageId.get(entry.stageId);
      expect(before).toBeDefined();
      const key = `${entry.mode}:${entry.stage}`;
      if (before!.normalizedSha256 !== entry.normalizedSha256) {
        changed.push(key);
      } else {
        unchanged.push(key);
      }
    }

    expect(new Set(changed)).toEqual(EXPECTED_CHANGED_KEYS);
    expect(unchanged).toHaveLength(79 - EXPECTED_CHANGED_KEYS.size);
  });

  it('both documented legacy greenfield scaffold prompts remain unchanged', () => {
    expect(EXPECTED_CHANGED_KEYS.has('greenfield:scaffold-plan')).toBe(false);
    expect(EXPECTED_CHANGED_KEYS.has('greenfield:scaffold-implementation')).toBe(false);
  });

  it('all greenfield prompts remain unchanged', () => {
    for (const key of EXPECTED_CHANGED_KEYS) {
      expect(key.startsWith('greenfield:')).toBe(false);
    }
  });

  it('prompt filenames and stage identity are identical between fixtures', () => {
    const byStageId = new Map(batch4.entries.map((e) => [e.stageId, e]));
    for (const entry of batch5.entries) {
      const before = byStageId.get(entry.stageId)!;
      expect(entry.promptFile).toBe(before.promptFile);
      expect(entry.workflowId).toBe(before.workflowId);
      expect(entry.mode).toBe(before.mode);
      expect(entry.stage).toBe(before.stage);
    }
  });
});
