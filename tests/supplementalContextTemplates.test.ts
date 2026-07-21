import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  renderSupplementalContextTemplate,
  writeSupplementalContextTemplates,
} from '../src/instructions/supplementalContextTemplates';
import { parseSupplementalContextPacket, parseSupplementalContextRetrievalReport } from '../src/instructions/supplementalContextParser';

function makeRunFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-batch4-'));
  fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
  return dir;
}

describe('renderSupplementalContextTemplate', () => {
  it('is deterministic for identical mode/kind inputs', () => {
    const a = renderSupplementalContextTemplate('implementation-context-packet', 'feature');
    const b = renderSupplementalContextTemplate('implementation-context-packet', 'feature');
    expect(a).toBe(b);
  });

  it('contains no timestamp-like content', () => {
    const text = renderSupplementalContextTemplate('test-context-retrieval-report', 'harden');
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(text.toLowerCase()).not.toContain('generatedat');
  });

  it('ends with exactly one final newline', () => {
    const text = renderSupplementalContextTemplate('implementation-context-packet', 'feature');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });

  it('declares single-repository scope for non-extraction modes and source-target for extraction', () => {
    expect(renderSupplementalContextTemplate('implementation-context-packet', 'feature')).toContain(
      'Repository scope: single-repository',
    );
    expect(renderSupplementalContextTemplate('implementation-context-packet', 'extraction')).toContain(
      'Repository scope: source-target',
    );
  });

  it('adds extraction-specific fields only for extraction mode', () => {
    const extraction = renderSupplementalContextTemplate('implementation-context-packet', 'extraction');
    expect(extraction).toContain('Source repository: unknown');
    expect(extraction).toContain('Target repository: unknown');
    const feature = renderSupplementalContextTemplate('implementation-context-packet', 'feature');
    expect(feature).not.toContain('Source repository:');
  });

  it('parses back as a valid template for every document kind', () => {
    const cases: Array<['implementation-context-packet' | 'test-context-packet', 'implementation' | 'test-implementation']> = [
      ['implementation-context-packet', 'implementation'],
      ['test-context-packet', 'test-implementation'],
    ];
    for (const [kind, role] of cases) {
      const text = renderSupplementalContextTemplate(kind, 'feature');
      const result = parseSupplementalContextPacket(text, kind, role);
      expect(result.status).toBe('template');
      expect(result.issues).toEqual([]);
    }
  });

  it('report templates parse back as valid templates', () => {
    const text = renderSupplementalContextTemplate('implementation-context-retrieval-report', 'feature');
    const result = parseSupplementalContextRetrievalReport(text, 'implementation-context-retrieval-report', 'implementation');
    expect(result.status).toBe('template');
    expect(result.issues).toEqual([]);
  });

  it('never uses TODO/TBD-style placeholders', () => {
    const text = renderSupplementalContextTemplate('test-context-packet', 'repair');
    expect(text).not.toMatch(/TODO|TBD|same as above|fill later/i);
  });
});

describe('writeSupplementalContextTemplates', () => {
  it('writes all four files for feature mode', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('feature', runFolder);
    expect(fs.existsSync(path.join(runFolder, 'artifacts', 'implementation-context-packet.txt'))).toBe(true);
    expect(fs.existsSync(path.join(runFolder, 'reports', 'implementation-context-retrieval-report.txt'))).toBe(true);
    expect(fs.existsSync(path.join(runFolder, 'artifacts', 'test-context-packet.txt'))).toBe(true);
    expect(fs.existsSync(path.join(runFolder, 'reports', 'test-context-retrieval-report.txt'))).toBe(true);
  });

  it('writes only the test-context files for test mode', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('test', runFolder);
    expect(fs.existsSync(path.join(runFolder, 'artifacts', 'implementation-context-packet.txt'))).toBe(false);
    expect(fs.existsSync(path.join(runFolder, 'reports', 'implementation-context-retrieval-report.txt'))).toBe(false);
    expect(fs.existsSync(path.join(runFolder, 'artifacts', 'test-context-packet.txt'))).toBe(true);
    expect(fs.existsSync(path.join(runFolder, 'reports', 'test-context-retrieval-report.txt'))).toBe(true);
  });

  it('writes no context files for greenfield mode', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('greenfield', runFolder);
    expect(fs.existsSync(path.join(runFolder, 'artifacts', 'implementation-context-packet.txt'))).toBe(false);
    expect(fs.existsSync(path.join(runFolder, 'artifacts', 'test-context-packet.txt'))).toBe(false);
    expect(fs.existsSync(path.join(runFolder, 'reports', 'implementation-context-retrieval-report.txt'))).toBe(false);
    expect(fs.existsSync(path.join(runFolder, 'reports', 'test-context-retrieval-report.txt'))).toBe(false);
  });

  it('does not overwrite an existing (e.g. manually populated) file', () => {
    const runFolder = makeRunFolder();
    const packetPath = path.join(runFolder, 'artifacts', 'implementation-context-packet.txt');
    fs.writeFileSync(packetPath, 'CUSTOM POPULATED CONTENT', 'utf8');
    writeSupplementalContextTemplates('feature', runFolder);
    expect(fs.readFileSync(packetPath, 'utf8')).toBe('CUSTOM POPULATED CONTENT');
  });

  it('is idempotent across repeated invocations', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('feature', runFolder);
    const before = fs.readFileSync(path.join(runFolder, 'artifacts', 'implementation-context-packet.txt'), 'utf8');
    writeSupplementalContextTemplates('feature', runFolder);
    const after = fs.readFileSync(path.join(runFolder, 'artifacts', 'implementation-context-packet.txt'), 'utf8');
    expect(after).toBe(before);
  });
});
