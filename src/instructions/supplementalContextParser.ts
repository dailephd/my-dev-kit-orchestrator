// Deterministic line-based parser for supplemental repository-context
// documents (implementation/test context packets and retrieval reports).
//
// Rules (see AGENTS.txt Batch 4 section 7.1): metadata is "Key: value" lines
// before the first "## " heading; keys are case-sensitive; no fuzzy or
// semantic matching; no LLM. The parser only classifies document structure
// -- it never evaluates whether a declared value (freshness, adequacy,
// truncation) is actually true.

import * as fs from 'fs';
import {
  REQUIRED_METADATA_BY_DOCUMENT_KIND,
  REQUIRED_SECTIONS_BY_DOCUMENT_KIND,
  ROLE_BY_DOCUMENT_KIND,
  VALID_ADEQUACY_VALUES,
  VALID_DECLARED_STATUSES,
  VALID_FRESHNESS_VALUES,
  VALID_REPOSITORY_SCOPES,
  VALID_TRUNCATION_VALUES,
} from './supplementalContextContracts';
import { placeholderForSection } from './supplementalContextTemplates';
import {
  DeclaredAdequacy,
  DeclaredFreshness,
  DeclaredTruncation,
  SUPPLEMENTAL_CONTEXT_PACKET_SUPPORTED_MAJOR,
  SUPPLEMENTAL_CONTEXT_RETRIEVAL_REPORT_SUPPORTED_MAJOR,
  SupplementalContextDeclaredStatus,
  SupplementalContextDocumentKind,
  SupplementalContextInspection,
  SupplementalContextParsedDocument,
  SupplementalContextParserIssue,
  SupplementalContextRawMetadata,
  SupplementalContextRole,
} from './supplementalContextTypes';

const METADATA_LINE_RE = /^([A-Za-z][A-Za-z0-9 -]*): (.*)$/;
const SECTION_HEADING_RE = /^## (.+)$/;

// AGENTS.txt Batch 6 section 10.5 / Batch 5 section 9.8: the required
// readiness sections that a "populated" document must actually populate.
// Retrieval-report kinds are intentionally excluded -- the spec scopes this
// check to the two packet kinds only.
export const REQUIRED_POPULATED_SECTIONS_BY_KIND: Partial<Record<SupplementalContextDocumentKind, string[]>> = {
  'implementation-context-packet': ['Focus', 'Selected owners', 'Contracts', 'Unresolved items', 'Provenance'],
  'test-context-packet': [
    'Changed surface',
    'Production owners',
    'Production contracts',
    'Test infrastructure',
    'Test commands',
    'Test responsibilities',
    'Responsibility mappings',
    'Unresolved items',
    'Provenance',
  ],
};

const RETRIEVAL_REPORT_KINDS: SupplementalContextDocumentKind[] = [
  'implementation-context-retrieval-report',
  'test-context-retrieval-report',
];

function issue(code: SupplementalContextParserIssue['code'], message: string): SupplementalContextParserIssue {
  return { code, message };
}

// Parses raw text into a metadata map (pre-first-heading "Key: value" lines)
// and a section map (post-heading blocks keyed by heading text). Reports
// structural issues (duplicate metadata keys, duplicate sections, empty
// values) via the issues array rather than throwing.
export function parseSupplementalContextText(
  text: string,
): { document: SupplementalContextParsedDocument; issues: SupplementalContextParserIssue[] } {
  const issues: SupplementalContextParserIssue[] = [];
  const lines = text.split(/\r\n|\n/);

  const metadata: SupplementalContextRawMetadata = {};
  const sections: Record<string, string> = {};

  let i = 0;
  // Metadata block: consume lines until the first section heading.
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (SECTION_HEADING_RE.test(line)) break;
    const match = line.match(METADATA_LINE_RE);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim();
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      issues.push(issue('SUPPLEMENTAL_CONTEXT_DUPLICATE_METADATA', `Duplicate metadata key: "${key}"`));
      continue;
    }
    if (value.length === 0) {
      issues.push(issue('SUPPLEMENTAL_CONTEXT_EMPTY_METADATA_VALUE', `Metadata key "${key}" has an empty value.`));
    }
    metadata[key] = value;
  }

  // Section block: each "## Heading" starts a section that runs until the
  // next heading or end of file.
  let currentHeading: string | null = null;
  let currentLines: string[] = [];
  const flush = () => {
    if (currentHeading === null) return;
    const content = currentLines.join('\n').trim();
    if (Object.prototype.hasOwnProperty.call(sections, currentHeading)) {
      issues.push(issue('SUPPLEMENTAL_CONTEXT_DUPLICATE_SECTION', `Duplicate section heading: "## ${currentHeading}"`));
    } else {
      sections[currentHeading] = content;
    }
  };
  for (; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(SECTION_HEADING_RE);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
      currentLines = [];
    } else if (currentHeading !== null) {
      currentLines.push(line);
    }
  }
  flush();

  return { document: { metadata, sections }, issues };
}

function isValidSchemaVersion(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(v);
}

function schemaMajor(v: string): number {
  return parseInt(v.split('.')[0], 10);
}

