// One-off fixture generator, guarded so it never runs as part of the normal
// suite. Run with:
//   GENERATE_COMPATIBILITY_MANIFEST=1 npx jest tests/generateCompatibilityManifest.generate.test.ts --runInBand

import * as fs from 'fs';
import * as path from 'path';
import { buildCompatibilityManifest } from './compatibilityManifestLib';

const shouldGenerate = process.env.GENERATE_COMPATIBILITY_MANIFEST === '1';
const describeOrSkip = shouldGenerate ? describe : describe.skip;

describeOrSkip('compatibility manifest generation', () => {
  it('generates deterministically and writes the fixture', () => {
    const first = buildCompatibilityManifest();
    const second = buildCompatibilityManifest();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));

    const dir = path.join(__dirname, 'fixtures', 'v121-compatibility');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'compatibility-manifest.json'), JSON.stringify(first, null, 2) + '\n', 'utf8');
  });
});
