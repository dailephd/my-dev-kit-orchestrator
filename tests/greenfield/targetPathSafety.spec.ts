import { normalizeTargetPath, isAbsolutePathFailure, pathsAreEqual } from '../../src/greenfield/profiles/targetPathSafety';

// TST-025: traversal and absolute target variants -> rejected before any
// filesystem access (this module never touches the filesystem at all).
describe('normalizeTargetPath - absolute and traversal rejection (TST-025)', () => {
  it('rejects an absolute POSIX path', () => {
    const result = normalizeTargetPath('/etc/passwd');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('absolute-posix');
    expect(isAbsolutePathFailure(result.reason!)).toBe(true);
  });

  it('rejects a drive-qualified Windows path', () => {
    const result = normalizeTargetPath('C:\\Windows\\System32');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('absolute-drive');
    expect(isAbsolutePathFailure(result.reason!)).toBe(true);
  });

  it('rejects a drive-qualified Windows path using forward slashes', () => {
    const result = normalizeTargetPath('C:/Windows/System32');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('absolute-drive');
  });

  it('rejects a UNC path', () => {
    const result = normalizeTargetPath('\\\\server\\share\\file.txt');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unc');
    expect(isAbsolutePathFailure(result.reason!)).toBe(true);
  });

  it('rejects a UNC-style path using forward slashes', () => {
    const result = normalizeTargetPath('//server/share/file.txt');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unc');
  });

  it('rejects a URI-scheme path', () => {
    const result = normalizeTargetPath('file:///etc/passwd');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('uri-scheme');
    expect(isAbsolutePathFailure(result.reason!)).toBe(true);
  });

  it('rejects a raw parent-traversal segment', () => {
    const result = normalizeTargetPath('../secrets.txt');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('traversal');
  });

  it('rejects traversal after separator normalization (backslash form)', () => {
    const result = normalizeTargetPath('src\\..\\..\\secrets.txt');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('traversal');
  });

  it('rejects traversal embedded mid-path', () => {
    const result = normalizeTargetPath('src/../../etc/passwd');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('traversal');
  });
});

describe('normalizeTargetPath - empty and whitespace-only paths', () => {
  it('rejects an empty path', () => {
    const result = normalizeTargetPath('');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty');
  });

  it('rejects a whitespace-only path', () => {
    const result = normalizeTargetPath('   ');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty');
  });

  it('rejects a path containing a control character', () => {
    const result = normalizeTargetPath('src/\u0000evil.ts');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('control-character');
  });

  it('rejects a trailing separator', () => {
    const result = normalizeTargetPath('src/');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('trailing-separator');
  });
});

// TST-026: equivalent Windows/POSIX separators plus paths with spaces and
// parentheses produce stable normalized matches and preserved literals.
describe('normalizeTargetPath - Windows/POSIX separators, spaces, parentheses (TST-026)', () => {
  it('normalizes POSIX separators unchanged', () => {
    const result = normalizeTargetPath('app/src/main/java/MainActivity.kt');
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe('app/src/main/java/MainActivity.kt');
  });

  it('normalizes Windows backslash separators to forward slashes', () => {
    const result = normalizeTargetPath('app\\src\\main\\java\\MainActivity.kt');
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe('app/src/main/java/MainActivity.kt');
  });

  it('produces the same normalized value for equivalent mixed separators', () => {
    const posix = normalizeTargetPath('app/src/main/java/MainActivity.kt');
    const windows = normalizeTargetPath('app\\src\\main\\java\\MainActivity.kt');
    const mixed = normalizeTargetPath('app/src\\main/java\\MainActivity.kt');
    expect(posix.normalized).toBe(windows.normalized);
    expect(posix.normalized).toBe(mixed.normalized);
  });

  it('preserves spaces literally', () => {
    const result = normalizeTargetPath('docs/My Notes.md');
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe('docs/My Notes.md');
  });

  it('preserves parentheses literally', () => {
    const result = normalizeTargetPath('src/components/Button (v2).tsx');
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe('src/components/Button (v2).tsx');
  });

  it('preserves dots, hyphens, underscores, and Unicode literally', () => {
    const result = normalizeTargetPath('src/café-name_v1.2.ts');
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe('src/café-name_v1.2.ts');
  });

  it('collapses repeated separators', () => {
    const result = normalizeTargetPath('src//index.ts');
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe('src/index.ts');
  });

  it('resolves lexical "." segments without touching the filesystem', () => {
    const result = normalizeTargetPath('src/./index.ts');
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe('src/index.ts');
  });
});

// TST-027: equivalent LF/CRLF artifact fixtures produce an identical issue
// set/order. This module operates on path strings only (not file content),
// so CRLF/LF is exercised by confirming embedded \r doesn't change
// unrelated normalization -- \r is a control character and is rejected
// deterministically either way.
describe('normalizeTargetPath - CRLF/LF-adjacent determinism (TST-027)', () => {
  it('rejects a path containing an embedded carriage return deterministically', () => {
    const first = normalizeTargetPath('src/index.ts\r');
    const second = normalizeTargetPath('src/index.ts\r');
    expect(first).toEqual(second);
    expect(first.ok).toBe(false);
    expect(first.reason).toBe('control-character');
  });
});

describe('normalizeTargetPath - case sensitivity (TST-004 path boundary)', () => {
  it('produces different normalized values for a case-only mismatch', () => {
    const lower = normalizeTargetPath('src/index.ts');
    const upper = normalizeTargetPath('SRC/INDEX.TS');
    expect(lower.normalized).not.toBe(upper.normalized);
    expect(pathsAreEqual(lower.normalized!, upper.normalized!)).toBe(false);
  });

  it('is deterministic and case-sensitive regardless of host', () => {
    expect(pathsAreEqual('README.md', 'README.md')).toBe(true);
    expect(pathsAreEqual('README.md', 'readme.md')).toBe(false);
  });
});

describe('normalizeTargetPath - determinism', () => {
  it('produces the same result for the same input across repeated calls', () => {
    const first = normalizeTargetPath('app/src/main/AndroidManifest.xml');
    const second = normalizeTargetPath('app/src/main/AndroidManifest.xml');
    expect(first).toEqual(second);
  });
});
