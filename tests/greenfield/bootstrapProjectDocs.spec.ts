import * as fs from 'fs';
import * as path from 'path';
import { normalizeProjectBrief } from '../../src/greenfield/brief/normalizeProjectBrief';
import { resolveGreenfieldProfile } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { buildGreenfieldBootstrapBundle } from '../../src/greenfield/bootstrap/buildBootstrapBundle';
import { bootstrapProjectDocs } from '../../src/greenfield/bootstrap/bootstrapProjectDocs';
import { validateBootstrapDocs } from '../../src/greenfield/bootstrap/validateBootstrapDocs';
import { GreenfieldProjectDocBootstrapResult } from '../../src/greenfield/bootstrap/projectDocBootstrapTypes';

const REQUIRED_DOC_NAMES = [
  'product-boundary',
  'stack-decision',
  'starter-profile-summary',
  'development-workflow',
  'testing-expectations',
  'validation-expectations',
  'scaffold-planning-notes',
  'unresolved-decisions',
  'non-goals',
];

function buildBundleFor(rawIdea: string, overrides: Record<string, unknown> = {}) {
  const normalizedBrief = normalizeProjectBrief({ rawIdea, ...overrides } as any).normalized;
  const selection = resolveGreenfieldProfile(normalizedBrief);
  return buildGreenfieldBootstrapBundle(normalizedBrief, selection);
}

describe('bootstrapProjectDocs', () => {
  it('generates docs from a minimal bundle', () => {
    const bundle = buildBundleFor('A tool for tracking tasks across a small team.');
    const result = bootstrapProjectDocs(bundle);
    expect(result.targets.map((t) => t.docName).sort()).toEqual([...REQUIRED_DOC_NAMES].sort());
  });

  it('generates docs from an explicit TypeScript CLI bundle', () => {
    const bundle = buildBundleFor('A CLI tool for dotfiles.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const profileDoc = result.targets.find((t) => t.docName === 'starter-profile-summary')!;
    expect(profileDoc.status).toBe('generated');
    expect(profileDoc.sections.find((s) => s.heading === 'Profile')?.content).toBe('TypeScript CLI');
  });

  it('generates docs from an explicit Next.js app bundle', () => {
    const bundle = buildBundleFor('A web dashboard for analytics.', { preferredProfile: 'nextjs-app' });
    const result = bootstrapProjectDocs(bundle);
    const profileDoc = result.targets.find((t) => t.docName === 'starter-profile-summary')!;
    expect(profileDoc.sections.find((s) => s.heading === 'Profile')?.content).toBe('Next.js App');
  });

  it('includes a product boundary doc', () => {
    const bundle = buildBundleFor('A tool for tracking tasks and habits daily.', {
      productGoal: 'Help users build habits',
      usersOrAudience: 'Individuals',
      coreWorkflow: 'Log a habit, review streaks',
    });
    const result = bootstrapProjectDocs(bundle);
    const doc = result.targets.find((t) => t.docName === 'product-boundary')!;
    expect(doc.status).toBe('generated');
    expect(doc.sections.find((s) => s.heading === 'Product goal')?.content).toBe('Help users build habits');
  });

  it('includes a stack decision doc', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const doc = result.targets.find((t) => t.docName === 'stack-decision')!;
    expect(doc.sections.find((s) => s.heading === 'Chosen stack')?.content).toMatch(/TypeScript/);
  });

  it('includes a starter profile summary doc', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    expect(result.targets.find((t) => t.docName === 'starter-profile-summary')).toBeDefined();
  });

  it('includes testing expectations', () => {
    const bundle = buildBundleFor('A CLI tool.', {
      preferredProfile: 'typescript-cli',
      testingExpectations: ['integration tests for the sync flow'],
    });
    const result = bootstrapProjectDocs(bundle);
    const doc = result.targets.find((t) => t.docName === 'testing-expectations')!;
    expect(doc.sections[0].content).toMatch(/integration tests for the sync flow/);
  });

  it('includes validation expectations', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const doc = result.targets.find((t) => t.docName === 'validation-expectations')!;
    expect(doc.sections[0].content.length).toBeGreaterThan(0);
  });

  it('includes scaffold planning notes without executing a scaffold', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const doc = result.targets.find((t) => t.docName === 'scaffold-planning-notes')!;
    expect(doc.sections.find((s) => s.heading === 'Note')?.content).toMatch(/out of scope for this batch/);
  });

  it('preserves unresolved decisions', () => {
    const bundle = buildBundleFor('A tool for tracking tasks and habits daily use.');
    const result = bootstrapProjectDocs(bundle);
    expect(result.unresolvedDecisions.length).toBeGreaterThan(0);
    const doc = result.targets.find((t) => t.docName === 'unresolved-decisions')!;
    expect(doc.sections.length).toBe(result.unresolvedDecisions.length);
  });

  it('preserves non-goals', () => {
    const bundle = buildBundleFor('A tool for managing budgets.', { nonGoals: ['no mobile app'] });
    const result = bootstrapProjectDocs(bundle);
    const doc = result.targets.find((t) => t.docName === 'non-goals')!;
    expect(doc.sections[0].content).toBe('no mobile app');
  });

  it('produces deterministic output for the same bundle', () => {
    const bundle = buildBundleFor('A CLI tool for syncing notes.', { preferredStack: ['TypeScript'] });
    const first = bootstrapProjectDocs(bundle);
    const second = bootstrapProjectDocs(bundle);
    expect(first).toEqual(second);
  });

  it('produces no component doc targets since the brief schema does not capture module hints', () => {
    const bundle = buildBundleFor('A CLI tool.');
    const result = bootstrapProjectDocs(bundle);
    expect(result.componentTargets).toEqual([]);
  });

  it('does not modify the current repository README.md or docs while generating docs', () => {
    const readmePath = path.resolve(__dirname, '../../README.md');
    const before = fs.statSync(readmePath).mtimeMs;
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    bootstrapProjectDocs(bundle);
    const after = fs.statSync(readmePath).mtimeMs;
    expect(after).toBe(before);
  });
});

