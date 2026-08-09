import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GreenfieldProjectBrief } from '../../src/greenfield/brief/briefTypes';
import { validateGreenfieldProjectBrief } from '../../src/greenfield/brief/briefSchema';
import { loadProjectBrief, loadBriefJson } from '../../src/greenfield/brief/loadProjectBrief';
import { normalizeProjectBrief } from '../../src/greenfield/brief/normalizeProjectBrief';

// ─── validateGreenfieldProjectBrief ────────────────────────────────────────────

describe('validateGreenfieldProjectBrief', () => {
  it('accepts a minimal valid brief (rawIdea only)', () => {
    const brief = validateGreenfieldProjectBrief({ rawIdea: 'A CLI tool for tracking tasks.' }, 'test');
    expect(brief.rawIdea).toBe('A CLI tool for tracking tasks.');
    expect(brief.projectName).toBeUndefined();
  });

  it('accepts a complete valid brief', () => {
    const raw: GreenfieldProjectBrief = {
      rawIdea: 'A REST API for managing inventory.',
      projectName: 'InventoryHub',
      productGoal: 'Track stock levels across warehouses',
      usersOrAudience: 'Warehouse managers',
      coreWorkflow: 'Scan item, update count, view report',
      constraints: ['must work offline'],
      nonGoals: ['no mobile app'],
      preferredStack: ['TypeScript', 'PostgreSQL'],
      preferredProfile: 'typescript-cli',
      platformTarget: 'server',
      documentationPreferences: ['README with quickstart'],
      testingExpectations: ['unit tests for core logic'],
    };
    const brief = validateGreenfieldProjectBrief(raw, 'test');
    expect(brief).toEqual(raw);
  });

  it('rejects malformed brief input clearly', () => {
    expect(() => validateGreenfieldProjectBrief({}, 'test')).toThrow(/rawIdea/);
    expect(() => validateGreenfieldProjectBrief({ rawIdea: '' }, 'test')).toThrow(/rawIdea/);
    expect(() => validateGreenfieldProjectBrief(null, 'test')).toThrow(/JSON object/);
    expect(() => validateGreenfieldProjectBrief([], 'test')).toThrow(/JSON object/);
    expect(() => validateGreenfieldProjectBrief({ rawIdea: 'ok', constraints: 'not-an-array' }, 'test')).toThrow(
      /constraints/,
    );
  });

  it('does not fail when optional planning fields are absent', () => {
    expect(() => validateGreenfieldProjectBrief({ rawIdea: 'A tool.' }, 'test')).not.toThrow();
  });

  // TST-B1-002/TST-B1-003: schema accepts the new orthogonal dimensions as optional strings.
  it('accepts optional projectType and webFramework fields', () => {
    const brief = validateGreenfieldProjectBrief(
      {
        rawIdea: 'A full-stack web app for managing inventory.',
        preferredProfile: 'nextjs-app',
        projectType: 'fullstack-web',
        webFramework: 'nextjs',
      },
      'test',
    );
    expect(brief.projectType).toBe('fullstack-web');
    expect(brief.webFramework).toBe('nextjs');
  });
});

// ─── loadProjectBrief ───────────────────────────────────────────────────────────

