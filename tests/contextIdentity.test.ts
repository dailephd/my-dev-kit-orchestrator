import { identityPathsEqual, normalizeIdentityPath, nonEmpty } from '../src/instructions/contextIdentity';

describe('normalizeIdentityPath / identityPathsEqual (v1.2.2 Batch 2)', () => {
  it('treats Windows backslash and forward-slash separators as equal', () => {
    expect(identityPathsEqual('C:\\Users\\dev\\repo', 'C:/Users/dev/repo')).toBe(true);
  });

  it('treats Windows drive-letter case as equal', () => {
    expect(identityPathsEqual('C:\\Users\\dev\\repo', 'c:\\Users\\dev\\repo')).toBe(true);
  });

  it('treats a trailing separator as equal to no trailing separator', () => {
    expect(identityPathsEqual('/home/dev/repo/', '/home/dev/repo')).toBe(true);
    expect(identityPathsEqual('C:\\Users\\dev\\repo\\', 'C:\\Users\\dev\\repo')).toBe(true);
  });

  it('treats a redundant "./" segment as equal', () => {
    expect(identityPathsEqual('/home/dev/./repo', '/home/dev/repo')).toBe(true);
  });

  it('treats duplicate separators as equal', () => {
    expect(identityPathsEqual('/home//dev///repo', '/home/dev/repo')).toBe(true);
  });

  it('handles paths containing spaces', () => {
    expect(identityPathsEqual('C:\\Users\\dev\\My Project (2)\\repo', 'C:/Users/dev/My Project (2)/repo')).toBe(true);
    expect(identityPathsEqual('C:\\Users\\dev\\My Project (2)\\repo', 'C:/Users/dev/My Other Project/repo')).toBe(false);
  });

  it('a POSIX-normalized path form matches its raw equivalent', () => {
    expect(identityPathsEqual('/home/dev/repo', '/home/dev/repo')).toBe(true);
  });

  it('never lowercases POSIX path content (case-sensitive outside the drive letter)', () => {
    expect(identityPathsEqual('/home/dev/Repo', '/home/dev/repo')).toBe(false);
  });

  it('rejects unrelated paths as unequal', () => {
    expect(identityPathsEqual('/home/dev/repo-a', '/home/dev/repo-b')).toBe(false);
    expect(identityPathsEqual('C:\\Users\\dev\\repo', 'D:\\Users\\dev\\repo')).toBe(false);
  });

  it('never matches on basename or suffix alone', () => {
    expect(identityPathsEqual('/home/dev/repo', '/somewhere/else/repo')).toBe(false);
    expect(identityPathsEqual('/home/dev/repo', 'dev/repo')).toBe(false);
  });

  it('does not strip ".." segments', () => {
    expect(normalizeIdentityPath('/home/dev/../repo')).toBe('/home/dev/../repo');
  });

  it('treats two absent values as vacuously equal, and one absent + one present as unequal', () => {
    expect(identityPathsEqual(undefined, undefined)).toBe(true);
    expect(identityPathsEqual(undefined, '/home/dev/repo')).toBe(false);
    expect(identityPathsEqual('/home/dev/repo', undefined)).toBe(false);
  });

  it('treats an empty or whitespace-only string as absent', () => {
    expect(identityPathsEqual('', undefined)).toBe(true);
    expect(identityPathsEqual('   ', undefined)).toBe(true);
  });
});

describe('nonEmpty', () => {
  it('returns undefined for undefined, empty, and whitespace-only input', () => {
    expect(nonEmpty(undefined)).toBeUndefined();
    expect(nonEmpty('')).toBeUndefined();
    expect(nonEmpty('   ')).toBeUndefined();
  });

  it('returns the trimmed value for real content', () => {
    expect(nonEmpty('  /home/dev/repo  ')).toBe('/home/dev/repo');
  });
});
