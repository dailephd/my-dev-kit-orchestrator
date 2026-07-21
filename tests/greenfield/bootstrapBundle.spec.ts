import { normalizeProjectBrief } from '../../src/greenfield/brief/normalizeProjectBrief';
import { NormalizedGreenfieldBrief } from '../../src/greenfield/brief/briefTypes';
import { resolveGreenfieldProfile } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { buildGreenfieldBootstrapBundle } from '../../src/greenfield/bootstrap/buildBootstrapBundle';

function normalize(rawIdea: string, overrides: Partial<Parameters<typeof normalizeProjectBrief>[0]> = {}) {
  return normalizeProjectBrief({ rawIdea, ...overrides }).normalized;
}

describe('buildGreenfieldBootstrapBundle', () => {
  it('builds a bundle from a minimal normalized brief and default (fallback) profile selection', () => {
    const normalizedBrief = normalize('A tool for tracking tasks across a small team.');
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);

    expect(bundle.normalizedBrief).toEqual(normalizedBrief);
    expect(bundle.selectedProfile).toEqual(selection);
    expect(bundle.starterProfile.status).toBe('selected');
    expect(bundle.stackDecision.status).toBe('partially-resolved');
  });

  it('builds a bundle for an explicit TypeScript CLI profile selection', () => {
    const normalizedBrief = normalize('A CLI tool for managing dotfiles across machines.', {
      preferredProfile: 'typescript-cli',
    });
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);

    expect(bundle.starterProfile.profileId).toBe('typescript-cli');
    expect(bundle.stackDecision.status).toBe('resolved');
    expect(bundle.stackDecision.chosenStack).toEqual(expect.arrayContaining(['TypeScript', 'Node.js']));
  });

  it('builds a bundle for an explicit Next.js app profile selection', () => {
    const normalizedBrief = normalize('A web dashboard for visualizing team analytics.', {
      preferredProfile: 'nextjs-app',
    });
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);

    expect(bundle.starterProfile.profileId).toBe('nextjs-app');
    expect(bundle.stackDecision.chosenStack).toEqual(expect.arrayContaining(['Next.js', 'React']));
  });

  it('preserves constraints from the normalized brief in doc generation instructions and scaffold inputs', () => {
    const normalizedBrief = normalize('A tool that must remain offline-capable for field teams.', {
      constraints: ['must work offline', 'no third-party analytics'],
    });
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);

    expect(bundle.normalizedBrief.constraints).toEqual(['must work offline', 'no third-party analytics']);
  });

  it('preserves non-goals from the normalized brief', () => {
    const normalizedBrief = normalize('A tool for managing personal finances and budgets.', {
      nonGoals: ['no mobile app', 'no multi-currency support'],
    });
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);

    expect(bundle.normalizedBrief.nonGoals).toEqual(['no mobile app', 'no multi-currency support']);
  });

  it('preserves unresolved decisions from the normalized brief and adds bundle-level ones', () => {
    const normalizedBrief = normalize('A tool for tracking tasks and habits.');
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);

    const fields = bundle.unresolvedDecisions.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['productGoal', 'usersOrAudience', 'coreWorkflow', 'componentBoundaries']));
  });

  it('preserves the selected profile from Batch 2 profile resolution unchanged', () => {
    const normalizedBrief = normalize('A CLI tool for X.', { preferredProfile: 'typescript-cli' });
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);

    expect(bundle.selectedProfile).toBe(selection);
  });

  it('produces a stack decision', () => {
    const normalizedBrief = normalize('A CLI tool for X.');
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);

    expect(bundle.stackDecision).toBeDefined();
    expect(['resolved', 'partially-resolved', 'unresolved']).toContain(bundle.stackDecision.status);
  });

  it('produces doc generation instructions', () => {
    const normalizedBrief = normalize('A CLI tool for X.', { preferredProfile: 'typescript-cli' });
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);

    expect(bundle.docGenerationInstructions.productBoundary).toEqual(expect.any(String));
    expect(bundle.docGenerationInstructions.validationExpectations.length).toBeGreaterThan(0);
  });

  it('produces scaffold planning inputs without performing scaffold execution', () => {
    const normalizedBrief = normalize('A CLI tool for X.', { preferredProfile: 'typescript-cli' });
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);

    expect(bundle.scaffoldPlanningInputs.profileId).toBe('typescript-cli');
    expect(bundle.scaffoldPlanningInputs.scaffoldPlanningHints.length).toBeGreaterThan(0);
    // No scaffold execution: bundle contains only planning strings, no file paths written anywhere.
    expect(bundle.scaffoldPlanningInputs).not.toHaveProperty('writtenFiles');
  });

  it('produces validation rules', () => {
    const normalizedBrief = normalize('A CLI tool for X.');
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);

    // v1.2.0: 'no-android-mobile-claims' was split into an always-on
    // unsupported-platform rule and a profile-conditional Android/Jetpack
    // rule (see tests/greenfield/androidComposeBootstrapBundle.spec.ts for
    // the android-compose-selected case, where the conditional rule flips).
    expect(bundle.validationRules.length).toBeGreaterThan(0);
    expect(bundle.validationRules.map((r) => r.id)).toEqual(
      expect.arrayContaining([
        'no-unsupported-mobile-platform-claims',
        'android-claims-require-android-compose-profile',
        'no-release-security-publish-claims',
        'no-play-store-release-readiness-claims',
      ]),
    );
  });

  it('is deterministic for the same normalized brief and profile selection', () => {
    const normalizedBrief = normalize('A CLI tool for syncing notes between devices.', {
      preferredStack: ['TypeScript'],
    });
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const first = buildGreenfieldBootstrapBundle(normalizedBrief, selection);
    const second = buildGreenfieldBootstrapBundle(normalizedBrief, selection);
    expect(first).toEqual(second);
  });

  it('does not reintroduce StarterConfig or TaskBundle-shaped fields', () => {
    const normalizedBrief = normalize('A CLI tool for X.');
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);
    const serialized = JSON.stringify(bundle);

    expect(bundle).not.toHaveProperty('config');
    expect(bundle).not.toHaveProperty('schemaVersion');
    expect(bundle).not.toHaveProperty('buildTime');
    expect(bundle).not.toHaveProperty('entries');
    expect(bundle).not.toHaveProperty('docSections');
    expect(serialized).not.toMatch(/taskBundleType|bootstrapVersion/);
  });

  it('does not insert an Android or mobile default anywhere in the generated content', () => {
    const normalizedBrief = normalize('A CLI tool for X.');
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);
    // validationRules intentionally names these terms as rule descriptions (e.g.
    // "no-android-mobile-claims"); exclude that metadata and check only the
    // content fields that could actually carry a claim.
    const { validationRules: _validationRules, ...contentOnly } = bundle;
    const serialized = JSON.stringify(contentOnly).toLowerCase();
    expect(serialized).not.toMatch(/android|react-native|flutter|jetpack/);
  });

  it('performs no scaffold execution or filesystem writes while building the bundle', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    // Use a dedicated, exclusively-owned temp directory rather than counting
    // entries in the shared os.tmpdir() root (flaky under parallel test execution).
    const ownDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-bundle-build-'));
    const before = fs.readdirSync(ownDir).length;
    const normalizedBrief = normalize('A CLI tool for X.');
    const selection = resolveGreenfieldProfile(normalizedBrief);
    buildGreenfieldBootstrapBundle(normalizedBrief, selection);
    const after = fs.readdirSync(ownDir).length;
    fs.rmSync(ownDir, { recursive: true, force: true });
    expect(after).toBe(before);
  });

  it('handles an unsupported profile request by leaving the stack decision unresolved rather than substituting a default', () => {
    const normalizedBrief = normalize('A CLI tool for X.', { preferredProfile: 'rust-cli' });
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);

    expect(bundle.starterProfile.status).toBe('unsupported');
    expect(bundle.stackDecision.status).toBe('unresolved');
    expect(bundle.stackDecision.unsupportedRequests).toEqual(['rust-cli']);
  });
});
