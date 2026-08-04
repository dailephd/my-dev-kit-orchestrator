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
import { GreenfieldProfileCommand, GreenfieldProfileId } from '../profiles/profileTypes';
import { GreenfieldScaffoldPlan } from '../scaffold/scaffoldPlanTypes';

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

const KNOWN_PLAN_COMMAND_CLASSIFICATIONS: ReadonlySet<string> = new Set(['required', 'optional']);

/**
 * v1.3.0 Batch 4 correction: one "- <command>: required|optional[, <notes>]"
 * line per command, the ScaffoldPlan-side counterpart to
 * parseCommandEvidenceSection() above. `purpose` has no rendered-report
 * source (the plan template only asks for command text and a required/
 * optional classification), so it is filled with a fixed placeholder --
 * validateGreenfieldScaffoldPlan() never inspects `purpose`, only
 * `command`/`required`. Malformed lines (unknown classification, missing
 * colon) are silently skipped, matching parseCommandEvidenceSection()'s
 * precedent: a command absent from the reconstructed plan is treated the
 * same as a command the plan never declared, which is the correct, honest
 * outcome for an unparseable line.
 */
export function parsePlanCommandSection(sectionContent: string | undefined): readonly GreenfieldProfileCommand[] {
  if (!sectionContent) {
    return [];
  }
  const results: GreenfieldProfileCommand[] = [];
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
    const classification = (commaIndex === -1 ? rest : rest.slice(0, commaIndex)).trim().toLowerCase();
    if (!KNOWN_PLAN_COMMAND_CLASSIFICATIONS.has(classification)) {
      continue;
    }
    const environmentNotes = commaIndex === -1 ? undefined : rest.slice(commaIndex + 1).trim() || undefined;
    results.push({
      command,
      purpose: '(reported)',
      required: classification === 'required',
      ...(environmentNotes ? { environmentNotes } : {}),
    });
  }
  return results;
}

/**
 * v1.3.0 Batch 4 correction: reconstructs a full GreenfieldScaffoldPlan from
 * a parsed, on-disk scaffold-plan.txt so validateGreenfieldScaffoldPlan()
 * (Batch 3) can be reused exactly as designed against the plan an agent
 * actually persisted, instead of only ever running against an in-memory
 * plan a caller constructs directly. Always returns a full plan object --
 * missing/blank sections become empty arrays, and a missing/blank "Profile"
 * section becomes `profileId: undefined`, which validateGreenfieldScaffoldPlan()
 * already turns into GF_PLAN_PROFILE_MISMATCH (its existing "plan does not
 * declare a profile id" branch) without any new issue code.
 */
export function parseGreenfieldScaffoldPlanArtifact(parsed: ParsedArtifact): GreenfieldScaffoldPlan {
  const rawProfileId = (parsed.sections.get('Profile') ?? '').trim();
  const targetPaths = parseFileListSection(parsed.sections.get('Target paths'));

  return {
    profileId: rawProfileId.length > 0 ? (rawProfileId as GreenfieldProfileId) : undefined,
    plannedFileGroups:
      targetPaths.length > 0
        ? [{ name: 'reported', description: 'Reported target paths.', filePaths: [...targetPaths] }]
        : [],
    firstRunnableBehavior: { description: (parsed.sections.get('First runnable behavior') ?? '').trim() },
    setupCommands: [...parsePlanCommandSection(parsed.sections.get('Setup commands'))],
    validationCommands: [...parsePlanCommandSection(parsed.sections.get('Validation commands'))],
    testExpectations: [...parseFileListSection(parsed.sections.get('Test expectations'))],
    documentationExpectations: [...parseFileListSection(parsed.sections.get('Documentation expectations'))],
    unresolvedDecisions: [...parseFileListSection(parsed.sections.get('Unresolved decisions'))],
    nonGoals: [...parseFileListSection(parsed.sections.get('Non-goals'))],
    unsupportedClaims: [],
  };
}
