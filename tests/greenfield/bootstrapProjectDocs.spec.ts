import * as fs from 'fs';
import * as path from 'path';
import { normalizeProjectBrief } from '../../src/greenfield/brief/normalizeProjectBrief';
import { resolveGreenfieldProfile } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { buildGreenfieldBootstrapBundle } from '../../src/greenfield/bootstrap/buildBootstrapBundle';
import { bootstrapProjectDocs } from '../../src/greenfield/bootstrap/bootstrapProjectDocs';
import { validateBootstrapDocs, validateGreenfieldProfileDocumentation } from '../../src/greenfield/bootstrap/validateBootstrapDocs';
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

// ─── v1.3.1 Batch 2: standardized common canonical project-document contract ────

const REQUIRED_CANONICAL_DOCUMENT_PATHS = [
  'README.md',
  'CHANGELOG.md',
  'docs/PROJECT_OVERVIEW.md',
  'docs/CURRENT_STATE.md',
  'docs/ARCHITECTURE.md',
  'docs/CONTRACTS.md',
  'docs/COMMANDS.md',
  'docs/WORKFLOWS.md',
  'docs/QUICKSTART.md',
  'docs/DEVELOPMENT.md',
  'docs/CI_CD.md',
  'docs/ROADMAP.md',
  'docs/RELEASE.md',
  'docs/SECURITY.md',
  'docs/DOCUMENTATION_PRESERVATION_POLICY.md',
];

