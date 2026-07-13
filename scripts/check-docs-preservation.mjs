import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/documentation-preservation-manifest.json'), 'utf8'));
const failures = [];
for (const [relPath, required] of Object.entries(manifest.documents)) {
  const text = fs.readFileSync(path.join(root, relPath), 'utf8').toLowerCase();
  for (const value of required) {
    if (!text.includes(value.toLowerCase())) {
      failures.push(`${relPath}: missing required preserved structure or concept: ${value}`);
    }
  }
}
for (const failure of failures) console.error(`DOCS_CHECK_FAIL: ${failure}`);
if (failures.length) process.exitCode = 1;
else console.log(`DOCS_CHECK_PASS: ${Object.keys(manifest.documents).length} canonical documents preserved`);
