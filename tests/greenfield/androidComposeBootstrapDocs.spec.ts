import { normalizeProjectBrief } from '../../src/greenfield/brief/normalizeProjectBrief';
import { resolveGreenfieldProfile } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { buildGreenfieldBootstrapBundle } from '../../src/greenfield/bootstrap/buildBootstrapBundle';
import { bootstrapProjectDocs } from '../../src/greenfield/bootstrap/bootstrapProjectDocs';
import { validateBootstrapDocs } from '../../src/greenfield/bootstrap/validateBootstrapDocs';

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

function buildAndroidComposeDocsResult(rawIdea: string, overrides: Record<string, unknown> = {}) {
  const normalizedBrief = normalizeProjectBrief({
    rawIdea,
    preferredProfile: 'android-compose',
    ...overrides,
  } as any).normalized;
  const selection = resolveGreenfieldProfile(normalizedBrief);
  const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);
  return { bundle, result: bootstrapProjectDocs(bundle) };
}

describe('Android Compose project docs bootstrap (v1.2.0)', () => {
  it('generates all nine required doc categories', () => {
    const { result } = buildAndroidComposeDocsResult('An Android app for tracking habits.');
    expect(result.targets.map((t) => t.docName).sort()).toEqual([...REQUIRED_DOC_NAMES].sort());
  });

  it('stack-decision doc includes Kotlin/Jetpack Compose/Gradle guidance', () => {
    const { result } = buildAndroidComposeDocsResult('An Android app.');
    const doc = result.targets.find((t) => t.docName === 'stack-decision')!;
    const text = doc.sections.map((s) => s.content).join(' ');
    expect(text).toMatch(/Kotlin/);
    expect(text).toMatch(/Jetpack Compose/);
    expect(text).toMatch(/Gradle/);
  });

  it('starter-profile-summary doc names Android Compose', () => {
    const { result } = buildAndroidComposeDocsResult('An Android app.');
    const doc = result.targets.find((t) => t.docName === 'starter-profile-summary')!;
    expect(doc.sections.find((s) => s.heading === 'Profile')?.content).toBe('Android Compose');
  });

  it('validation-expectations doc includes Gradle build/test guidance, not npm', () => {
    const { result } = buildAndroidComposeDocsResult('An Android app.');
    const doc = result.targets.find((t) => t.docName === 'validation-expectations')!;
    const text = doc.sections.map((s) => s.content).join(' ');
    expect(text).toMatch(/Gradle/);
    expect(text).not.toMatch(/npm/i);
  });

  it('scaffold-planning-notes doc includes Android/Gradle template targets', () => {
    const { result } = buildAndroidComposeDocsResult('An Android app.');
    const doc = result.targets.find((t) => t.docName === 'scaffold-planning-notes')!;
    const text = doc.sections.map((s) => s.content).join(' ');
    expect(text).toMatch(/AndroidManifest\.xml/);
  });

  it('development-workflow doc includes Android-appropriate scaffold planning hints', () => {
    const { result } = buildAndroidComposeDocsResult('An Android app.');
    const doc = result.targets.find((t) => t.docName === 'development-workflow')!;
    const text = doc.sections.map((s) => s.content).join(' ');
    expect(text).toMatch(/Gradle wrapper/i);
  });

  it('does not claim Gradle was run, Android SDK/emulator exists, or the app builds successfully', () => {
    const { result } = buildAndroidComposeDocsResult('An Android app.');
    const allText = result.targets.flatMap((t) => t.sections.map((s) => s.content)).join(' ').toLowerCase();
    expect(allText).not.toMatch(/gradle (ran|succeeded|passed)/);
    expect(allText).not.toMatch(/android sdk (is installed|exists|available)/);
    expect(allText).not.toMatch(/emulator (is running|exists|available)/);
    expect(allText).not.toMatch(/build succeeded/);
  });

  it('does not claim Play Store readiness, release readiness, security validation, or publication', () => {
    const { result } = buildAndroidComposeDocsResult('An Android app.');
    const allText = result.targets.flatMap((t) => t.sections.map((s) => s.content)).join(' ').toLowerCase();
    expect(allText).not.toMatch(/play store|release[- ]ready|security[- ]validated|published?/);
  });

  it('does not claim Flutter, React Native, or iOS support', () => {
    const { result } = buildAndroidComposeDocsResult('An Android app.');
    const allText = result.targets.flatMap((t) => t.sections.map((s) => s.content)).join(' ').toLowerCase();
    expect(allText).not.toMatch(/flutter|react native|\bios\b/);
  });

  it('component docs remain empty for android-compose (unchanged v1.1.0 reasoning: brief schema has no module/component hints)', () => {
    const { result } = buildAndroidComposeDocsResult('An Android app.');
    expect(result.componentTargets).toEqual([]);
  });

  it('validateBootstrapDocs(result, "android-compose") reports valid for untampered docs', () => {
    const { result } = buildAndroidComposeDocsResult('An Android app.');
    const validation = validateBootstrapDocs(result, 'android-compose');
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it('is deterministic', () => {
    const { bundle } = buildAndroidComposeDocsResult('An Android app for tracking habits.');
    expect(bootstrapProjectDocs(bundle)).toEqual(bootstrapProjectDocs(bundle));
  });
});
