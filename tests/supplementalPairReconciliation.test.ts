import { reconcileDeclaredField, nonUnknown } from '../src/instructions/supplementalPairReconciliation';

describe('reconcileDeclaredField (v1.2.2 Batch 3 / F-007)', () => {
  it('both absent -> both-absent', () => {
    expect(reconcileDeclaredField(undefined, undefined)).toEqual({ status: 'both-absent' });
  });

  it('packet only -> packet-only, report value never substituted', () => {
    expect(reconcileDeclaredField('fresh', undefined)).toEqual({ status: 'packet-only', value: 'fresh' });
  });

  it('report only -> report-only, packet value never substituted', () => {
    expect(reconcileDeclaredField(undefined, 'stale')).toEqual({ status: 'report-only', value: 'stale' });
  });

  it('both present and equal -> agree', () => {
    expect(reconcileDeclaredField('fresh', 'fresh')).toEqual({ status: 'agree', value: 'fresh' });
  });

  it('both present and different -> disagree, retaining both source-specific values', () => {
    expect(reconcileDeclaredField('fresh', 'stale')).toEqual({ status: 'disagree', packetValue: 'fresh', reportValue: 'stale' });
  });

  it('does not silently pick packet nor report on disagreement (no precedence)', () => {
    const outcome = reconcileDeclaredField('a', 'b');
    expect(outcome.status).toBe('disagree');
    // Neither "a" nor "b" is exposed as a single resolved `.value` -- callers
    // must handle 'disagree' explicitly instead of reading a merged value.
    expect((outcome as { value?: unknown }).value).toBeUndefined();
  });

  it('uses a custom equality function when provided (path-normalized comparison)', () => {
    const equals = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    expect(reconcileDeclaredField('C:/Repo', 'c:/repo', equals)).toEqual({ status: 'agree', value: 'C:/Repo' });
    expect(reconcileDeclaredField('C:/Repo', 'C:/Other', equals).status).toBe('disagree');
  });
});

describe('nonUnknown (v1.2.2 Batch 3)', () => {
  it('treats undefined, empty, and "unknown" (any case) as absent', () => {
    expect(nonUnknown(undefined)).toBeUndefined();
    expect(nonUnknown('')).toBeUndefined();
    expect(nonUnknown('   ')).toBeUndefined();
    expect(nonUnknown('unknown')).toBeUndefined();
    expect(nonUnknown('UNKNOWN')).toBeUndefined();
    expect(nonUnknown('Unknown')).toBeUndefined();
  });

  it('returns a trimmed real value unchanged', () => {
    expect(nonUnknown('  fresh  ')).toBe('fresh');
    expect(nonUnknown('/idx')).toBe('/idx');
  });
});