describe('bootstrapProjectDocs - standardized common canonical documents (v1.3.1 Batch 2)', () => {
  // TST-B2-001: exact common canonical inventory, deterministic order, no duplicates.
  it('TST-B2-001: exposes exactly the required common canonical document paths in deterministic order', () => {
    const bundle = buildBundleFor('A tool for tracking tasks across a small team.', {
      preferredProfile: 'typescript-cli',
    });
    const result = bootstrapProjectDocs(bundle);
    const paths = result.canonicalDocuments!.map((d) => d.path);
    expect(paths).toEqual(REQUIRED_CANONICAL_DOCUMENT_PATHS);
    expect(new Set(paths).size).toBe(paths.length);
  });

  // TST-B2-002: TypeScript CLI receives the complete common canonical baseline.
  it('TST-B2-002: typescript-cli bootstrap receives the complete common canonical baseline', () => {
    const bundle = buildBundleFor('A CLI tool for dotfiles.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    expect(result.canonicalDocuments!.map((d) => d.path)).toEqual(REQUIRED_CANONICAL_DOCUMENT_PATHS);
    // existing profile-specific behavior remains intact (legacy targets unaffected)
    expect(result.targets.map((t) => t.docName).sort()).toEqual([...REQUIRED_DOC_NAMES].sort());
  });

  // TST-B2-003: Next.js receives the complete baseline, with or without Batch 1 dimensions.
  it('TST-B2-003: nextjs-app bootstrap receives the complete common canonical baseline (dimensions absent)', () => {
    const bundle = buildBundleFor('A web dashboard for analytics.', { preferredProfile: 'nextjs-app' });
    const result = bootstrapProjectDocs(bundle);
    expect(result.canonicalDocuments!.map((d) => d.path)).toEqual(REQUIRED_CANONICAL_DOCUMENT_PATHS);
  });

  // TST-B2-004: Android Compose receives the same baseline plus its existing terminology rules.
  it('TST-B2-004: android-compose bootstrap receives the same common canonical baseline', () => {
    const bundle = buildBundleFor('An Android app for tracking tasks.', { preferredProfile: 'android-compose' });
    const result = bootstrapProjectDocs(bundle);
    expect(result.canonicalDocuments!.map((d) => d.path)).toEqual(REQUIRED_CANONICAL_DOCUMENT_PATHS);
    const validation = validateBootstrapDocs(result, 'android-compose');
    expect(validation.valid).toBe(true);
  });

  // TST-B2-005: Batch 1 dimension propagation into the standardized baseline.
  it('TST-B2-005: propagates fullstack-web + nextjs + nextjs-app into the standardized baseline', () => {
    const bundle = buildBundleFor('A full-stack web app for tracking inventory.', {
      preferredProfile: 'nextjs-app',
      projectType: 'fullstack-web',
      webFramework: 'nextjs',
    });
    const result = bootstrapProjectDocs(bundle);
    expect(result.canonicalDocuments!.map((d) => d.path)).toEqual(REQUIRED_CANONICAL_DOCUMENT_PATHS);
    const overview = result.canonicalDocuments!.find((d) => d.path === 'docs/PROJECT_OVERVIEW.md')!;
    expect(overview.sections.find((s) => s.heading === 'Project type')?.content).toBe('fullstack-web');
    expect(overview.sections.find((s) => s.heading === 'Web framework')?.content).toBe('nextjs');
    // v1.3.1 Batch 4: composes full-stack content from the resolved Batch 3
    // capability into the canonical documents (see TST-B4-001 in
    // fullstackCapability.spec.ts for the dedicated composition coverage);
    // this superseded Batch 2's original "no Batch 3 infrastructure content"
    // assertion, which predated Batch 4's document-composition scope.
    const flattened = JSON.stringify(result.canonicalDocuments).toLowerCase();
    expect(flattened).toMatch(/postgresql/);
    expect(flattened).toMatch(/prisma/);
    expect(flattened).toMatch(/docker/);
  });

  // TST-B2-006: legacy brief (no projectType/webFramework) still produces a valid standardized bootstrap.
  it('TST-B2-006: legacy brief without projectType/webFramework still produces a valid standardized bootstrap', () => {
    const bundle = buildBundleFor('A web dashboard for analytics.', { preferredProfile: 'nextjs-app' });
    const result = bootstrapProjectDocs(bundle);
    const overview = result.canonicalDocuments!.find((d) => d.path === 'docs/PROJECT_OVERVIEW.md')!;
    expect(overview.sections.find((s) => s.heading === 'Project type')?.content).toBe('(not specified)');
    expect(overview.sections.find((s) => s.heading === 'Web framework')?.content).toBe('(not specified)');
    expect(validateBootstrapDocs(result, 'nextjs-app').valid).toBe(true);
  });

  // TST-B2-007: meaningful population -- content derives from the brief/profile, not blank shells.
  it('TST-B2-007: common documents receive project-specific content rather than blank shells', () => {
    const bundle = buildBundleFor('A tool for tracking tasks and habits for small teams.', {
      projectName: 'TaskTracker',
      productGoal: 'Help small teams track tasks',
      preferredProfile: 'typescript-cli',
    });
    const result = bootstrapProjectDocs(bundle);
    const readme = result.canonicalDocuments!.find((d) => d.path === 'README.md')!;
    expect(readme.sections.find((s) => s.heading === 'Project')?.content).toBe('TaskTracker');
    const commands = result.canonicalDocuments!.find((d) => d.path === 'docs/COMMANDS.md')!;
    expect(commands.sections.find((s) => s.heading === 'Setup commands')?.content).toContain('npm install');
    const development = result.canonicalDocuments!.find((d) => d.path === 'docs/DEVELOPMENT.md')!;
    expect(development.sections.find((s) => s.heading === 'Category')?.content).toBe('cli');
  });

  // TST-B2-008: no fabricated current behavior for infrastructure the project does not yet have.
  it('TST-B2-008: does not fabricate CI/CD, release, or security guarantees for a new project', () => {
    const bundle = buildBundleFor('A CLI tool for dotfiles.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const ciCd = result.canonicalDocuments!.find((d) => d.path === 'docs/CI_CD.md')!;
    expect(ciCd.status).toBe('partial');
    expect(JSON.stringify(ciCd.sections)).toMatch(/no continuous-integration pipeline exists yet/i);
    const release = result.canonicalDocuments!.find((d) => d.path === 'docs/RELEASE.md')!;
    expect(JSON.stringify(release.sections)).toMatch(/no versioning or publication procedure has been established yet/i);
    const security = result.canonicalDocuments!.find((d) => d.path === 'docs/SECURITY.md')!;
    expect(JSON.stringify(security.sections)).toMatch(/no security review process has been established yet/i);
  });

  // TST-B2-009: profile overlay is additive; every profile gets the identical canonical path set.
  it('TST-B2-009: profile-specific requirements cannot remove or replace required common documents', () => {
    const cliResult = bootstrapProjectDocs(buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' }));
    const webResult = bootstrapProjectDocs(buildBundleFor('A web app.', { preferredProfile: 'nextjs-app' }));
    const androidResult = bootstrapProjectDocs(
      buildBundleFor('An Android app.', { preferredProfile: 'android-compose' }),
    );
    expect(cliResult.canonicalDocuments!.map((d) => d.path)).toEqual(REQUIRED_CANONICAL_DOCUMENT_PATHS);
    expect(webResult.canonicalDocuments!.map((d) => d.path)).toEqual(REQUIRED_CANONICAL_DOCUMENT_PATHS);
    expect(androidResult.canonicalDocuments!.map((d) => d.path)).toEqual(REQUIRED_CANONICAL_DOCUMENT_PATHS);
  });

  // TST-B2-010: specialized/component docs remain additive, not part of the required 15-file baseline.
  it('TST-B2-010: component/specialized documentation support remains available and separate', () => {
    const bundle = buildBundleFor('A tool for tracking tasks.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    // componentTargets is a distinct, independent field from canonicalDocuments --
    // specialized docs are additive, not folded into the required 15-file baseline.
    expect(result.componentTargets).toEqual([]);
    expect(result.canonicalDocuments!).toHaveLength(15);
    expect(result).toHaveProperty('componentTargets');
    expect(result).toHaveProperty('canonicalDocuments');
  });

  // TST-B2-011: no parallel full-stack documentation taxonomy is introduced by default.
  it('TST-B2-011: does not introduce DATABASE/ENVIRONMENT/TESTING/DEPLOYMENT documents', () => {
    const bundle = buildBundleFor('A full-stack web app.', {
      preferredProfile: 'nextjs-app',
      projectType: 'fullstack-web',
      webFramework: 'nextjs',
    });
    const result = bootstrapProjectDocs(bundle);
    const paths = result.canonicalDocuments!.map((d) => d.path);
    expect(paths).not.toContain('docs/DATABASE.md');
    expect(paths).not.toContain('docs/ENVIRONMENT.md');
    expect(paths).not.toContain('docs/TESTING.md');
    expect(paths).not.toContain('docs/DEPLOYMENT.md');
    expect(paths).toHaveLength(15);
  });

  // TST-B2-012: deterministic output for equivalent inputs.
  it('TST-B2-012: produces the same canonical document inventory/order/content for equivalent inputs', () => {
    const bundle1 = buildBundleFor('A CLI tool for dotfiles.', { preferredProfile: 'typescript-cli' });
    const bundle2 = buildBundleFor('A CLI tool for dotfiles.', { preferredProfile: 'typescript-cli' });
    expect(bootstrapProjectDocs(bundle1).canonicalDocuments).toEqual(
      bootstrapProjectDocs(bundle2).canonicalDocuments,
    );
  });

  // v1.3.1 Batch 4 supersedes this test's original assertion: Batch 4's own
  // scope is composing PostgreSQL/Prisma/Docker content into the canonical
  // documents when the capability is resolved (see TST-B4-001/005/006 in
  // fullstackCapability.spec.ts). What remains true, and what this test now
  // checks, is that the content describes a *resolved plan*, never claims
  // runtime verification occurred (no "migrations applied", "Docker is
  // running", etc.) -- honesty, not silence, is the invariant.
  it('describes the resolved full-stack capability without claiming runtime verification', () => {
    const bundle = buildBundleFor('A full-stack web app for inventory tracking.', {
      preferredProfile: 'nextjs-app',
      projectType: 'fullstack-web',
      webFramework: 'nextjs',
    });
    const result = bootstrapProjectDocs(bundle);
    const flattened = JSON.stringify(result.canonicalDocuments).toLowerCase();
    expect(flattened).toMatch(/postgresql|prisma|docker/);
    expect(flattened).not.toMatch(/migrations? (applied|succeeded|completed)|docker is running|database is (connected|ready)/);
    const currentState = result.canonicalDocuments!.find((d) => d.path === 'docs/CURRENT_STATE.md')!;
    expect(JSON.stringify(currentState.sections).toLowerCase()).toMatch(/not.*verified|not been generated, started, or otherwise verified/);
  });

  // TST-B2-018: standardized documents flow through the existing bootstrap-bundle/document-generation
  // structures rather than a second bootstrap bundle or parallel project-doc owner.
  it('TST-B2-018: canonicalDocuments is produced from the existing GreenfieldBootstrapBundle, not a parallel bundle', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    // bootstrapProjectDocs's only input is the existing GreenfieldBootstrapBundle;
    // the result is carried on the existing GreenfieldProjectDocBootstrapResult shape.
    expect(result).toHaveProperty('targets');
    expect(result).toHaveProperty('componentTargets');
    expect(result).toHaveProperty('canonicalDocuments');
    expect(result).toHaveProperty('unresolvedDecisions');
    expect(result.unresolvedDecisions).toBe(bundle.unresolvedDecisions);
  });
});

describe('validateBootstrapDocs - standardized common canonical documents (v1.3.1 Batch 2)', () => {
  // TST-B2-013: validation catches a missing required common document.
  it('TST-B2-013: flags a missing required common canonical document', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const incomplete: GreenfieldProjectDocBootstrapResult = {
      ...result,
      canonicalDocuments: result.canonicalDocuments!.filter((d) => d.path !== 'docs/SECURITY.md'),
    };
    const validation = validateBootstrapDocs(incomplete);
    expect(validation.valid).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({ docName: 'docs/SECURITY.md', kind: 'missing-required-section' }),
    );
  });

  // TST-B2-014: validation catches a duplicate canonical path.
  it('TST-B2-014: flags a duplicate canonical document path', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const readme = result.canonicalDocuments!.find((d) => d.path === 'README.md')!;
    const duplicated: GreenfieldProjectDocBootstrapResult = {
      ...result,
      canonicalDocuments: [...result.canonicalDocuments!, readme],
    };
    const validation = validateBootstrapDocs(duplicated);
    expect(validation.valid).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({ docName: 'README.md', kind: 'duplicate-canonical-path' }),
    );
  });

  // TST-B2-015: existing unsupported-claim rules apply identically to canonical documents.
  it('TST-B2-015: flags an unsupported-platform claim inside a canonical document exactly as for legacy targets', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const tampered: GreenfieldProjectDocBootstrapResult = {
      ...result,
      canonicalDocuments: result.canonicalDocuments!.map((d) =>
        d.path === 'docs/PROJECT_OVERVIEW.md'
          ? { ...d, sections: [{ heading: 'Note', content: 'also supports iOS out of the box' }] }
          : d,
      ),
    };
    const validation = validateBootstrapDocs(tampered, 'typescript-cli');
    expect(validation.valid).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({ docName: 'docs/PROJECT_OVERVIEW.md', kind: 'unsupported-platform-claim' }),
    );
  });

  it('canonicalDocuments absence does not fail validation (compatibility with reconstructed evidence)', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const withoutCanonical: GreenfieldProjectDocBootstrapResult = {
      targets: result.targets,
      componentTargets: result.componentTargets,
      unresolvedDecisions: result.unresolvedDecisions,
    };
    const validation = validateBootstrapDocs(withoutCanonical);
    expect(validation.valid).toBe(true);
  });

  it('bridges duplicate-canonical-path findings into the shared GF_DOC_DUPLICATE_PATH issue code', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const result = bootstrapProjectDocs(bundle);
    const readme = result.canonicalDocuments!.find((d) => d.path === 'README.md')!;
    const duplicated: GreenfieldProjectDocBootstrapResult = {
      ...result,
      canonicalDocuments: [...result.canonicalDocuments!, readme],
    };
    const bridged = validateGreenfieldProfileDocumentation(duplicated);
    expect(bridged.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_DOC_DUPLICATE_PATH', affectedContract: 'README.md' }),
    );
  });
});

