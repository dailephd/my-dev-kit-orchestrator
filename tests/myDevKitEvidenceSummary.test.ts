import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  readRawContextCapsule,
  readRawRetrievalAudit,
  findCapsuleAuditInconsistencies,
  resolveRawEvidencePath,
  RAW_CONTEXT_CAPSULE_SUPPORTED_MAJOR,
} from '../src/instructions/myDevKitEvidenceSummary';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'context-contracts', 'my-dev-kit-1.10.2');

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-raw-evidence-'));
}

function minimalCapsule(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: '1.0.0',
    tool: { name: 'my-dev-kit', version: '1.10.2' },
    index: { indexPath: '/idx', manifestPath: '/idx/manifest.json' },
    request: { role: 'implementation' },
    roleContext: { role: 'implementation' },
    roleAdequacy: { status: 'context sufficient for implementation' },
    freshness: {
      role: 'implementation',
      state: 'fresh',
      comparedIdentities: [{ label: 'afterIndexPath', value: '/idx' }],
    },
    responsibilityMappings: { mappings: [], truncated: false },
    truncation: { truncated: false, records: [] },
    fullFileFallback: { used: 0 },
    provenance: [{ id: 'p1' }],
    warnings: [],
    ...overrides,
  });
}

describe('readRawContextCapsule / readRawRetrievalAudit', () => {
  it('parses a valid real implementation retrieval-audit fixture', () => {
    const result = readRawRetrievalAudit(path.join(FIXTURE_DIR, 'implementation.retrieval-audit-record.json'), FIXTURE_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.projection.schemaMajor).toBe(RAW_CONTEXT_CAPSULE_SUPPORTED_MAJOR);
      expect(result.projection.requestRole).toBe('implementation');
      expect(result.projection.roleContextRole).toBe('implementation');
      expect(result.projection.freshnessState).toBe('unknown');
      expect(result.projection.roleAdequacyStatus).toBe('context insufficient and more retrieval required');
      expect(result.projection.truncated).toBe(true);
      expect(result.projection.truncationRequiredEvidenceLost).toBe(true);
      expect(result.projection.toolName).toBe('my-dev-kit');
      expect(result.projection.toolVersion).toBe('1.10.2');
    }
  });

  it('parses a valid real test-implementation retrieval-audit fixture with responsibility mappings', () => {
    const result = readRawRetrievalAudit(
      path.join(FIXTURE_DIR, 'test-implementation.retrieval-audit-record.json'),
      FIXTURE_DIR,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.projection.responsibilityMappings.length).toBe(4);
      expect(result.projection.responsibilityMappings.map((m) => m.responsibilityId).sort()).toEqual([
        'TST-V121-001',
        'TST-V121-002',
        'TST-V121-003',
        'TST-V121-004',
      ]);
      expect(result.projection.responsibilityMappings.every((m) => m.mappingStatus === 'partially-mapped')).toBe(true);
    }
  });

  it('accepts a minimal valid synthetic capsule', () => {
    const tmp = makeTempDir();
    try {
      const p = path.join(tmp, 'capsule.json');
      fs.writeFileSync(p, minimalCapsule(), 'utf8');
      const result = readRawContextCapsule(p, tmp);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.projection.freshnessState).toBe('fresh');
        expect(result.projection.freshnessAfterIndexDeclared).toBe(true);
        expect(result.projection.freshnessAfterIndexPath).toBe('/idx');
        expect(result.projection.provenanceCount).toBe(1);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports reference-missing for a nonexistent file', () => {
    const tmp = makeTempDir();
    try {
      const result = readRawContextCapsule(path.join(tmp, 'nope.json'), tmp);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe('reference-missing');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports malformed for invalid JSON', () => {
    const tmp = makeTempDir();
    try {
      const p = path.join(tmp, 'bad.json');
      fs.writeFileSync(p, '{not json', 'utf8');
      const result = readRawContextCapsule(p, tmp);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe('malformed');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports malformed for non-object JSON', () => {
    const tmp = makeTempDir();
    try {
      const p = path.join(tmp, 'array.json');
      fs.writeFileSync(p, '[1,2,3]', 'utf8');
      const result = readRawContextCapsule(p, tmp);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe('malformed');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports malformed for a missing schemaVersion', () => {
    const tmp = makeTempDir();
    try {
      const p = path.join(tmp, 'noversion.json');
      fs.writeFileSync(p, JSON.stringify({ tool: { name: 'my-dev-kit' } }), 'utf8');
      const result = readRawContextCapsule(p, tmp);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe('malformed');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports unsupported-schema for an unsupported major', () => {
    const tmp = makeTempDir();
    try {
      const p = path.join(tmp, 'v2.json');
      fs.writeFileSync(p, minimalCapsule({ schemaVersion: '2.0.0' }), 'utf8');
      const result = readRawContextCapsule(p, tmp);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe('unsupported-schema');
        expect(result.declaredSchemaVersion).toBe('2.0.0');
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects URL paths and traversal paths deterministically', () => {
    const tmp = makeTempDir();
    expect(resolveRawEvidencePath('https://example.com/x.json', tmp).safe).toBe(false);
    expect(resolveRawEvidencePath('../../etc/passwd', tmp).safe).toBe(false);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('rejects NUL-byte paths', () => {
    const tmp = makeTempDir();
    try {
      expect(resolveRawEvidencePath('bad\0path.json', tmp).safe).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('findCapsuleAuditInconsistencies', () => {
  it('reports no mismatches for identical projections', () => {
    const tmp = makeTempDir();
    try {
      const p = path.join(tmp, 'c.json');
      fs.writeFileSync(p, minimalCapsule(), 'utf8');
      const a = readRawContextCapsule(p, tmp);
      const b = readRawContextCapsule(p, tmp);
      expect(a.ok && b.ok).toBe(true);
      if (a.ok && b.ok) {
        expect(findCapsuleAuditInconsistencies(a.projection, b.projection)).toEqual([]);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('detects a role mismatch', () => {
    const tmp = makeTempDir();
    try {
      const cPath = path.join(tmp, 'c.json');
      const aPath = path.join(tmp, 'a.json');
      fs.writeFileSync(cPath, minimalCapsule(), 'utf8');
      fs.writeFileSync(aPath, minimalCapsule({ request: { role: 'test-implementation' }, roleContext: { role: 'test-implementation' } }), 'utf8');
      const c = readRawContextCapsule(cPath, tmp);
      const a = readRawContextCapsule(aPath, tmp);
      expect(c.ok && a.ok).toBe(true);
      if (c.ok && a.ok) {
        expect(findCapsuleAuditInconsistencies(c.projection, a.projection)).toContain('role');
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('detects an index-identity mismatch', () => {
    const tmp = makeTempDir();
    try {
      const cPath = path.join(tmp, 'c.json');
      const aPath = path.join(tmp, 'a.json');
      fs.writeFileSync(cPath, minimalCapsule(), 'utf8');
      fs.writeFileSync(aPath, minimalCapsule({ index: { indexPath: '/other', manifestPath: '/other/manifest.json' } }), 'utf8');
      const c = readRawContextCapsule(cPath, tmp);
      const a = readRawContextCapsule(aPath, tmp);
      expect(c.ok && a.ok).toBe(true);
      if (c.ok && a.ok) {
        expect(findCapsuleAuditInconsistencies(c.projection, a.projection)).toContain('indexIdentity');
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
