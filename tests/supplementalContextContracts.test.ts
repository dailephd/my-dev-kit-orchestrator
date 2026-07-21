import {
  SUPPLEMENTAL_CONTEXT_PACKET_SCHEMA_VERSION,
  SUPPLEMENTAL_CONTEXT_PACKET_SUPPORTED_MAJOR,
  SUPPLEMENTAL_CONTEXT_RETRIEVAL_REPORT_SCHEMA_VERSION,
  SUPPLEMENTAL_CONTEXT_RETRIEVAL_REPORT_SUPPORTED_MAJOR,
} from '../src/instructions/supplementalContextTypes';
import {
  REQUIRED_METADATA_BY_DOCUMENT_KIND,
  REQUIRED_SECTIONS_BY_DOCUMENT_KIND,
  ROLE_BY_DOCUMENT_KIND,
} from '../src/instructions/supplementalContextContracts';

describe('supplemental context schema constants', () => {
  it('packet schema version is 1.0.0, supported major 1', () => {
    expect(SUPPLEMENTAL_CONTEXT_PACKET_SCHEMA_VERSION).toBe('1.0.0');
    expect(SUPPLEMENTAL_CONTEXT_PACKET_SUPPORTED_MAJOR).toBe(1);
  });

  it('report schema version is 1.0.0, supported major 1', () => {
    expect(SUPPLEMENTAL_CONTEXT_RETRIEVAL_REPORT_SCHEMA_VERSION).toBe('1.0.0');
    expect(SUPPLEMENTAL_CONTEXT_RETRIEVAL_REPORT_SUPPORTED_MAJOR).toBe(1);
  });

  it('exact document kinds map to exact roles', () => {
    expect(ROLE_BY_DOCUMENT_KIND['implementation-context-packet']).toBe('implementation');
    expect(ROLE_BY_DOCUMENT_KIND['implementation-context-retrieval-report']).toBe('implementation');
    expect(ROLE_BY_DOCUMENT_KIND['test-context-packet']).toBe('test-implementation');
    expect(ROLE_BY_DOCUMENT_KIND['test-context-retrieval-report']).toBe('test-implementation');
  });

  it('test document kinds require the responsibility-mapping metadata keys; implementation kinds do not', () => {
    expect(REQUIRED_METADATA_BY_DOCUMENT_KIND['test-context-packet']).toEqual(
      expect.arrayContaining(['Responsibility mappings truncated', 'Critical responsibility mapping status']),
    );
    expect(REQUIRED_METADATA_BY_DOCUMENT_KIND['implementation-context-packet']).not.toEqual(
      expect.arrayContaining(['Responsibility mappings truncated']),
    );
  });

  it('report kinds require request/full-file-fallback/determinism metadata; packet kinds do not', () => {
    expect(REQUIRED_METADATA_BY_DOCUMENT_KIND['implementation-context-retrieval-report']).toEqual(
      expect.arrayContaining(['Request schema version', 'Full-file fallback used', 'Determinism checked']),
    );
    expect(REQUIRED_METADATA_BY_DOCUMENT_KIND['implementation-context-packet']).not.toEqual(
      expect.arrayContaining(['Request schema version']),
    );
  });

  it('every document kind has at least one required section', () => {
    for (const kind of Object.keys(REQUIRED_SECTIONS_BY_DOCUMENT_KIND) as Array<
      keyof typeof REQUIRED_SECTIONS_BY_DOCUMENT_KIND
    >) {
      expect(REQUIRED_SECTIONS_BY_DOCUMENT_KIND[kind].length).toBeGreaterThan(0);
    }
  });
});
