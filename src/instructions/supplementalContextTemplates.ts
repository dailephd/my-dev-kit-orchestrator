// Deterministic starter templates for the four supplemental repository-context
// files, and the idempotent write helper used once at new-run creation.
//
// Templates never contain a timestamp, generatedAt, or random ID -- see
// AGENTS.txt Batch 4 section 7.5 -- so identical mode/run metadata always
// produces byte-identical content.

import * as fs from 'fs';
import * as path from 'path';
import {
  REQUIRED_SECTIONS_BY_DOCUMENT_KIND,
  ROLE_BY_DOCUMENT_KIND,
} from './supplementalContextContracts';
import {
  SUPPLEMENTAL_CONTEXT_PACKET_SCHEMA_VERSION,
  SUPPLEMENTAL_CONTEXT_RETRIEVAL_REPORT_SCHEMA_VERSION,
  SupplementalContextDocumentKind,
  RepositoryScope,
} from './supplementalContextTypes';
import {
  implementationContextPacketPath,
  implementationContextRetrievalReportPath,
  requiredSupplementalContextKindsForMode,
  testContextPacketPath,
  testContextRetrievalReportPath,
} from './stageRepositoryEvidenceRequirements';

// Exported (Batch 6) so the parser can detect starter placeholder text still
// present in a document declared "populated" using the exact same constants
// the templates are built from -- never a duplicated or guessed literal.
export const PLACEHOLDER_TEXT = 'Not populated.';
export const PLACEHOLDER_NONE = 'None recorded.';

const REPORT_KINDS: SupplementalContextDocumentKind[] = [
  'implementation-context-retrieval-report',
  'test-context-retrieval-report',
];

function isReportKind(kind: SupplementalContextDocumentKind): boolean {
  return REPORT_KINDS.includes(kind);
}

function isExtractionKind(kind: SupplementalContextDocumentKind): boolean {
  return kind === 'implementation-context-packet' || kind === 'test-context-packet';
}

function repositoryScopeForMode(mode: string): RepositoryScope {
  return mode === 'extraction' ? 'source-target' : 'single-repository';
}

function buildMetadataLines(kind: SupplementalContextDocumentKind, mode: string): string[] {
  const role = ROLE_BY_DOCUMENT_KIND[kind];
  const scope = repositoryScopeForMode(mode);
  const schemaVersion = isReportKind(kind)
    ? SUPPLEMENTAL_CONTEXT_RETRIEVAL_REPORT_SCHEMA_VERSION
    : SUPPLEMENTAL_CONTEXT_PACKET_SCHEMA_VERSION;

  const lines: string[] = [
    `Schema version: ${schemaVersion}`,
    `Document kind: ${kind}`,
    `Role: ${role}`,
    `Status: template`,
    `Repository scope: ${scope}`,
  ];

  if (isReportKind(kind)) {
    lines.push(`Request schema version: unknown`);
  }

  lines.push(`Context capsule schema version: unknown`);
  lines.push(`Retrieval audit schema version: unknown`);
  lines.push(`Tool name: my-dev-kit`);
  lines.push(`Tool version: unknown`);
  lines.push(`Index identity: unknown`);
  lines.push(`Freshness: unknown`);
  lines.push(`Adequacy: unknown`);
  lines.push(`Required evidence truncated: unknown`);
  // Batch 5: raw-evidence path references. A populated document must
  // replace these with real paths before readiness can reach "ready" --
  // readiness blocks while any of these remain "unknown" (AGENTS.txt Batch 5
  // section 22.3).
  lines.push(`Source context capsule: unknown`);
  lines.push(`Source retrieval audit: unknown`);
  lines.push(`After index: unknown`);

  if (kind === 'test-context-packet' || kind === 'test-context-retrieval-report') {
    lines.push(`Responsibility mappings truncated: unknown`);
    lines.push(`Critical responsibility mapping status: unknown`);
  }

  if (isReportKind(kind)) {
    lines.push(`Full-file fallback used: unknown`);
    lines.push(`Determinism checked: unknown`);
  }

  if (scope === 'source-target' && isExtractionKind(kind)) {
    lines.push(`Source repository: unknown`);
    lines.push(`Target repository: unknown`);
    lines.push(`Source index identity: unknown`);
    lines.push(`Target index identity: unknown`);
  }

  return lines;
}

