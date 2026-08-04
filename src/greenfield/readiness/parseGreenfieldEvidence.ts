// v1.3.0 Batch 4: parses the bounded, line-based sub-format Batch 4's
// prompt templates ask agents to write inside existing native text-artifact
// sections (ScaffoldImplementationReport's "Files changed"/"Commands run",
// the greenfield VerificationReport's "Commands verified", and
// ProjectDocsReport's per-doc-name sections). Reuses artifactChecker.ts's
// parseArtifact() for the outer "Heading: body" section split -- this file
// only interprets the bounded bullet-list content within a section's body.
// Pure text parsing; no filesystem access.
import { ParsedArtifact } from '../../artifactChecker';
import {
  GreenfieldDocTarget,
  GreenfieldProjectDocName,
  GreenfieldProjectDocBootstrapResult,
} from '../bootstrap/projectDocBootstrapTypes';

const BULLET_LINE_RE = /^\s*[-*]\s*(.+)$/;

/** One "- <path>" line per generated/changed file. Raw values -- callers normalize with targetPathSafety.ts. */
export function parseFileListSection(sectionContent: string | undefined): readonly string[] {
  if (!sectionContent) {
    return [];
  }
  return sectionContent
    .split('\n')
    .map((line) => BULLET_LINE_RE.exec(line)?.[1]?.trim())
    .filter((value): value is string => Boolean(value && value.length > 0));
}

export type ReportedCommandStatus = 'passed' | 'failed' | 'skipped';

export interface ReportedCommandEvidence {
  readonly command: string;
  readonly status: ReportedCommandStatus;
  /** Present when status is 'skipped'; the honest reason recorded by the agent. */
  readonly reason?: string;
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set(['passed', 'failed', 'skipped']);

/**
 * One "- <command>: <status>[, <reason>]" line per command. Malformed lines
 * (unknown status, missing colon) are silently skipped here -- the
 * readiness evaluator treats a command absent from this list the same as
 * one with no recorded evidence (GF_COMMAND_EVIDENCE_MISSING), which is the
 * correct, honest outcome for an unparseable line.
 */
export function parseCommandEvidenceSection(sectionContent: string | undefined): readonly ReportedCommandEvidence[] {
  if (!sectionContent) {
    return [];
  }
  const results: ReportedCommandEvidence[] = [];
  for (const rawLine of sectionContent.split('\n')) {
    const bulletMatch = BULLET_LINE_RE.exec(rawLine);
    if (!bulletMatch) {
      continue;
    }
    const entry = bulletMatch[1].trim();
    const colonIndex = entry.lastIndexOf(':');
    if (colonIndex === -1) {
      continue;
    }
    const command = entry.slice(0, colonIndex).trim();
    const rest = entry.slice(colonIndex + 1).trim();
    if (command.length === 0 || rest.length === 0) {
      continue;
    }
    const commaIndex = rest.indexOf(',');
    const status = (commaIndex === -1 ? rest : rest.slice(0, commaIndex)).trim().toLowerCase();
    if (!KNOWN_STATUSES.has(status)) {
      continue;
    }
    const reason = commaIndex === -1 ? undefined : rest.slice(commaIndex + 1).trim() || undefined;
    results.push({ command, status: status as ReportedCommandStatus, reason });
  }
  return results;
}

const DOC_NAME_BY_SECTION_HEADING: ReadonlyMap<string, GreenfieldProjectDocName> = new Map([
  ['Product boundary', 'product-boundary'],
  ['Stack decision', 'stack-decision'],
  ['Starter profile summary', 'starter-profile-summary'],
  ['Development workflow', 'development-workflow'],
  ['Testing expectations', 'testing-expectations'],
  ['Validation expectations', 'validation-expectations'],
  ['Scaffold planning notes', 'scaffold-planning-notes'],
  ['Unresolved decisions', 'unresolved-decisions'],
  ['Non-goals', 'non-goals'],
]);

/**
 * Reconstructs a minimal GreenfieldProjectDocBootstrapResult from a parsed
 * ProjectDocsReport artifact's per-doc-name sections, so
 * validateGreenfieldProfileDocumentation() (Batch 2) can be reused exactly
 * as designed instead of re-implementing its claim/requirement checks
 * against raw text. Status is inferred: 'generated' when the section is
 * present and nonblank, 'skipped' when absent or blank -- there is no
 * 'partial' concept for a rendered report (unlike the in-memory bundle),
 * so a present-but-thin section is still 'generated' here; content
 * sufficiency is not evaluated by this reconstruction.
 */
export function reconstructProjectDocsBootstrapResult(
  parsed: ParsedArtifact,
): GreenfieldProjectDocBootstrapResult {
  const targets: GreenfieldDocTarget[] = [];
  for (const [heading, docName] of DOC_NAME_BY_SECTION_HEADING) {
    if (!parsed.sections.has(heading)) {
      // Section genuinely absent from the rendered report: omit the target
      // entirely so validateGreenfieldProfileDocumentation()'s existing
      // "missing-required-section" check (which tests docName presence in
      // this array) can detect it. Including a placeholder entry here would
      // make that check unable to ever fire.
      continue;
    }
    const trimmed = (parsed.sections.get(heading) ?? '').trim();
    targets.push({
      docName,
      status: trimmed.length > 0 ? 'generated' : 'skipped',
      sections: trimmed.length > 0 ? [{ heading, content: trimmed }] : [],
      unresolvedNotes: trimmed.length > 0 ? [] : [`${heading} present but blank in the rendered report`],
    });
  }
  return { targets, componentTargets: [], unresolvedDecisions: [] };
}
