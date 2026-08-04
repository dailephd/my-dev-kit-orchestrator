import { normalizeProjectBrief } from '../../src/greenfield/brief/normalizeProjectBrief';
import { resolveGreenfieldProfile } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { buildGreenfieldBootstrapBundle } from '../../src/greenfield/bootstrap/buildBootstrapBundle';
import { bootstrapProjectDocs } from '../../src/greenfield/bootstrap/bootstrapProjectDocs';
import {
  validateBootstrapDocs,
  validateGreenfieldProfileDocumentation,
} from '../../src/greenfield/bootstrap/validateBootstrapDocs';
import { GreenfieldProjectDocBootstrapResult } from '../../src/greenfield/bootstrap/projectDocBootstrapTypes';
import { TYPESCRIPT_CLI_PROFILE } from '../../src/greenfield/profiles/typescriptCliProfile';
import { NEXTJS_APP_PROFILE } from '../../src/greenfield/profiles/nextjsAppProfile';
import { ANDROID_COMPOSE_PROFILE } from '../../src/greenfield/profiles/androidComposeProfile';

function buildBundleFor(rawIdea: string, overrides: Record<string, unknown> = {}) {
  const normalizedBrief = normalizeProjectBrief({ rawIdea, ...overrides } as any).normalized;
  const selection = resolveGreenfieldProfile(normalizedBrief);
  return buildGreenfieldBootstrapBundle(normalizedBrief, selection);
}