export function placeholderForSection(kind: SupplementalContextDocumentKind, heading: string): string {
  if (heading === 'Command record') {
    return [
      'Manually record the my-dev-kit command used to populate this document, for example:',
      '',
      '  <MY_DEV_KIT_CLI> context --request <REQUEST_FILE> --json',
      '',
      'This orchestrator does not execute that command automatically.',
    ].join('\n');
  }
  if (heading === 'Assumptions' || heading === 'Notes' || heading === 'Warnings') {
    return PLACEHOLDER_NONE;
  }
  if (heading === 'Unresolved items' || heading === 'Unresolved evidence') {
    return PLACEHOLDER_NONE;
  }
  return isTestOnlyBoundarySection(kind, heading) ? testCriticalityBoundaryNote() : PLACEHOLDER_TEXT;
}

function isTestOnlyBoundarySection(kind: SupplementalContextDocumentKind, heading: string): boolean {
  return (
    (kind === 'test-context-packet' && heading === 'Responsibility mappings') ||
    (kind === 'test-context-retrieval-report' && heading === 'Criticality overlay')
  );
}

function testCriticalityBoundaryNote(): string {
  return [
    PLACEHOLDER_TEXT,
    '',
    'Responsibility criticality is supplied by the orchestrator TestStrategyPacket.',
    "my-dev-kit request IDs are noncritical unless the orchestrator overlays criticality.",
    "Do not infer criticality from my-dev-kit's request-level testResponsibilityRefs.",
  ].join('\n');
}

export function renderSupplementalContextTemplate(kind: SupplementalContextDocumentKind, mode: string): string {
  const metadataLines = buildMetadataLines(kind, mode);
  const requiredSections = REQUIRED_SECTIONS_BY_DOCUMENT_KIND[kind];

  const lines: string[] = [...metadataLines, ''];
  for (const heading of requiredSections) {
    lines.push(`## ${heading}`);
    lines.push(placeholderForSection(kind, heading));
    lines.push('');
  }
  // Trim the trailing blank line, then add exactly one final newline.
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n') + '\n';
}

interface RequiredTemplateFile {
  kind: SupplementalContextDocumentKind;
  absolutePath: string;
}

function requiredTemplateFiles(mode: string, runFolder: string): RequiredTemplateFile[] {
  const kinds = requiredSupplementalContextKindsForMode(mode);
  const files: RequiredTemplateFile[] = [];
  if (kinds.includes('implementation')) {
    files.push({ kind: 'implementation-context-packet', absolutePath: implementationContextPacketPath(runFolder) });
    files.push({
      kind: 'implementation-context-retrieval-report',
      absolutePath: implementationContextRetrievalReportPath(runFolder),
    });
  }
  if (kinds.includes('test')) {
    files.push({ kind: 'test-context-packet', absolutePath: testContextPacketPath(runFolder) });
    files.push({ kind: 'test-context-retrieval-report', absolutePath: testContextRetrievalReportPath(runFolder) });
  }
  return files;
}

// Writes each required starter template exactly once for the given mode.
// Idempotent and non-destructive: an existing file (populated or otherwise)
// is never overwritten, reset, appended to, or normalized -- this protects
// manually populated repository evidence. Called only from the new-run write
// boundary (writeStagePrompts()); never from prompt display.
export function writeSupplementalContextTemplates(mode: string, runFolder: string): void {
  for (const file of requiredTemplateFiles(mode, runFolder)) {
    if (fs.existsSync(file.absolutePath)) continue;
    const dir = path.dirname(file.absolutePath);
    if (!fs.existsSync(dir)) {
      throw new Error(
        `Cannot write supplemental context template: directory does not exist for "${file.kind}" at "${file.absolutePath}".`,
      );
    }
    const content = renderSupplementalContextTemplate(file.kind, mode);
    try {
      fs.writeFileSync(file.absolutePath, content, 'utf8');
    } catch (err) {
      throw new Error(
        `Failed to write required supplemental context template "${file.kind}" at "${file.absolutePath}": ${
          (err as Error).message
        }`,
      );
    }
  }
}
