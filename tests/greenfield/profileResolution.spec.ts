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

  // v1.2.0: android-compose is now a supported profile (see
  // artifacts/v1.2.0-android-compose-profile-contract.txt). This test
  // previously asserted "unsupported" as a v1.1.0-era regression guard; that
  // assumption is now false and the test is updated accordingly, per the
  // same "narrowly fix stale assumptions, do not weaken real behavior"
  // discipline used for the v1.1.0 mode-count fixes.
  it('selects the explicit Android Compose profile (v1.2.0)', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: 'android-compose' }));
    expect(selection.status).toBe('selected');
    expect(selection.profile?.id).toBe('android-compose');
    expect(selection.requestedProfileId).toBe('android-compose');
  });

  it('does not leak Android/mobile stack details into an unrelated unsupported profile request', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: 'rust-mobile-thing' }));
    expect(selection.status).toBe('unsupported');
    expect(selection.profile).toBeUndefined();
    const serialized = JSON.stringify(selection).toLowerCase();
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

  it('every supported profile declares setupCommands and validationCommands (v1.2.0 contract fields)', () => {
    for (const preferredProfile of ['typescript-cli', 'nextjs-app', 'android-compose']) {
      const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile }));
      expect(Array.isArray(selection.profile?.setupCommands)).toBe(true);
      expect(Array.isArray(selection.profile?.validationCommands)).toBe(true);
    }
  });

  it('TypeScript CLI setupCommands/validationCommands preserve current implicit behavior', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: 'typescript-cli' }));
    expect(selection.profile?.setupCommands).toEqual([
      { command: 'npm install', purpose: 'Install dependencies.', required: true },
    ]);
    expect(selection.profile?.validationCommands.map((c) => c.command)).toEqual([
      'npm run typecheck',
      'npm run build',
      'npm test',
    ]);
  });

  it('Next.js app setupCommands/validationCommands preserve current implicit behavior', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: 'nextjs-app' }));
    expect(selection.profile?.setupCommands).toEqual([
      { command: 'npm install', purpose: 'Install dependencies.', required: true },
    ]);
    expect(selection.profile?.validationCommands.map((c) => c.command)).toEqual([
      'npm run typecheck',
      'npm run build',
      'npm test',
    ]);
  });
});

describe('resolveGreenfieldProfile - Android Compose aliases (v1.2.0)', () => {
  it.each([
    ['android', 'android-compose'],
    ['Android Compose', 'android-compose'],
    ['android compose', 'android-compose'],
    ['kotlin-compose', 'android-compose'],
    ['kotlin compose', 'android-compose'],
    ['jetpack-compose', 'android-compose'],
    ['jetpack compose', 'android-compose'],
    ['compose android', 'android-compose'],
  ])('resolves preferredProfile "%s" to %s', (requested, expectedId) => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: requested }));
    expect(selection.status).toBe('selected');
    expect(selection.profile?.id).toBe(expectedId);
  });

  it('does not use fuzzy matching for unrelated words containing partial overlaps', () => {
    // "androidx" and "androidish" are not android/android-compose and must not resolve.
    for (const requested of ['androidx', 'androidish', 'kotlin', 'compose']) {
      const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: requested }));
      expect(selection.status).not.toBe('selected');
    }
  });
});

describe('resolveGreenfieldProfile - generic mobile ambiguity (v1.2.0)', () => {
  it.each(['mobile', 'mobile app', 'phone app'])(
    'returns unresolved (not selected, not unsupported) for explicit preferredProfile "%s"',
    (requested) => {
      const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: requested }));
      expect(selection.status).toBe('unresolved');
      expect(selection.profile).toBeUndefined();
      expect(selection.reason).toMatch(/android-compose/i);
      expect(selection.reason).toMatch(/ios.*flutter.*react native|not supported/i);
    },
  );

  it('returns unresolved when platformTarget signals generic mobile without a preferredProfile', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ platformTarget: 'mobile' }));
    expect(selection.status).toBe('unresolved');
    expect(selection.profile).toBeUndefined();
  });

  it('returns unresolved when preferredStack signals "phone app" without a preferredProfile', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredStack: ['phone app'] }));
    expect(selection.status).toBe('unresolved');
  });

  it('does not silently select android-compose for generic mobile ambiguity', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: 'mobile app' }));
    expect(selection.profile?.id).not.toBe('android-compose');
    expect(selection.status).not.toBe('selected');
  });
});