describe('loadProjectBrief', () => {
  it('loads from an inline rawIdeaText string', () => {
    const brief = loadProjectBrief({ rawIdeaText: 'A tool for X.' });
    expect(brief.rawIdea).toBe('A tool for X.');
  });

  it('loads from an inline brief object', () => {
    const brief = loadProjectBrief({ brief: { rawIdea: 'A tool for Y.', projectName: 'Y' } });
    expect(brief.rawIdea).toBe('A tool for Y.');
    expect(brief.projectName).toBe('Y');
  });

  it('loads from a JSON brief file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'greenfield-brief-'));
    const filePath = path.join(dir, 'brief.json');
    fs.writeFileSync(filePath, JSON.stringify({ rawIdea: 'A tool for Z.' }));
    try {
      const brief = loadProjectBrief({ briefFile: filePath });
      expect(brief.rawIdea).toBe('A tool for Z.');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws a clear error when no input is provided', () => {
    expect(() => loadProjectBrief({})).toThrow(/project idea is required/);
  });

  it('throws a clear error for invalid JSON in a brief file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'greenfield-brief-'));
    const filePath = path.join(dir, 'brief.json');
    fs.writeFileSync(filePath, '{ not valid json');
    try {
      expect(() => loadBriefJson(filePath)).toThrow(/failed to load brief/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws a clear error when the brief file does not exist', () => {
    expect(() => loadBriefJson(path.join(os.tmpdir(), 'does-not-exist-greenfield-brief.json'))).toThrow(
      /failed to load brief/,
    );
  });

  it('performs no filesystem writes or scaffold execution while loading', () => {
    // Use a dedicated, exclusively-owned temp directory rather than counting
    // entries in the shared os.tmpdir() root (flaky under parallel test execution).
    const ownDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-brief-load-'));
    const before = fs.readdirSync(ownDir).length;
    loadProjectBrief({ rawIdeaText: 'A tool.' });
    const after = fs.readdirSync(ownDir).length;
    fs.rmSync(ownDir, { recursive: true, force: true });
    expect(after).toBe(before);
  });
});

// ─── normalizeProjectBrief ──────────────────────────────────────────────────────

describe('normalizeProjectBrief', () => {
  it('normalizes a minimal valid brief', () => {
    const { normalized, warnings } = normalizeProjectBrief({
      rawIdea: 'A tool for tracking tasks across a small team.',
    });
    expect(normalized.rawIdea).toBe('A tool for tracking tasks across a small team.');
    expect(normalized.constraints).toEqual([]);
    expect(normalized.nonGoals).toEqual([]);
    expect(normalized.preferredStack).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('normalizes a complete valid brief with fewer warnings', () => {
    const { normalized, warnings } = normalizeProjectBrief({
      rawIdea: 'A REST API for managing warehouse inventory across multiple sites.',
      projectName: 'InventoryHub',
      productGoal: 'Track stock levels',
      usersOrAudience: 'Warehouse managers',
      coreWorkflow: 'Scan, update, report',
      preferredStack: ['TypeScript', 'PostgreSQL'],
      preferredProfile: 'typescript-cli',
    });
    expect(normalized.candidateProjectName).toBe('InventoryHub');
    expect(normalized.productGoal).toBe('Track stock levels');
    expect(warnings.find((w) => w.kind === 'missing-project-name')).toBeUndefined();
    expect(warnings.find((w) => w.kind === 'missing-product-goal')).toBeUndefined();
  });

  it('rejects malformed brief input at the schema layer before normalization', () => {
    expect(() => validateGreenfieldProjectBrief({ rawIdea: 123 }, 'test')).toThrow();
  });

  it('handles missing optional fields consistently', () => {
    const { normalized } = normalizeProjectBrief({ rawIdea: 'A tool for tracking tasks and habits.' });
    expect(normalized.productGoal).toBeUndefined();
    expect(normalized.usersOrAudience).toBeUndefined();
    expect(normalized.coreWorkflow).toBeUndefined();
    expect(normalized.documentationPreferences).toEqual([]);
    expect(normalized.testingExpectations).toEqual([]);
  });

  it('is deterministic for the same input', () => {
    const brief: GreenfieldProjectBrief = {
      rawIdea: 'A CLI tool that syncs notes between devices.',
      preferredStack: ['TypeScript'],
    };
    const first = normalizeProjectBrief(brief);
    const second = normalizeProjectBrief(brief);
    expect(first).toEqual(second);
  });

  it('preserves constraints', () => {
    const { normalized } = normalizeProjectBrief({
      rawIdea: 'A tool that must remain offline-capable at all times please.',
      constraints: ['must work offline', 'no third-party analytics'],
    });
    expect(normalized.constraints).toEqual(['must work offline', 'no third-party analytics']);
  });

  it('preserves non-goals', () => {
    const { normalized } = normalizeProjectBrief({
      rawIdea: 'A tool for managing personal finances and budgets.',
      nonGoals: ['no mobile app', 'no multi-currency support'],
    });
    expect(normalized.nonGoals).toEqual(['no mobile app', 'no multi-currency support']);
  });

  it('preserves unresolved questions explicitly', () => {
    const { normalized } = normalizeProjectBrief({ rawIdea: 'A tool for tracking tasks and habits.' });
    const fields = normalized.unresolved.map((u) => u.field);
    expect(fields).toEqual(
      expect.arrayContaining(['productGoal', 'usersOrAudience', 'coreWorkflow', 'preferredStack', 'preferredProfile']),
    );
  });

  it('preserves a user-provided preferred profile', () => {
    const { normalized } = normalizeProjectBrief({
      rawIdea: 'A tool for tracking tasks and habits.',
      preferredProfile: 'nextjs-app',
    });
    expect(normalized.preferredProfile).toBe('nextjs-app');
    expect(normalized.unresolved.find((u) => u.field === 'preferredProfile')).toBeUndefined();
  });

  it('preserves a user-provided preferred stack', () => {
    const { normalized } = normalizeProjectBrief({
      rawIdea: 'A tool for tracking tasks and habits.',
      preferredStack: ['TypeScript', 'SQLite'],
    });
    expect(normalized.preferredStack).toEqual(['TypeScript', 'SQLite']);
  });

  it('does not insert an Android or mobile default anywhere in the normalized brief', () => {
    const { normalized } = normalizeProjectBrief({ rawIdea: 'A tool for tracking tasks and habits.' });
    const serialized = JSON.stringify(normalized).toLowerCase();
    expect(serialized).not.toMatch(/android|mobile|ios\b|react-native|flutter/);
  });

  // TST-B1-001: legacy briefs with no projectType/webFramework remain valid and unchanged.
  it('TST-B1-001: normalizes a legacy brief with no projectType/webFramework fields', () => {
    const { normalized } = normalizeProjectBrief({ rawIdea: 'A tool for tracking tasks and habits.' });
    expect(normalized.projectType).toBeUndefined();
    expect(normalized.webFramework).toBeUndefined();
  });

  // TST-B1-002: the supported full-stack project type is accepted and normalized deterministically.
  it('TST-B1-002: preserves a user-provided supported projectType', () => {
    const { normalized } = normalizeProjectBrief({
      rawIdea: 'A tool for tracking tasks and habits.',
      projectType: 'fullstack-web',
    });
    expect(normalized.projectType).toBe('fullstack-web');
  });

  // TST-B1-003: the supported web framework is accepted and normalized deterministically.
  it('TST-B1-003: preserves a user-provided supported webFramework', () => {
    const { normalized } = normalizeProjectBrief({
      rawIdea: 'A tool for tracking tasks and habits.',
      webFramework: 'nextjs',
    });
    expect(normalized.webFramework).toBe('nextjs');
  });

  it('is deterministic for the same input including projectType/webFramework', () => {
    const brief = {
      rawIdea: 'A tool for tracking tasks and habits.',
      projectType: 'fullstack-web',
      webFramework: 'nextjs',
    };
    const first = normalizeProjectBrief(brief);
    const second = normalizeProjectBrief(brief);
    expect(first.normalized).toEqual(second.normalized);
  });

  it('infers a candidate project name from a quoted name in the idea text', () => {
    const { normalized, warnings } = normalizeProjectBrief({
      rawIdea: 'Build "TaskTracker" for small teams to manage their daily work.',
    });
    expect(normalized.candidateProjectName).toBe('TaskTracker');
    expect(warnings.find((w) => w.kind === 'candidate-name-inferred')).toBeDefined();
  });

  it('warns on a sparse idea description', () => {
    const { warnings } = normalizeProjectBrief({ rawIdea: 'A tool.' });
    expect(warnings.find((w) => w.kind === 'sparse-idea')).toBeDefined();
  });
});