// ─── v1.3.1 Batch 4: full-stack canonical document composition ─────────────────

function fullstackDocsBundle(overrides: Record<string, unknown> = {}) {
  return buildBundleFor('A full-stack web app for tracking inventory.', {
    preferredProfile: 'nextjs-app',
    projectType: 'fullstack-web',
    webFramework: 'nextjs',
    ...overrides,
  });
}

describe('populateCanonicalProjectDocumentsFromBrief - full-stack composition (v1.3.1 Batch 4)', () => {
  // TST-B4-001: full-stack bootstrap produces the same required 15 docs plus full-stack content.
  it('TST-B4-001: full-stack bootstrap produces the required 15 canonical documents with full-stack content', () => {
    const result = bootstrapProjectDocs(fullstackDocsBundle());
    const paths = result.canonicalDocuments!.map((d) => d.path);
    expect(paths).toHaveLength(15);
    const flattened = JSON.stringify(result.canonicalDocuments).toLowerCase();
    expect(flattened).toMatch(/postgresql/);
    expect(flattened).toMatch(/prisma/);
    expect(flattened).toMatch(/docker/);
  });

  // TST-B4-002: normal nextjs-app (no capability) gets no infrastructure content.
  it('TST-B4-002: ordinary nextjs-app without full-stack dimensions gains no PostgreSQL/Prisma/Docker content', () => {
    const bundle = buildBundleFor('A web dashboard for analytics.', { preferredProfile: 'nextjs-app' });
    const result = bootstrapProjectDocs(bundle);
    const flattened = JSON.stringify(result.canonicalDocuments).toLowerCase();
    expect(flattened).not.toMatch(/postgresql|prisma|docker/);
  });

  // TST-B4-003: other profiles remain free of full-stack Next.js infrastructure content.
  it('TST-B4-003: typescript-cli and android-compose remain free of full-stack Next.js infrastructure content', () => {
    const cliResult = bootstrapProjectDocs(buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' }));
    const androidResult = bootstrapProjectDocs(
      buildBundleFor('An Android app.', { preferredProfile: 'android-compose' }),
    );
    expect(JSON.stringify(cliResult.canonicalDocuments).toLowerCase()).not.toMatch(/postgresql|prisma/);
    expect(JSON.stringify(androidResult.canonicalDocuments).toLowerCase()).not.toMatch(/postgresql|prisma/);
  });

  // TST-B4-004: no parallel full-stack document taxonomy.
  it('TST-B4-004: a full-stack project does not generate default DATABASE/ENVIRONMENT/TESTING/DEPLOYMENT documents', () => {
    const result = bootstrapProjectDocs(fullstackDocsBundle());
    const paths = result.canonicalDocuments!.map((d) => d.path);
    expect(paths).not.toContain('docs/DATABASE.md');
    expect(paths).not.toContain('docs/ENVIRONMENT.md');
    expect(paths).not.toContain('docs/TESTING.md');
    expect(paths).not.toContain('docs/DEPLOYMENT.md');
  });

  // TST-B4-005: architecture content.
  it('TST-B4-005: full-stack ARCHITECTURE.md reflects topology and the three-way readiness distinction', () => {
    const result = bootstrapProjectDocs(fullstackDocsBundle());
    const architecture = result.canonicalDocuments!.find((d) => d.path === 'docs/ARCHITECTURE.md')!;
    const text = JSON.stringify(architecture.sections).toLowerCase();
    expect(text).toMatch(/postgresql/);
    expect(text).toMatch(/prisma/);
    expect(text).toMatch(/process-liveness/);
    expect(text).toMatch(/postgresql-health/);
    expect(text).toMatch(/application-database-readiness/);
    expect(text).not.toMatch(/verified|passed all tests/);
  });

  // TST-B4-006: contract content.
  it('TST-B4-006: full-stack CONTRACTS.md reflects environment/database/migration/reset/readiness/seed invariants', () => {
    const result = bootstrapProjectDocs(fullstackDocsBundle());
    const contracts = result.canonicalDocuments!.find((d) => d.path === 'docs/CONTRACTS.md')!;
    const text = JSON.stringify(contracts.sections).toLowerCase();
    expect(text).toMatch(/development.*test.*production|production.*test.*development/);
    expect(text).toMatch(/migration/);
    expect(text).toMatch(/reset/);
    expect(text).toMatch(/readiness/);
    expect(text).toMatch(/none:/); // seed policy kind
    expect(text).toMatch(/pre-traffic-singleton-operation/);
  });

  // TST-B4-007: command content grounded in the composed plan.
  it('TST-B4-007: full-stack COMMANDS.md reflects the actual composed command surface', () => {
    const bundle = fullstackDocsBundle();
    const result = bootstrapProjectDocs(bundle);
    const commandsDoc = result.canonicalDocuments!.find((d) => d.path === 'docs/COMMANDS.md')!;
    const text = JSON.stringify(commandsDoc.sections);
    // every profile command must appear
    for (const c of bundle.selectedProfile.profile!.setupCommands) {
      expect(text).toContain(c.command);
    }
    // every capability command must appear
    const capability = bundle.fullstackCapability.capability!;
    for (const c of [...capability.setupCommands, ...capability.validationCommands]) {
      expect(text).toContain(c.command);
    }
  });

  // TST-B4-008: workflow content.
  it('TST-B4-008: full-stack WORKFLOWS.md covers setup/development/migration/testing/reset/production-like responsibilities', () => {
    const result = bootstrapProjectDocs(fullstackDocsBundle());
    const workflows = result.canonicalDocuments!.find((d) => d.path === 'docs/WORKFLOWS.md')!;
    const text = JSON.stringify(workflows.sections).toLowerCase();
    expect(text).toMatch(/database-up/);
    expect(text).toMatch(/migration-deploy-replay/);
    expect(text).toMatch(/database-backed-test-execution/);
    expect(text).toMatch(/reset/);
    expect(text).toMatch(/production-migration-deploy/);
  });

  // TST-B4-009: security content.
  it('TST-B4-009: full-stack SECURITY.md preserves secret handling and non-production reset safety', () => {
    const result = bootstrapProjectDocs(fullstackDocsBundle());
    const security = result.canonicalDocuments!.find((d) => d.path === 'docs/SECURITY.md')!;
    const text = JSON.stringify(security.sections).toLowerCase();
    expect(text).toMatch(/database_url/);
    expect(text).toMatch(/never a valid reset target/);
    expect(text).toMatch(/redacted/);
    // no literal credential value anywhere in generated content (only the variable name, never a real secret)
    const capability = fullstackDocsBundle().fullstackCapability.capability!;
    for (const variable of capability.environmentVariables) {
      if (variable.secret) {
        expect(text).not.toMatch(new RegExp(`${variable.name.toLowerCase()}\\s*[:=]\\s*[a-z0-9]{6,}`));
      }
    }
  });

  // TST-B4-010: CI/CD honesty.
  it('TST-B4-010: full-stack CI_CD.md does not fabricate a deployment provider or existing pipeline', () => {
    const result = bootstrapProjectDocs(fullstackDocsBundle());
    const ciCd = result.canonicalDocuments!.find((d) => d.path === 'docs/CI_CD.md')!;
    const text = JSON.stringify(ciCd.sections).toLowerCase();
    expect(text).toMatch(/no continuous-integration pipeline exists yet/);
    expect(text).not.toMatch(/github actions|gitlab ci|circleci|vercel|aws|azure|gcp|heroku/);
    const validation = validateBootstrapDocs(result, 'nextjs-app');
    expect(validation.issues.filter((i) => i.docName === 'docs/CI_CD.md')).toEqual([]);
  });

  it('all full-stack canonical documents pass validateBootstrapDocs with no unsupported claims', () => {
    const result = bootstrapProjectDocs(fullstackDocsBundle());
    const validation = validateBootstrapDocs(result, 'nextjs-app');
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });
});