describe('resolveGreenfieldProfile - unsupported platforms remain unsupported (v1.2.0 regression)', () => {
  it.each(['ios', 'flutter', 'react-native', 'react native'])(
    'still returns unsupported for "%s" and never aliases to android-compose',
    (requested) => {
      const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: requested }));
      expect(selection.status).toBe('unsupported');
      expect(selection.profile).toBeUndefined();
    },
  );
});

describe('resolveGreenfieldProfile - projectType/webFramework compatibility (v1.3.1 Batch 1)', () => {
  // TST-B1-001: legacy briefs (no projectType/webFramework) are unaffected.
  it('TST-B1-001: legacy brief without projectType/webFramework resolves exactly as before', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: 'nextjs-app' }));
    expect(selection.status).toBe('selected');
    expect(selection.profile?.id).toBe('nextjs-app');
  });

  // TST-B1-004: the supported full-stack combination is accepted.
  it('TST-B1-004: fullstack-web + nextjs + nextjs-app is accepted as compatible', () => {
    const selection = resolveGreenfieldProfile(
      baseNormalizedBrief({
        preferredProfile: 'nextjs-app',
        projectType: 'fullstack-web',
        webFramework: 'nextjs',
      }),
    );
    expect(selection.status).toBe('selected');
    expect(selection.profile?.id).toBe('nextjs-app');
  });

  // TST-B1-005: typescript-cli is not accepted for the explicit combination.
  it('TST-B1-005: typescript-cli is not accepted for an explicit fullstack-web + nextjs request', () => {
    const selection = resolveGreenfieldProfile(
      baseNormalizedBrief({
        preferredProfile: 'typescript-cli',
        projectType: 'fullstack-web',
        webFramework: 'nextjs',
      }),
    );
    expect(selection.status).toBe('unsupported');
    expect(selection.profile).toBeUndefined();
    expect(selection.reason).toMatch(/not compatible/i);
  });

  // TST-B1-006: android-compose is not accepted for the explicit combination.
  it('TST-B1-006: android-compose is not accepted for an explicit fullstack-web + nextjs request', () => {
    const selection = resolveGreenfieldProfile(
      baseNormalizedBrief({
        preferredProfile: 'android-compose',
        projectType: 'fullstack-web',
        webFramework: 'nextjs',
      }),
    );
    expect(selection.status).toBe('unsupported');
    expect(selection.profile).toBeUndefined();
    expect(selection.reason).toMatch(/not compatible/i);
  });

  // TST-B1-007: an unsupported dimension value is not silently accepted.
  it('TST-B1-007: an unsupported projectType value is not accepted even with a compatible profile', () => {
    const selection = resolveGreenfieldProfile(
      baseNormalizedBrief({
        preferredProfile: 'nextjs-app',
        projectType: 'embedded-firmware',
      }),
    );
    expect(selection.status).toBe('unsupported');
    expect(selection.profile).toBeUndefined();
  });

  it('TST-B1-007: an unsupported webFramework value is not accepted even with a compatible profile', () => {
    const selection = resolveGreenfieldProfile(
      baseNormalizedBrief({
        preferredProfile: 'nextjs-app',
        webFramework: 'sveltekit',
      }),
    );
    expect(selection.status).toBe('unsupported');
    expect(selection.profile).toBeUndefined();
  });

  it('does not evaluate projectType/webFramework compatibility when neither dimension is requested', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: 'typescript-cli' }));
    expect(selection.status).toBe('selected');
    expect(selection.profile?.id).toBe('typescript-cli');
  });

  it('does not silently reinterpret an incompatible request as another supported profile', () => {
    const selection = resolveGreenfieldProfile(
      baseNormalizedBrief({
        preferredProfile: 'typescript-cli',
        projectType: 'fullstack-web',
        webFramework: 'nextjs',
      }),
    );
    expect(selection.profile).toBeUndefined();
    expect(selection.requestedProfileId).toBe('typescript-cli');
  });
});
