import { execFileSync } from 'child_process';
import * as path from 'path';

// Runs `npm pack --dry-run --json` once and validates package contents
// against the Batch 6 forbidden/required-content policy (section 24). Uses
// --json so the file list is parsed structurally rather than screen-scraped.
describe('v1.2.1 package regression (npm pack --dry-run)', () => {
  let files: string[] = [];
  let packageInfo: { name: string; version: string; filename: string; size: number; unpackedSize: number } | undefined;

  beforeAll(() => {
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      shell: true,
    });
    const parsed = JSON.parse(raw);
    const entry = parsed[0];
    files = entry.files.map((f: { path: string }) => f.path);
    packageInfo = {
      name: entry.name,
      version: entry.version,
      filename: entry.filename,
      size: entry.size,
      unpackedSize: entry.unpackedSize,
    };
  }, 60000);

  it('package identity matches the v1.2.1 release', () => {
    expect(packageInfo?.name).toBe('@dailephd/my-dev-kit-orchestrator');
    expect(packageInfo?.version).toBe('1.2.1');
  });

  it('every included file is under dist/, is package.json, or is npm\'s auto-included README', () => {
    // npm always auto-includes README.md/LICENSE regardless of the "files"
    // field -- that is existing, unmodified package policy, not something
    // this batch added.
    for (const f of files) {
      expect(f === 'package.json' || f === 'README.md' || f.startsWith('dist/')).toBe(true);
    }
  });

  it('includes no test files, fixtures, or generated worktrees', () => {
    const forbidden = files.filter(
      (f) =>
        f.startsWith('tests/') ||
        f.includes('__tests__') ||
        f.includes('.test.') ||
        f.includes('.spec.') ||
        f.includes('fixtures/'),
    );
    expect(forbidden).toEqual([]);
  });

  it('includes no packet sidecars, supplemental context files, or raw my-dev-kit evidence', () => {
    const forbidden = files.filter(
      (f) =>
        f.includes('.instruction-packet.json') ||
        f.includes('context-packet') ||
        f.includes('context-retrieval-report') ||
        f.includes('context-capsule') ||
        f.includes('retrieval-audit'),
    );
    expect(forbidden).toEqual([]);
  });

  it('includes no generated runs', () => {
    const forbidden = files.filter((f) => f.includes('.my-dev-kit-orchestrator/runs'));
    expect(forbidden).toEqual([]);
  });

  it('includes no secret or environment files', () => {
    const forbidden = files.filter((f) => /\.env(\.|$)|secret|credential/i.test(f));
    expect(forbidden).toEqual([]);
  });

  it('reports a nonzero, bounded file count and size (sanity check against an empty or exploded package)', () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.length).toBeLessThan(1000);
    expect(packageInfo!.unpackedSize).toBeGreaterThan(1000);
  });
});