// TST-028: valid docs for each current profile -> valid profile-owned requirements.
describe('validateGreenfieldProfileDocumentation - valid current profiles (TST-028)', () => {
  it('typescript-cli generated docs are valid with zero shared-system issues', () => {
    const bundle = buildBundleFor('A CLI tool for syncing notes.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const validation = validateGreenfieldProfileDocumentation(result, TYPESCRIPT_CLI_PROFILE);
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it('nextjs-app generated docs are valid with zero shared-system issues', () => {
    const bundle = buildBundleFor('A web dashboard for analytics.', { preferredProfile: 'nextjs-app' });
    const result = bootstrapProjectDocs(bundle);
    const validation = validateGreenfieldProfileDocumentation(result, NEXTJS_APP_PROFILE);
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it('android-compose generated docs are valid with zero shared-system issues', () => {
    const bundle = buildBundleFor('An Android app for tracking habits.', { preferredProfile: 'android-compose' });
    const result = bootstrapProjectDocs(bundle);
    const validation = validateGreenfieldProfileDocumentation(result, ANDROID_COMPOSE_PROFILE);
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });
});

// TST-029: Android terminology in non-Android profile docs, and Next.js
// terminology in unrelated profile docs -> profile-owned unsupported-claim issue.
describe('validateBootstrapDocs / validateGreenfieldProfileDocumentation - terminology boundaries (TST-029)', () => {
  it('flags an Android/Jetpack claim in typescript-cli docs', () => {
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
    const legacyValidation = validateBootstrapDocs(tampered, 'typescript-cli');
    expect(legacyValidation.issues).toContainEqual(expect.objectContaining({ kind: 'android-mobile-claim' }));

    const sharedValidation = validateGreenfieldProfileDocumentation(tampered, TYPESCRIPT_CLI_PROFILE);
    expect(sharedValidation.valid).toBe(false);
    expect(sharedValidation.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_DOC_UNSUPPORTED_CLAIM', profileId: 'typescript-cli' }),
    );
  });

  it('flags a Next.js/React claim in typescript-cli docs (symmetric new check)', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const tampered: GreenfieldProjectDocBootstrapResult = {
      ...result,
      targets: result.targets.map((t) =>
        t.docName === 'non-goals'
          ? { ...t, sections: [{ heading: 'Non-goals', content: 'built with Next.js and React' }] }
          : t,
      ),
    };
    const legacyValidation = validateBootstrapDocs(tampered, 'typescript-cli');
    expect(legacyValidation.issues).toContainEqual(expect.objectContaining({ kind: 'nextjs-web-claim' }));

    const sharedValidation = validateGreenfieldProfileDocumentation(tampered, TYPESCRIPT_CLI_PROFILE);
    expect(sharedValidation.valid).toBe(false);
    expect(sharedValidation.issues).toContainEqual(expect.objectContaining({ code: 'GF_DOC_UNSUPPORTED_CLAIM' }));
  });

  it('permits a Next.js/React claim when the selected profile is nextjs-app', () => {
    const bundle = buildBundleFor('A web dashboard.', { preferredProfile: 'nextjs-app' });
    const result = bootstrapProjectDocs(bundle);
    const tampered: GreenfieldProjectDocBootstrapResult = {
      ...result,
      targets: result.targets.map((t) =>
        t.docName === 'non-goals'
          ? { ...t, sections: [{ heading: 'Non-goals', content: 'built with Next.js and React' }] }
          : t,
      ),
    };
    const legacyValidation = validateBootstrapDocs(tampered, 'nextjs-app');
    expect(legacyValidation.issues.find((i) => i.kind === 'nextjs-web-claim')).toBeUndefined();

    const sharedValidation = validateGreenfieldProfileDocumentation(tampered, NEXTJS_APP_PROFILE);
    expect(sharedValidation.issues).toEqual([]);
  });

  it('still permits an Android/Jetpack claim when the selected profile is android-compose (v1.2.0 preserved)', () => {
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
});

// TST-030: store-publication or static-analysis claim -> GF_DOC_UNSUPPORTED_CLAIM.
describe('validateGreenfieldProfileDocumentation - store/static-analysis claims (TST-030)', () => {
  it('flags a Play Store readiness claim', () => {
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
    const sharedValidation = validateGreenfieldProfileDocumentation(tampered, ANDROID_COMPOSE_PROFILE);
    expect(sharedValidation.valid).toBe(false);
    expect(sharedValidation.issues).toContainEqual(expect.objectContaining({ code: 'GF_DOC_UNSUPPORTED_CLAIM' }));
  });

  it('flags a static-analysis claim (new regex coverage)', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const tampered: GreenfieldProjectDocBootstrapResult = {
      ...result,
      targets: result.targets.map((t) =>
        t.docName === 'validation-expectations'
          ? { ...t, sections: [{ heading: 'Validation expectations', content: 'static analysis passed' }] }
          : t,
      ),
    };
    const legacyValidation = validateBootstrapDocs(tampered);
    expect(legacyValidation.issues).toContainEqual(
      expect.objectContaining({ kind: 'release-security-publish-claim' }),
    );
    const sharedValidation = validateGreenfieldProfileDocumentation(tampered, TYPESCRIPT_CLI_PROFILE);
    expect(sharedValidation.issues).toContainEqual(expect.objectContaining({ code: 'GF_DOC_UNSUPPORTED_CLAIM' }));
  });
});

// TST-031: autonomous command/dependency/scaffold execution claim -> unsupported-claim issue.
describe('validateGreenfieldProfileDocumentation - autonomous execution claims (TST-031)', () => {
  it('flags a claim that the orchestrator automatically installs dependencies', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const tampered: GreenfieldProjectDocBootstrapResult = {
      ...result,
      targets: result.targets.map((t) =>
        t.docName === 'development-workflow'
          ? { ...t, sections: [{ heading: 'Setup', content: 'automatically installs dependencies for you' }] }
          : t,
      ),
    };
    const legacyValidation = validateBootstrapDocs(tampered, 'typescript-cli');
    expect(legacyValidation.issues).toContainEqual(expect.objectContaining({ kind: 'autonomous-execution-claim' }));

    const sharedValidation = validateGreenfieldProfileDocumentation(tampered, TYPESCRIPT_CLI_PROFILE);
    expect(sharedValidation.valid).toBe(false);
    expect(sharedValidation.issues).toContainEqual(expect.objectContaining({ code: 'GF_DOC_UNSUPPORTED_CLAIM' }));
  });
});

// TST-032: missing setup or verification guidance -> GF_DOC_REQUIREMENT_MISSING with affected requirement.
describe('validateGreenfieldProfileDocumentation - missing guidance (TST-032)', () => {
  it('flags a guidance-bearing doc that was not generated (missing-required-section)', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const incomplete: GreenfieldProjectDocBootstrapResult = {
      ...result,
      targets: result.targets.filter((t) => t.docName !== 'validation-expectations'),
    };
    const sharedValidation = validateGreenfieldProfileDocumentation(incomplete, TYPESCRIPT_CLI_PROFILE);
    expect(sharedValidation.valid).toBe(false);
    expect(sharedValidation.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_DOC_REQUIREMENT_MISSING', affectedContract: 'validation-expectations' }),
    );
  });

  it('flags a guidance-bearing doc with a "skipped" status as missing required guidance', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const tampered: GreenfieldProjectDocBootstrapResult = {
      ...result,
      targets: result.targets.map((t) => (t.docName === 'testing-expectations' ? { ...t, status: 'skipped' } : t)),
    };
    const sharedValidation = validateGreenfieldProfileDocumentation(tampered, TYPESCRIPT_CLI_PROFILE);
    expect(sharedValidation.valid).toBe(false);
    expect(sharedValidation.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_DOC_REQUIREMENT_MISSING', affectedContract: 'testing-expectations' }),
    );
  });
});

// TST-033: optional external prerequisite described honestly -> valid, no implied availability.
describe('validateGreenfieldProfileDocumentation - honest optional prerequisite wording (TST-033)', () => {
  it('does not flag android-compose docs for honestly describing the external Android SDK prerequisite', () => {
    const bundle = buildBundleFor('An Android app.', { preferredProfile: 'android-compose' });
    const result = bootstrapProjectDocs(bundle);
    const validation = validateGreenfieldProfileDocumentation(result, ANDROID_COMPOSE_PROFILE);
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
    const allText = result.targets.flatMap((t) => t.sections.map((s) => s.content)).join(' ').toLowerCase();
    expect(allText).not.toMatch(/android sdk (is installed|exists|available)/);
    expect(allText).not.toMatch(/emulator (is running|exists|available)/);
  });
});

describe('validateGreenfieldProfileDocumentation - determinism and non-mutation', () => {
  it('is deterministic for the same input', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    expect(validateGreenfieldProfileDocumentation(result, TYPESCRIPT_CLI_PROFILE)).toEqual(
      validateGreenfieldProfileDocumentation(result, TYPESCRIPT_CLI_PROFILE),
    );
  });

  it('never throws when no profile is provided', () => {
    const bundle = buildBundleFor('A tool for tracking tasks.');
    const result = bootstrapProjectDocs(bundle);
    expect(() => validateGreenfieldProfileDocumentation(result)).not.toThrow();
  });
});