describe('validateBootstrapDocs', () => {
  it('passes validation for a complete generated doc set', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const validation = validateBootstrapDocs(result);
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it('flags missing required sections', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const incomplete: GreenfieldProjectDocBootstrapResult = {
      ...result,
      targets: result.targets.filter((t) => t.docName !== 'non-goals'),
    };
    const validation = validateBootstrapDocs(incomplete);
    expect(validation.valid).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({ docName: 'non-goals', kind: 'missing-required-section' }),
    );
  });

  it('flags an Android/mobile claim if one appears in generated docs for a non-android-compose profile', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const tampered: GreenfieldProjectDocBootstrapResult = {
      ...result,
      targets: result.targets.map((t) =>
        t.docName === 'non-goals'
          ? { ...t, sections: [{ heading: 'Non-goals', content: 'supports Android out of the box' }] }
          : t,
      ),
    };
    // v1.2.0: validateBootstrapDocs is now profile-aware; explicitly pass the
    // profile id (typescript-cli) so this test does not rely on the
    // no-profile-id default behavior.
    const validation = validateBootstrapDocs(tampered, 'typescript-cli');
    expect(validation.valid).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({ docName: 'non-goals', kind: 'android-mobile-claim' }),
    );
  });

  it('v1.2.0: permits an Android/Jetpack claim when the selected profile is android-compose', () => {
    const bundle = buildBundleFor('An Android app.', { preferredProfile: 'android-compose' });
    const result = bootstrapProjectDocs(bundle);
    const tampered: GreenfieldProjectDocBootstrapResult = {
      ...result,
      targets: result.targets.map((t) =>
        t.docName === 'non-goals'
          ? { ...t, sections: [{ heading: 'Non-goals', content: 'built with Android and Jetpack Compose' }] }
          : t,
      ),
    };
    const validation = validateBootstrapDocs(tampered, 'android-compose');
    expect(validation.issues.find((i) => i.kind === 'android-mobile-claim')).toBeUndefined();
  });

  it('v1.2.0: still flags iOS/React Native/Flutter/multiplatform claims even for android-compose', () => {
    const bundle = buildBundleFor('An Android app.', { preferredProfile: 'android-compose' });
    const result = bootstrapProjectDocs(bundle);
    const tampered: GreenfieldProjectDocBootstrapResult = {
      ...result,
      targets: result.targets.map((t) =>
        t.docName === 'non-goals'
          ? { ...t, sections: [{ heading: 'Non-goals', content: 'also runs on iOS via Compose Multiplatform' }] }
          : t,
      ),
    };
    const validation = validateBootstrapDocs(tampered, 'android-compose');
    expect(validation.valid).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({ docName: 'non-goals', kind: 'unsupported-platform-claim' }),
    );
  });

  it('v1.2.0: flags a Play Store/release-readiness claim for any profile, including android-compose', () => {
    const bundle = buildBundleFor('An Android app.', { preferredProfile: 'android-compose' });
    const result = bootstrapProjectDocs(bundle);
    const tampered: GreenfieldProjectDocBootstrapResult = {
      ...result,
      targets: result.targets.map((t) =>
        t.docName === 'non-goals'
          ? { ...t, sections: [{ heading: 'Non-goals', content: 'ready for Play Store submission' }] }
          : t,
      ),
    };
    const validation = validateBootstrapDocs(tampered, 'android-compose');
    expect(validation.valid).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({ docName: 'non-goals', kind: 'play-store-release-readiness-claim' }),
    );
  });

  it('flags a release/security/publish claim if one appears in generated docs', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const tampered: GreenfieldProjectDocBootstrapResult = {
      ...result,
      targets: result.targets.map((t) =>
        t.docName === 'validation-expectations'
          ? { ...t, sections: [{ heading: 'Validation expectations', content: 'security validated and released' }] }
          : t,
      ),
    };
    const validation = validateBootstrapDocs(tampered);
    expect(validation.valid).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({ docName: 'validation-expectations', kind: 'release-security-publish-claim' }),
    );
  });

  it('is deterministic for the same input', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    expect(validateBootstrapDocs(result)).toEqual(validateBootstrapDocs(result));
  });
});
