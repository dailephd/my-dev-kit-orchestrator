import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

const projectRoot = path.resolve(__dirname, '../..');
const scriptPath = path.join(projectRoot, 'scripts', 'test-security.mjs');

function makeFixture(packPaths: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-security-contract-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: '@dailephd/my-dev-kit-orchestrator',
    version: '1.1.0',
    bin: { 'my-dev-kit-orchestrator': 'dist/cli.js' },
    files: ['dist', 'CHANGELOG.md'],
  }));
  fs.writeFileSync(path.join(root, 'pack.json'), JSON.stringify([{
    files: packPaths.map((filePath) => ({ path: filePath })),
  }]));
  return root;
}

function runFixture(root: string) {
  return spawnSync(
    process.execPath,
    [scriptPath, '--root', root, '--pack-json', path.join(root, 'pack.json')],
    { encoding: 'utf8', windowsHide: true },
  );
}

describe('target security contract', () => {
  it('is registered as a local dependency-free npm script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    expect(pkg.scripts['test:security']).toBe('node scripts/test-security.mjs');
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it('passes safe package metadata and contents without modifying source files', () => {
    const root = makeFixture(['README.md', 'package.json', 'CHANGELOG.md', 'dist/cli.js']);
    const sourceBefore = fs.readFileSync(scriptPath, 'utf8');
    try {
      const result = runFixture(root);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('SECURITY_CONTRACT_PASS');
      expect(fs.readFileSync(scriptPath, 'utf8')).toBe(sourceBefore);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when package contents include a forbidden path', () => {
    const root = makeFixture(['README.md', 'package.json', 'CHANGELOG.md', 'dist/cli.js', '.env.production']);
    try {
      const result = runFixture(root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Forbidden package path: .env.production');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
