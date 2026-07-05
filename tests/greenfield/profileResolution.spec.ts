import { NormalizedGreenfieldBrief } from '../../src/greenfield/brief/briefTypes';
import { resolveGreenfieldProfile } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { TYPESCRIPT_CLI_PROFILE } from '../../src/greenfield/profiles/typescriptCliProfile';
import { NEXTJS_APP_PROFILE } from '../../src/greenfield/profiles/nextjsAppProfile';

function baseNormalizedBrief(overrides: Partial<NormalizedGreenfieldBrief> = {}): NormalizedGreenfieldBrief {
  return {
    rawIdea: 'A tool for tracking tasks across a small team.',
    constraints: [],
    nonGoals: [],
    preferredStack: [],
    documentationPreferences: [],
    testingExpectations: [],
    unresolved: [],
    ...overrides,
  };
}

describe('resolveGreenfieldProfile', () => {
  it('selects the explicit TypeScript CLI profile when requested', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: 'typescript-cli' }));
    expect(selection.status).toBe('selected');
    expect(selection.profile).toEqual(TYPESCRIPT_CLI_PROFILE);
    expect(selection.requestedProfileId).toBe('typescript-cli');
  });

  it('selects the explicit Next.js app profile when requested', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: 'nextjs-app' }));
    expect(selection.status).toBe('selected');
    expect(selection.profile).toEqual(NEXTJS_APP_PROFILE);
  });

  it('is case- and spacing-insensitive for explicit profile requests', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: 'TypeScript CLI'.toLowerCase() }));
    expect(selection.status).toBe('selected');
    expect(selection.profile?.id).toBe('typescript-cli');
  });

  it('returns unsupported for an unknown profile request without substituting a default', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: 'rust-cli' }));
    expect(selection.status).toBe('unsupported');
    expect(selection.profile).toBeUndefined();
    expect(selection.requestedProfileId).toBe('rust-cli');
    expect(selection.reason).toMatch(/not in the supported/);
  });

  it('returns unsupported (not a mobile fallback) for an Android Compose profile request', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: 'android-compose' }));
    expect(selection.status).toBe('unsupported');
    expect(selection.profile).toBeUndefined();
    const serialized = JSON.stringify(selection).toLowerCase();
    // The only occurrence of "android" should be the echoed requestedProfileId; no android
    // stack assumptions, template targets, or hints should appear anywhere in the result.
    expect(selection.requestedProfileId).toBe('android-compose');
    expect(serialized).not.toMatch(/compose-multiplatform|jetpack|kotlin/);
  });

  it('returns unsupported for other mobile profile requests (react-native, flutter, ios)', () => {
    for (const requested of ['react-native', 'flutter', 'ios']) {
      const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: requested }));
      expect(selection.status).toBe('unsupported');
      expect(selection.profile).toBeUndefined();
    }
  });

  it('applies a deterministic fallback to typescript-cli when no profile preference is given', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief());
    expect(selection.status).toBe('selected');
    expect(selection.profile?.id).toBe('typescript-cli');
    expect(selection.reason).toMatch(/deterministic fallback/);
  });

  it('applies a deterministic fallback to nextjs-app when platformTarget signals a web project', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ platformTarget: 'web' }));
    expect(selection.status).toBe('selected');
    expect(selection.profile?.id).toBe('nextjs-app');
  });

  it('applies a deterministic fallback to nextjs-app when preferredStack signals React/Next.js', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredStack: ['React', 'Node.js'] }));
    expect(selection.status).toBe('selected');
    expect(selection.profile?.id).toBe('nextjs-app');
  });

  it('is deterministic for the same normalized brief', () => {
    const brief = baseNormalizedBrief({ preferredStack: ['TypeScript'] });
    const first = resolveGreenfieldProfile(brief);
    const second = resolveGreenfieldProfile(brief);
    expect(first).toEqual(second);
  });

  it('produces no Android/mobile behavior in the deterministic fallback path', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief());
    const serialized = JSON.stringify(selection).toLowerCase();
    expect(serialized).not.toMatch(/android|ios\b|react-native|flutter/);
  });

  it('includes stack, docs, test, and validation hints suitable for later artifacts', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: 'typescript-cli' }));
    expect(selection.profile?.stackAssumptions.length).toBeGreaterThan(0);
    expect(selection.profile?.documentationExpectations.length).toBeGreaterThan(0);
    expect(selection.profile?.testExpectations.length).toBeGreaterThan(0);
    expect(selection.profile?.validationExpectations.length).toBeGreaterThan(0);
    expect(selection.stackDecisionNotes.length).toBeGreaterThan(0);
  });

  it('produces output shaped for artifacts/starter-profile.json and artifacts/stack-decision.txt', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: 'nextjs-app' }));
    // starter-profile.json consumers need status + profile; stack-decision.txt consumers need stackDecisionNotes.
    expect(selection).toEqual(
      expect.objectContaining({
        status: 'selected',
        profile: expect.objectContaining({ id: 'nextjs-app' }),
        stackDecisionNotes: expect.any(Array),
        reason: expect.any(String),
      }),
    );
  });
});
