import {
  validateBoundedPatternSyntax,
  matchesBoundedPattern,
  matchesExact,
  patternsOverlap,
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

// v1.3.0 Batch 3 correction: bounded-pattern versus bounded-pattern
// intersection (patternsOverlap). Callers exclude identical normalized
// patterns before calling this -- that is duplicate classification, not
// overlap -- so these tests use only non-identical pattern pairs except
// where explicitly noted.
describe('patternsOverlap - identical pattern (duplicate classification is the caller\'s job)', () => {
  it('returns true for identical patterns (the matcher itself has no duplicate concept)', () => {
    expect(patternsOverlap('src/*', 'src/*')).toBe(true);
  });
});

describe('patternsOverlap - literal compatibility', () => {
  it('overlaps when literal segments match and the rest is wildcard-compatible', () => {
    expect(patternsOverlap('src/*/Main.kt', 'src/app/*')).toBe(true);
  });

  it('does not overlap when a literal segment differs at the same position', () => {
    expect(patternsOverlap('src/*/Main.kt', 'tests/*/Main.kt')).toBe(false);
  });

  it('does not overlap when trailing literals differ', () => {
    expect(patternsOverlap('src/*/Main.kt', 'src/*/Other.kt')).toBe(false);
  });
});

describe('patternsOverlap - "*" compatibility', () => {
  it('overlaps "*" against a literal', () => {
    expect(patternsOverlap('src/*', 'src/app')).toBe(true);
  });

  it('overlaps "*" against "*"', () => {
    expect(patternsOverlap('src/*', 'src/*')).toBe(true);
  });

  it('does not overlap "*" patterns with incompatible trailing literals', () => {
    expect(patternsOverlap('src/*/config.json', 'src/*/manifest.json')).toBe(false);
  });
});

describe('patternsOverlap - "**" zero-through-eight segment behavior', () => {
  it('overlaps when "**" can consume zero segments to match a shorter fixed pattern', () => {
    expect(patternsOverlap('src/**/Main.kt', 'src/Main.kt')).toBe(true);
  });

  it('overlaps when "**" can consume exactly one segment', () => {
    expect(patternsOverlap('src/**/Main.kt', 'src/*/Main.kt')).toBe(true);
  });

  it('overlaps when "**" can consume exactly eight segments', () => {
    const eightStars = Array.from({ length: 8 }, () => '*').join('/');
    expect(patternsOverlap('root/**/end', `root/${eightStars}/end`)).toBe(true);
  });

  it('does not overlap when the other pattern requires nine "**"-consumed segments', () => {
    const nineStars = Array.from({ length: 9 }, () => '*').join('/');
    expect(patternsOverlap('root/**/end', `root/${nineStars}/end`)).toBe(false);
  });

  it('overlaps "**" against "*"', () => {
    expect(patternsOverlap('src/**/Main.kt', 'src/*/Main.kt')).toBe(true);
  });

  it('overlaps "**" against "**"', () => {
    expect(patternsOverlap('src/**/Main.kt', 'root/**/Main.kt')).toBe(false); // different leading literal
    expect(patternsOverlap('src/**/Main.kt', 'src/**/Main.kt')).toBe(true);
  });
});

describe('patternsOverlap - anchored-prefix/suffix-only non-overlap', () => {
  it('does not overlap when only a prefix could intersect but suffixes are incompatible', () => {
    expect(patternsOverlap('src/**/a.ts', 'src/**/b.ts')).toBe(false);
  });

  it('does not overlap when only a suffix could intersect but prefixes are incompatible', () => {
    expect(patternsOverlap('src/**/shared.ts', 'lib/**/shared.ts')).toBe(false);
  });
});

describe('patternsOverlap - case sensitivity, spaces, parentheses, separators', () => {
  it('is case-sensitive (no overlap for a case-only mismatch)', () => {
    expect(patternsOverlap('src/*', 'SRC/*')).toBe(false);
  });

  it('overlaps patterns whose literal segments contain spaces and parentheses identically', () => {
    expect(patternsOverlap('docs/*/My Notes (v2).md', 'docs/app/My Notes (v2).md')).toBe(true);
  });

  it('treats a pattern originally written with Windows separators the same as POSIX once normalized', () => {
    // patternsOverlap operates on already-normalized patterns (callers
    // normalize backslashes before calling it, same as matchesBoundedPattern);
    // this proves the normalized forms overlap identically regardless of
    // which separator the profile author originally used.
    const posixPattern = 'app/src/*';
    const normalizedFromWindows = 'app\\src\\*'.replace(/\\/g, '/');
    expect(normalizedFromWindows).toBe(posixPattern);
    expect(patternsOverlap(posixPattern, normalizedFromWindows)).toBe(true);
  });
});

describe('patternsOverlap - symmetry, determinism, non-mutation', () => {
  it('is symmetric regardless of argument order', () => {
    expect(patternsOverlap('src/*/Main.kt', 'src/app/*')).toBe(
      patternsOverlap('src/app/*', 'src/*/Main.kt'),
    );
    expect(patternsOverlap('src/*/Main.kt', 'tests/*/Main.kt')).toBe(
      patternsOverlap('tests/*/Main.kt', 'src/*/Main.kt'),
    );
  });

  it('is deterministic for repeated calls with the same input', () => {
    const first = patternsOverlap('src/**/Main.kt', 'src/*/Main.kt');
    const second = patternsOverlap('src/**/Main.kt', 'src/*/Main.kt');
    expect(first).toBe(second);
  });

  it('does not mutate its string arguments (immutable by construction)', () => {
    const patternA = 'src/*/Main.kt';
    const patternB = 'src/app/*';
    patternsOverlap(patternA, patternB);
    expect(patternA).toBe('src/*/Main.kt');
    expect(patternB).toBe('src/app/*');
  });
});