function supportedMajorForKind(kind: SupplementalContextDocumentKind): number {
  return RETRIEVAL_REPORT_KINDS.includes(kind)
    ? SUPPLEMENTAL_CONTEXT_RETRIEVAL_REPORT_SUPPORTED_MAJOR
    : SUPPLEMENTAL_CONTEXT_PACKET_SUPPORTED_MAJOR;
}

function isTestKind(kind: SupplementalContextDocumentKind): boolean {
  return kind === 'test-context-packet' || kind === 'test-context-retrieval-report';
}

function classify(
  text: string,
  expectedKind: SupplementalContextDocumentKind,
  expectedRole: SupplementalContextRole,
  path: string,
): SupplementalContextInspection {
  const { document, issues } = parseSupplementalContextText(text);
  const { metadata } = document;

  const requiredMetadata = REQUIRED_METADATA_BY_DOCUMENT_KIND[expectedKind];
  for (const key of requiredMetadata) {
    if (!Object.prototype.hasOwnProperty.call(metadata, key)) {
      issues.push(issue('SUPPLEMENTAL_CONTEXT_MISSING_REQUIRED_METADATA', `Missing required metadata: "${key}"`));
    }
  }

  const requiredSections = REQUIRED_SECTIONS_BY_DOCUMENT_KIND[expectedKind];
  for (const heading of requiredSections) {
    if (!Object.prototype.hasOwnProperty.call(document.sections, heading)) {
      issues.push(issue('SUPPLEMENTAL_CONTEXT_MISSING_REQUIRED_SECTION', `Missing required section: "## ${heading}"`));
    }
  }

  const declaredSchemaVersion = metadata['Schema version'];
  const declaredKind = metadata['Document kind'];
  const declaredRole = metadata['Role'];
  const declaredStatusRaw = metadata['Status'];
  const declaredRepositoryScope = metadata['Repository scope'];
  const declaredFreshnessRaw = metadata['Freshness'];
  const declaredAdequacyRaw = metadata['Adequacy'];
  const declaredTruncatedRaw = metadata['Required evidence truncated'];
  const declaredResponsibilityTruncatedRaw = metadata['Responsibility mappings truncated'];
  const declaredCriticalMappingStatus = metadata['Critical responsibility mapping status'];
  const toolName = metadata['Tool name'];
  const toolVersion = metadata['Tool version'];
  const indexIdentity = metadata['Index identity'];
  const contextCapsuleSchemaVersion = metadata['Context capsule schema version'];
  const retrievalAuditSchemaVersion = metadata['Retrieval audit schema version'];
  const declaredSourceCapsulePath = metadata['Source context capsule'];
  const declaredSourceAuditPath = metadata['Source retrieval audit'];
  const declaredAfterIndex = metadata['After index'];

  if (declaredSchemaVersion !== undefined && declaredSchemaVersion.length > 0 && !isValidSchemaVersion(declaredSchemaVersion)) {
    issues.push(
      issue('SUPPLEMENTAL_CONTEXT_INVALID_SCHEMA_VERSION', `Invalid schema version: "${declaredSchemaVersion}"`),
    );
  }
  if (declaredRepositoryScope !== undefined && declaredRepositoryScope.length > 0 && !VALID_REPOSITORY_SCOPES.includes(declaredRepositoryScope)) {
    issues.push(
      issue('SUPPLEMENTAL_CONTEXT_INVALID_REPOSITORY_SCOPE', `Invalid repository scope: "${declaredRepositoryScope}"`),
    );
  }
  if (declaredStatusRaw !== undefined && declaredStatusRaw.length > 0 && !VALID_DECLARED_STATUSES.includes(declaredStatusRaw)) {
    issues.push(issue('SUPPLEMENTAL_CONTEXT_INVALID_STATUS', `Invalid status: "${declaredStatusRaw}"`));
  }
  if (declaredFreshnessRaw !== undefined && declaredFreshnessRaw.length > 0 && !VALID_FRESHNESS_VALUES.includes(declaredFreshnessRaw)) {
    issues.push(issue('SUPPLEMENTAL_CONTEXT_INVALID_FRESHNESS', `Invalid freshness: "${declaredFreshnessRaw}"`));
  }
  if (declaredAdequacyRaw !== undefined && declaredAdequacyRaw.length > 0 && !VALID_ADEQUACY_VALUES.includes(declaredAdequacyRaw)) {
    issues.push(issue('SUPPLEMENTAL_CONTEXT_INVALID_ADEQUACY', `Invalid adequacy: "${declaredAdequacyRaw}"`));
  }
  if (declaredTruncatedRaw !== undefined && declaredTruncatedRaw.length > 0 && !VALID_TRUNCATION_VALUES.includes(declaredTruncatedRaw)) {
    issues.push(
      issue('SUPPLEMENTAL_CONTEXT_INVALID_TRUNCATION', `Invalid "Required evidence truncated" value: "${declaredTruncatedRaw}"`),
    );
  }
  if (
    isTestKind(expectedKind) &&
    declaredResponsibilityTruncatedRaw !== undefined &&
    declaredResponsibilityTruncatedRaw.length > 0 &&
    !VALID_TRUNCATION_VALUES.includes(declaredResponsibilityTruncatedRaw)
  ) {
    issues.push(
      issue(
        'SUPPLEMENTAL_CONTEXT_INVALID_TRUNCATION',
        `Invalid "Responsibility mappings truncated" value: "${declaredResponsibilityTruncatedRaw}"`,
      ),
    );
  }

  const warnings: string[] = [];
  const supportedSchemaMajor = supportedMajorForKind(expectedKind);

  const base: SupplementalContextInspection = {
    status: 'malformed',
    path,
    expectedKind,
    expectedRole,
    declaredSchemaVersion,
    declaredKind,
    declaredRole,
    declaredRepositoryScope,
    toolName,
    toolVersion,
    indexIdentity,
    contextCapsuleSchemaVersion,
    retrievalAuditSchemaVersion,
    declaredSourceCapsulePath,
    declaredSourceAuditPath,
    declaredAfterIndex,
    supportedSchemaMajor,
    warnings,
    issues,
  };

  if (issues.length > 0) {
    return base;
  }

  // Structurally valid: safe to trust declared enum values from here on.
  const declaredStatus = declaredStatusRaw as SupplementalContextDeclaredStatus;
  const declaredFreshness = declaredFreshnessRaw as DeclaredFreshness;
  const declaredAdequacy = declaredAdequacyRaw as DeclaredAdequacy;
  const declaredRequiredEvidenceTruncated = declaredTruncatedRaw as DeclaredTruncation;
  const declaredResponsibilityMappingsTruncated = isTestKind(expectedKind)
    ? (declaredResponsibilityTruncatedRaw as DeclaredTruncation)
    : undefined;

  const enriched: SupplementalContextInspection = {
    ...base,
    declaredStatus,
    declaredFreshness,
    declaredAdequacy,
    declaredRequiredEvidenceTruncated,
    declaredResponsibilityMappingsTruncated,
    declaredCriticalResponsibilityMappingStatus: isTestKind(expectedKind) ? declaredCriticalMappingStatus : undefined,
  };

  if (schemaMajor(declaredSchemaVersion!) !== supportedSchemaMajor) {
    return { ...enriched, status: 'unsupported-schema' };
  }
  if (declaredKind !== expectedKind) {
    return { ...enriched, status: 'kind-mismatch' };
  }
  if (declaredRole !== expectedRole) {
    return { ...enriched, status: 'role-mismatch' };
  }

  // Batch 6 section 10.5: a document declared "populated" but whose required
  // readiness sections still hold the exact starter-template placeholder
  // text is not actually populated. Exact-string comparison only against the
  // same constants the templates are built from -- no semantic or fuzzy
  // interpretation, and an explicit substantive statement (anything other
  // than the literal placeholder) always passes.
  if (declaredStatus === 'populated') {
    const requiredPopulatedSections = REQUIRED_POPULATED_SECTIONS_BY_KIND[expectedKind];
    if (requiredPopulatedSections) {
      const placeholderIssues: SupplementalContextParserIssue[] = [];
      for (const heading of requiredPopulatedSections) {
        const content = document.sections[heading];
        if (content !== undefined && content.trim() === placeholderForSection(expectedKind, heading).trim()) {
          placeholderIssues.push(
            issue(
              'CONTEXT_REQUIRED_SECTION_NOT_POPULATED',
              `Section "## ${heading}" still holds the starter placeholder text; document is declared populated but "${heading}" is not (kind: ${expectedKind}, path: ${path}).`,
            ),
          );
        }
      }
      if (placeholderIssues.length > 0) {
        return { ...enriched, status: 'malformed', issues: [...issues, ...placeholderIssues] };
      }
    }
  }

  return { ...enriched, status: declaredStatus };
}

