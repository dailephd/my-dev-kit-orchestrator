// One-off fixture generator, guarded by env vars so it never runs as part of
// the normal suite. Invoked twice (determinism check) before Batch 4 changed
// any prompt output to capture tests/fixtures/v121-packet-prompts/prompt-hashes.json,
// and again after Batch 4 rendering changes landed to capture
// tests/fixtures/v121-context-references/prompt-hashes.json.
//
// Run with:
//   GENERATE_PROMPT_HASH_FIXTURE=<packet-prompts|context-references> npx jest tests/generatePromptHashFixtures.generate.test.ts --runInBand

import * as fs from 'fs';
import * as path from 'path';
import { computePromptHashEntries, PromptHashFixture } from './promptHashFixtureLib';

const target = process.env.GENERATE_PROMPT_HASH_FIXTURE;

const describeOrSkip = target ? describe : describe.skip;

describeOrSkip('prompt hash fixture generation', () => {
  it('generates deterministic entries and writes the fixture', () => {
    const first = computePromptHashEntries();
    const second = computePromptHashEntries();
    expect(second).toEqual(first);
    expect(first).toHaveLength(79);

    const dirByTarget: Record<string, string> = {
      'packet-prompts': 'v121-packet-prompts',
      'context-references': 'v121-context-references',
      'batch5-prompts': 'v121-batch5-prompts',
    };
    const descriptionByTarget: Record<string, string> = {
      'packet-prompts':
        'Batch 3 completed-state normalized prompt hashes for all 79 native stages, captured before Batch 4 changed any prompt output.',
      'context-references':
        'Batch 4 normalized prompt hashes for all 79 native stages, captured after repository-evidence rendering was added to the 11 context-sensitive stages.',
      'batch5-prompts':
        'Batch 5 normalized prompt hashes for all 79 native stages (default fake runFolder, no context files present -- direct stages render context-refresh-only prompts), captured after readiness enforcement, verification/judge readiness review, and test-strategy criticality requirements were added.',
    };
    const fixtureDir = path.join(__dirname, 'fixtures', dirByTarget[target ?? 'context-references']);
    fs.mkdirSync(fixtureDir, { recursive: true });

    const fixture: PromptHashFixture = {
      baselineCommit: '983a476da2d483f76f92fef73a0b324c9ed77ea7',
      description: descriptionByTarget[target ?? 'context-references'],
      entryCount: first.length,
      entries: first,
    };

    fs.writeFileSync(path.join(fixtureDir, 'prompt-hashes.json'), JSON.stringify(fixture, null, 2) + '\n', 'utf8');
  });
});
