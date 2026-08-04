import {
  validateBoundedPatternSyntax,
  matchesBoundedPattern,
  matchesExact,
} from '../../src/greenfield/profiles/targetPatternMatching';

// TST-005 (pattern grammar, section 26.7): literal-only pattern.
describe('validateBoundedPatternSyntax - literal-only pattern', () => {
  it('accepts a pattern with only literal segments', () => {
    expect(validateBoundedPatternSyntax('src/index.ts').ok).toBe(true);
  });
});

describe('validateBoundedPatternSyntax - single "*"', () => {
  it('accepts a single "*" segment', () => {
    expect(validateBoundedPatternSyntax('src/*').ok).toBe(true);
  });

  it('rejects a partial-segment wildcard (no substring matching)', () => {
    const result = validateBoundedPatternSyntax('src/*.ts');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-syntax');
  });
});

describe('validateBoundedPatternSyntax - "**" bounded segment', () => {
  it('accepts a single "**"', () => {
    expect(validateBoundedPatternSyntax('src/**/index.ts').ok).toBe(true);
  });

  it('rejects more than one "**"', () => {
    const result = validateBoundedPatternSyntax('src/**/foo/**/bar');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('multiple-double-star');
  });
});

describe('validateBoundedPatternSyntax - unsupported syntax rejected', () => {
  it('rejects a leading absolute marker', () => {
    const result = validateBoundedPatternSyntax('/src/*');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('absolute-marker');
  });

  it('rejects a traversal token', () => {
    const result = validateBoundedPatternSyntax('src/../*');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('traversal-token');
  });

  it('rejects a lone "." segment', () => {
    const result = validateBoundedPatternSyntax('src/./index.ts');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('traversal-token');
  });

  it('rejects a character class', () => {
    const result = validateBoundedPatternSyntax('src/[abc].ts');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-syntax');
  });

  it('rejects brace expansion', () => {
    const result = validateBoundedPatternSyntax('src/{a,b}.ts');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-syntax');
  });

  it('rejects a regex-style question mark', () => {
    const result = validateBoundedPatternSyntax('src/inde?.ts');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-syntax');
  });

  it('rejects an empty segment from a double separator', () => {
    const result = validateBoundedPatternSyntax('src//index.ts');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-syntax');
  });
});

describe('matchesBoundedPattern - anchored full-path matching, no substring matching', () => {
  it('matches a literal-only pattern exactly', () => {
    expect(matchesBoundedPattern('src/index.ts', 'src/index.ts')).toBe(true);
  });

  it('does not match when the path has extra segments beyond a literal pattern', () => {
    expect(matchesBoundedPattern('src/nested/index.ts', 'src/index.ts')).toBe(false);
  });

  it('matches "*" against exactly one nonempty segment', () => {
    expect(matchesBoundedPattern('src/index.ts', 'src/*')).toBe(true);
    expect(matchesBoundedPattern('src/nested/index.ts', 'src/*')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(matchesBoundedPattern('SRC/index.ts', 'src/*')).toBe(false);
  });

  it('does not do substring/partial matching', () => {
    expect(matchesBoundedPattern('src/index.ts', 'src/index')).toBe(false);
  });
});

// TST scaffold target path (section 26.7): "**" matches zero through eight
// segments; more than eight segments does not match.
describe('matchesBoundedPattern - "**" bounded zero-to-eight segment matching', () => {
  it('matches zero segments for "**"', () => {
    expect(matchesBoundedPattern('src/index.ts', 'src/**/index.ts')).toBe(true);
  });

  it('matches one segment for "**"', () => {
    expect(matchesBoundedPattern('src/nested/index.ts', 'src/**/index.ts')).toBe(true);
  });

  it('matches exactly eight segments for "**"', () => {
    const eightSegments = Array.from({ length: 8 }, (_, i) => `d${i}`).join('/');
    expect(matchesBoundedPattern(`src/${eightSegments}/index.ts`, 'src/**/index.ts')).toBe(true);
  });

  it('does not match more than eight segments for "**"', () => {
    const nineSegments = Array.from({ length: 9 }, (_, i) => `d${i}`).join('/');
    expect(matchesBoundedPattern(`src/${nineSegments}/index.ts`, 'src/**/index.ts')).toBe(false);
  });

  it('matches an unanchored trailing "**"', () => {
    expect(matchesBoundedPattern('app/src/main/java/MainActivity.kt', 'app/src/main/**')).toBe(true);
  });
});

describe('matchesExact - PSE-005 full normalized-string equality', () => {
  it('matches identical normalized strings', () => {
    expect(matchesExact('package.json', 'package.json')).toBe(true);
  });

  it('does not match a different string', () => {
    expect(matchesExact('package.json', 'Package.json')).toBe(false);
  });

  it('does not match a prefix (no partial matching)', () => {
    expect(matchesExact('src/index.ts', 'src')).toBe(false);
  });
});