export function parseSupplementalContextPacket(
  text: string,
  expectedKind: SupplementalContextDocumentKind,
  expectedRole: SupplementalContextRole,
  path = '(in-memory)',
): SupplementalContextInspection {
  return classify(text, expectedKind, expectedRole, path);
}

export function parseSupplementalContextRetrievalReport(
  text: string,
  expectedKind: SupplementalContextDocumentKind,
  expectedRole: SupplementalContextRole,
  path = '(in-memory)',
): SupplementalContextInspection {
  return classify(text, expectedKind, expectedRole, path);
}

// Reads a supplemental context file from disk (read-only) and classifies it.
// A missing file is not an error -- it is a structured "missing" result, so
// StageContextBundle assembly and prompt generation never throw merely
// because a run has not been supplemented with repository evidence yet.
export function inspectSupplementalContextFile(
  path: string,
  expectedKind: SupplementalContextDocumentKind,
  expectedRole: SupplementalContextRole = ROLE_BY_DOCUMENT_KIND[expectedKind],
): SupplementalContextInspection {
  if (!fs.existsSync(path)) {
    return {
      status: 'missing',
      path,
      expectedKind,
      expectedRole,
      supportedSchemaMajor: supportedMajorForKind(expectedKind),
      warnings: [],
      issues: [],
    };
  }
  const text = fs.readFileSync(path, 'utf8');
  return classify(text, expectedKind, expectedRole, path);
}
