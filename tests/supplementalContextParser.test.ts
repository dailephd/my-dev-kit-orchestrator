import { renderSupplementalContextTemplate } from '../src/instructions/supplementalContextTemplates';
import {
  parseSupplementalContextPacket,
  parseSupplementalContextRetrievalReport,
  REQUIRED_POPULATED_SECTIONS_BY_KIND,
} from '../src/instructions/supplementalContextParser';
import { fillRequiredSections } from './readyContextTestHelpers';
import { placeholderForSection } from '../src/instructions/supplementalContextTemplates';

function populated(kind: 'implementation-context-packet' | 'test-context-packet', mode = 'feature'): string {
  const withStatus = renderSupplementalContextTemplate(kind, mode).replace('Status: template', 'Status: populated');
  return fillRequiredSections(withStatus, kind);
}

describe('supplemental context parser', () => {
  it('classifies a valid starter template as template', () => {
    const text = renderSupplementalContextTemplate('implementation-context-packet', 'feature');
    const result = parseSupplementalContextPacket(text, 'implementation-context-packet', 'implementation');
    expect(result.status).toBe('template');
    expect(result.issues).toEqual([]);
  });

  it('classifies a structurally valid populated document as populated', () => {
    const text = populated('implementation-context-packet');
    const result = parseSupplementalContextPacket(text, 'implementation-context-packet', 'implementation');
    expect(result.status).toBe('populated');
  });

  it('accepts the exact document kind and rejects an incorrect kind', () => {
    const text = renderSupplementalContextTemplate('implementation-context-packet', 'feature');
    const ok = parseSupplementalContextPacket(text, 'implementation-context-packet', 'implementation');
    expect(ok.status).toBe('template');

    // Structurally still an implementation-context-packet (same required
    // metadata/sections); only the declared "Document kind" value is wrong.
    const relabeled = text.replace(
      'Document kind: implementation-context-packet',
      'Document kind: test-context-packet',
    );
    const mismatched = parseSupplementalContextPacket(relabeled, 'implementation-context-packet', 'implementation');
    expect(mismatched.status).toBe('kind-mismatch');
    expect(mismatched.declaredKind).toBe('test-context-packet');
  });

  it('accepts the exact role and rejects an incorrect role', () => {
    const text = renderSupplementalContextTemplate('implementation-context-packet', 'feature');
    const ok = parseSupplementalContextPacket(text, 'implementation-context-packet', 'implementation');
    expect(ok.status).toBe('template');

    const roleMismatch = parseSupplementalContextPacket(text, 'implementation-context-packet', 'test-implementation');
    expect(roleMismatch.status).toBe('role-mismatch');
  });

  it('classifies an unknown schema major as unsupported-schema', () => {
    const text = renderSupplementalContextTemplate('implementation-context-packet', 'feature').replace(
      'Schema version: 1.0.0',
      'Schema version: 2.0.0',
    );
    const result = parseSupplementalContextPacket(text, 'implementation-context-packet', 'implementation');
    expect(result.status).toBe('unsupported-schema');
    expect(result.declaredSchemaVersion).toBe('2.0.0');
    expect(result.supportedSchemaMajor).toBe(1);
  });

  it('classifies an invalid schema version string as malformed', () => {
    const text = renderSupplementalContextTemplate('implementation-context-packet', 'feature').replace(
      'Schema version: 1.0.0',
      'Schema version: not-a-version',
    );
    const result = parseSupplementalContextPacket(text, 'implementation-context-packet', 'implementation');
    expect(result.status).toBe('malformed');
    expect(result.issues.map((i) => i.code)).toContain('SUPPLEMENTAL_CONTEXT_INVALID_SCHEMA_VERSION');
  });

  it('classifies duplicate required metadata as malformed', () => {
    const text = renderSupplementalContextTemplate('implementation-context-packet', 'feature').replace(
      'Tool name: my-dev-kit',
      'Tool name: my-dev-kit\nTool name: my-dev-kit',
    );
    const result = parseSupplementalContextPacket(text, 'implementation-context-packet', 'implementation');
    expect(result.status).toBe('malformed');
    expect(result.issues.map((i) => i.code)).toContain('SUPPLEMENTAL_CONTEXT_DUPLICATE_METADATA');
  });

  it('classifies missing required metadata as malformed', () => {
    const text = renderSupplementalContextTemplate('implementation-context-packet', 'feature').replace(
      'Tool name: my-dev-kit\n',
      '',
    );
    const result = parseSupplementalContextPacket(text, 'implementation-context-packet', 'implementation');
    expect(result.status).toBe('malformed');
    expect(result.issues.map((i) => i.code)).toContain('SUPPLEMENTAL_CONTEXT_MISSING_REQUIRED_METADATA');
  });

  it('classifies a missing required section as malformed', () => {
    const text = renderSupplementalContextTemplate('implementation-context-packet', 'feature').replace(
      '## Notes\nNone recorded.',
      '',
    );
    const result = parseSupplementalContextPacket(text, 'implementation-context-packet', 'implementation');
    expect(result.status).toBe('malformed');
    expect(result.issues.map((i) => i.code)).toContain('SUPPLEMENTAL_CONTEXT_MISSING_REQUIRED_SECTION');
  });

  it('classifies an invalid freshness/adequacy/truncation value as malformed', () => {
    const freshness = renderSupplementalContextTemplate('implementation-context-packet', 'feature').replace(
      'Freshness: unknown',
      'Freshness: sort-of',
    );
    expect(parseSupplementalContextPacket(freshness, 'implementation-context-packet', 'implementation').status).toBe(
      'malformed',
    );

    const adequacy = renderSupplementalContextTemplate('implementation-context-packet', 'feature').replace(
      'Adequacy: unknown',
      'Adequacy: maybe',
    );
    expect(parseSupplementalContextPacket(adequacy, 'implementation-context-packet', 'implementation').status).toBe(
      'malformed',
    );

    const truncation = renderSupplementalContextTemplate('implementation-context-packet', 'feature').replace(
      'Required evidence truncated: unknown',
      'Required evidence truncated: sometimes',
    );
    expect(
      parseSupplementalContextPacket(truncation, 'implementation-context-packet', 'implementation').status,
    ).toBe('malformed');
  });

  it('preserves unknown additive metadata and sections without breaking parsing', () => {
    const text =
      renderSupplementalContextTemplate('implementation-context-packet', 'feature').replace(
        'Tool name: my-dev-kit',
        'Extra field: extra value\nTool name: my-dev-kit',
      ) + '\n## Extra section\nSome additive content.\n';
    const result = parseSupplementalContextPacket(text, 'implementation-context-packet', 'implementation');
    expect(result.status).toBe('template');
    expect(result.issues).toEqual([]);
  });

  it('classifies retrieval reports the same way as packets', () => {
    const text = renderSupplementalContextTemplate('implementation-context-retrieval-report', 'feature');
    const result = parseSupplementalContextRetrievalReport(
      text,
      'implementation-context-retrieval-report',
      'implementation',
    );
    expect(result.status).toBe('template');
  });

  it('preserves declared freshness/adequacy/truncation without inferring them', () => {
    const text = fillRequiredSections(
      renderSupplementalContextTemplate('implementation-context-packet', 'feature')
        .replace('Freshness: unknown', 'Freshness: fresh')
        .replace('Adequacy: unknown', 'Adequacy: sufficient')
        .replace('Status: template', 'Status: populated'),
      'implementation-context-packet',
    );
    const result = parseSupplementalContextPacket(text, 'implementation-context-packet', 'implementation');
    expect(result.status).toBe('populated');
    expect(result.declaredFreshness).toBe('fresh');
    expect(result.declaredAdequacy).toBe('sufficient');
  });

  // Batch 6 section 10.5: a document declared "populated" whose required
  // readiness sections still hold the exact starter-template placeholder is
  // reclassified "malformed" -- exact-string detection only, no semantic
  // interpretation. An explicit substantive statement (even a short one)
  // always passes.
  describe('populated-document placeholder-completeness check', () => {
    it('a populated document with every required section genuinely filled classifies as populated', () => {
      const text = populated('implementation-context-packet');
      const result = parseSupplementalContextPacket(text, 'implementation-context-packet', 'implementation');
      expect(result.status).toBe('populated');
    });

    it('a populated document that left one required section as the literal placeholder is malformed', () => {
      const text = populated('implementation-context-packet').replace(
        '## Focus\nReady-context test fixture evidence for "Focus".',
        '## Focus\nNot populated.',
      );
      const result = parseSupplementalContextPacket(text, 'implementation-context-packet', 'implementation');
      expect(result.status).toBe('malformed');
      expect(result.issues.map((i) => i.code)).toContain('CONTEXT_REQUIRED_SECTION_NOT_POPULATED');
    });

    it('an explicit substantive statement (not the literal placeholder) always passes, even when terse', () => {
      const text = renderSupplementalContextTemplate('test-context-packet', 'feature')
        .replace('Status: template', 'Status: populated')
        .replace('## Test infrastructure\nNot populated.', '## Test infrastructure\nNo test infrastructure found.');
      // Fill every other required section so only "Test infrastructure" differs.
      const filled = fillRequiredSections(text, 'test-context-packet').replace(
        '## Test infrastructure\nReady-context test fixture evidence for "Test infrastructure".',
        '## Test infrastructure\nNo test infrastructure found.',
      );
      const result = parseSupplementalContextPacket(filled, 'test-context-packet', 'test-implementation');
      expect(result.status).toBe('populated');
    });

    it('covers every required section for both packet kinds', () => {
      for (const kind of Object.keys(REQUIRED_POPULATED_SECTIONS_BY_KIND) as Array<
        keyof typeof REQUIRED_POPULATED_SECTIONS_BY_KIND
      >) {
        const role = kind === 'implementation-context-packet' ? 'implementation' : 'test-implementation';
        const sections = REQUIRED_POPULATED_SECTIONS_BY_KIND[kind]!;
        for (const heading of sections) {
          const base = populated(kind as 'implementation-context-packet' | 'test-context-packet');
          const withPlaceholder = base.replace(
            `## ${heading}\nReady-context test fixture evidence for "${heading}".`,
            `## ${heading}\n${placeholderForSection(kind, heading)}`,
          );
          expect(withPlaceholder).not.toBe(base);
          const result = parseSupplementalContextPacket(withPlaceholder, kind, role);
          expect(result.status).toBe('malformed');
        }
      }
    });

    it('retrieval reports are not subject to the placeholder-completeness check', () => {
      const text = renderSupplementalContextTemplate('implementation-context-retrieval-report', 'feature').replace(
        'Status: template',
        'Status: populated',
      );
      const result = parseSupplementalContextRetrievalReport(text, 'implementation-context-retrieval-report', 'implementation');
      expect(result.status).toBe('populated');
    });
  });
});
