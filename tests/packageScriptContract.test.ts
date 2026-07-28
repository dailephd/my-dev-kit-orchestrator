import * as fs from 'fs';
import * as path from 'path';

const repositoryRoot = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('package script contract: test vs verify', () => {
  it('defines a canonical full test script', () => {
    expect(pkg.scripts.test).toBe('jest');
  });

  it('defines a verify script', () => {
    expect(pkg.scripts.verify).toBeDefined();
  });

  it('does not invoke npm run test from verify', () => {
    expect(pkg.scripts.verify).not.toMatch(/npm run test(\s|$)/);
  });

  it('does not invoke bare npm test from verify', () => {
    expect(pkg.scripts.verify).not.toMatch(/(^|\s)npm test(\s|$)/);
  });

  it('does not invoke the bare jest runner from verify', () => {
    expect(pkg.scripts.verify).not.toMatch(/(^|\s)jest(\s|$)/);
  });

  it('retains the non-test verification gates in verify', () => {
    expect(pkg.scripts.verify).toMatch(/npm run typecheck/);
    expect(pkg.scripts.verify).toMatch(/npm run build/);
    expect(pkg.scripts.verify).toMatch(/npm run lint\b/);
    expect(pkg.scripts.verify).toMatch(/npm run docs:check/);
  });
});
