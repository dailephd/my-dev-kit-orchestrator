// v1.3.0 Batch 4 (PseudocodePacket PSE-020): evaluates whether a greenfield
// run has sufficient evidence of profile-conformant, verified, non-
// placeholder completion. Pure and deterministic: consumes already-read
// artifact text content and an already-resolved profile; performs no
// filesystem access itself except the single, bounded, read-only
// corroboration call per reported required target (corroborateGeneratedTarget.ts).
// Reuses the Batch 1-3 issue model and the Batch 1-3 validators
// (validateGreenfieldProfile, validateGreenfieldScaffoldPlan,
// validateGreenfieldProfileDocumentation) rather than re-implementing them.
import { GreenfieldProfileCommand } from '../profiles/profileTypes';
import { ProfileValidationIssue } from '../profiles/profileValidationTypes';
import { finalizeProfileValidationResult } from '../profiles/profileValidationOrdering';
import { validateGreenfieldProfile } from '../profiles/validateGreenfieldProfile';
import { validateGreenfieldScaffoldPlan } from '../scaffold/validateGreenfieldScaffoldPlan';
import { normalizeTargetPath, isAbsolutePathFailure } from '../profiles/targetPathSafety';
import { matchesBoundedPattern, matchesExact } from '../profiles/targetPatternMatching';
import { validateGreenfieldProfileDocumentation } from '../bootstrap/validateBootstrapDocs';
import { parseArtifact, isPlaceholderContent } from '../../artifactChecker';
import {
  parseFileListSection,
  parseCommandEvidenceSection,
  reconstructProjectDocsBootstrapResult,
  ReportedCommandEvidence,
} from './parseGreenfieldEvidence';
import { corroborateGeneratedTarget } from './corroborateGeneratedTarget';
import { GreenfieldReadinessInputs, GreenfieldReadinessResult } from './greenfieldReadinessTypes';

export function evaluateGreenfieldReadiness(inputs: GreenfieldReadinessInputs): GreenfieldReadinessResult {
  const { profile } = inputs;
  const profileId = profile.id;
  const issues: ProfileValidationIssue[] = [];

  issues.push(...validateGreenfieldProfile(profile).issues);
  if (inputs.scaffoldPlan) {
    issues.push(...validateGreenfieldScaffoldPlan(profile, inputs.scaffoldPlan).issues);
  }

  const reportContent = inputs.scaffoldImplementationReportContent;
  const reportMissing = !reportContent || isPlaceholderContent(reportContent);
  let legacyRun = false;
  let filesystemCorroborationPerformed = false;

  if (reportMissing) {
    issues.push(scaffoldReportMissingIssue(profileId));
  } else {
    const parsedReport = parseArtifact(reportContent);
    legacyRun = !parsedReport.sections.has('Profile');

    if (inputs.scaffoldImplementationReportStale) {
      issues.push(scaffoldReportStaleIssue(profileId));
    }

    if (legacyRun) {
      issues.push(legacyEvidenceNotEvaluatedIssue(profileId));
    } else {
      const reportedProfileId = (parsedReport.sections.get('Profile') ?? '').trim();
      const profileMatches = reportedProfileId === profile.id;
      const rawFileLines = profileMatches ? parseFileListSection(parsedReport.sections.get('Files changed')) : [];
      const { normalizedPaths, pathIssues } = normalizeReportedPaths(profileId, rawFileLines);
      issues.push(...pathIssues);

      const corroboration = evaluateGeneratedTargetEvidence(
        profileId,
        profile.targetExpectations,
        normalizedPaths,
        inputs.projectRoot,
      );
      issues.push(...corroboration.issues);
      filesystemCorroborationPerformed = corroboration.filesystemCorroborationPerformed;
    }
  }

  const sliceContent = inputs.firstVerticalSliceContent;
  const sliceMissing = !sliceContent || isPlaceholderContent(sliceContent);
  if (sliceMissing) {
    issues.push(firstSliceMissingIssue(profileId));
  } else {
    issues.push(...evaluateFirstVerticalSlice(profileId, profile.id, sliceContent, legacyRun));
    if (inputs.firstVerticalSliceStale) {
      issues.push(scaffoldReportStaleIssue(profileId)); // shared stale code; affectedContract distinguishes the artifact
    }
  }

  issues.push(
    ...evaluateCommandEvidence(profileId, profile.validationCommands, inputs.verificationReportContent),
  );

  if (inputs.projectDocsReportContent) {
    const parsedDocs = parseArtifact(inputs.projectDocsReportContent);
    const reconstructed = reconstructProjectDocsBootstrapResult(parsedDocs);
    issues.push(...validateGreenfieldProfileDocumentation(reconstructed, profile).issues);
  }

  const finalized = finalizeProfileValidationResult(issues);
  const ready = finalized.valid && !legacyRun && !reportMissing && !sliceMissing;

  return {
    ...finalized,
    ready,
    legacyRun,
    filesystemCorroborationPerformed,
  };
}

// ─── Scaffold report / generated-target evidence ─────────────────────────

function normalizeReportedPaths(
  profileId: string,
  rawLines: readonly string[],
): { normalizedPaths: readonly string[]; pathIssues: ProfileValidationIssue[] } {
  const pathIssues: ProfileValidationIssue[] = [];
  const normalizedPaths: string[] = [];
  rawLines.forEach((rawValue, index) => {
    const normalization = normalizeTargetPath(rawValue);
    if (!normalization.ok) {
      const reason = normalization.reason!;
      if (isAbsolutePathFailure(reason)) {
        pathIssues.push({
          code: 'GF_PATH_ABSOLUTE',
          severity: 'error',
          profileId,
          affectedContract: `Files changed[${index}]`,
          reason: `Reported generated file "${rawValue}" is absolute or UNC/URI-qualified, which is not allowed.`,
          correctiveAction: 'Report a root-relative path only.',
          evidenceKey: `Files changed[${index}]`,
          actual: rawValue,
        });
      } else if (reason === 'traversal') {
        pathIssues.push({
          code: 'GF_PATH_TRAVERSAL',
          severity: 'error',
          profileId,
          affectedContract: `Files changed[${index}]`,
          reason: `Reported generated file "${rawValue}" contains a parent-traversal ("..") segment, which is not allowed.`,
          correctiveAction: 'Remove the ".." segment.',
          evidenceKey: `Files changed[${index}]`,
          actual: rawValue,
        });
      }
      // Other malformed reasons (empty/control-character/trailing-separator)
      // simply cannot corroborate anything and are silently excluded --
      // there is no distinct approved code for a malformed report path.
      return;
    }
    normalizedPaths.push(normalization.normalized!);
  });
  return { normalizedPaths, pathIssues };
}

function evaluateGeneratedTargetEvidence(
  profileId: string,
  targetExpectations: GreenfieldReadinessInputs['profile']['targetExpectations'],
  normalizedReportedPaths: readonly string[],
  projectRoot: string | undefined,
): { issues: ProfileValidationIssue[]; filesystemCorroborationPerformed: boolean } {
  const issues: ProfileValidationIssue[] = [];
  let filesystemCorroborationPerformed = false;

  for (const expectation of targetExpectations) {
    if (!expectation.required) {
      continue; // 7.2: omitted optional expectations do not fail.
    }
    const expectedValue = expectation.matcher?.value;
    if (typeof expectedValue !== 'string') {
      continue; // malformed expectation already reported by validateGreenfieldProfile.
    }
    const matches = normalizedReportedPaths.filter((reportedPath) =>
      expectation.matcher.kind === 'exact'
        ? matchesExact(reportedPath, expectedValue)
        : matchesBoundedPattern(reportedPath, expectedValue),
    );

    if (matches.length === 0) {
      issues.push({
        code: 'GF_GENERATED_EVIDENCE_MISSING',
        severity: 'error',
        profileId,
        affectedContract: `targetExpectations:${expectation.id}`,
        reason: `Required target expectation "${expectation.id}" (${expectation.purpose}) has no matching entry in the scaffold implementation report's "Files changed" section.`,
        correctiveAction: `Report a generated file matching "${expectedValue}" (${expectation.matcher.kind}) in "Files changed".`,
        evidenceKey: expectation.id,
        expected: expectedValue,
      });
      continue;
    }

    if (projectRoot) {
      filesystemCorroborationPerformed = true;
      const corroboration = corroborateGeneratedTarget(projectRoot, matches[0]);
      if (corroboration.status !== 'corroborated') {
        issues.push({
          code: 'GF_GENERATED_EVIDENCE_CONFLICT',
          severity: 'error',
          profileId,
          affectedContract: `targetExpectations:${expectation.id}`,
          reason: `Reported generated file "${matches[0]}" for target expectation "${expectation.id}" is not a corroborated regular file under the run project root (status: ${corroboration.status}).`,
          correctiveAction: 'Ensure the reported file exists as an ordinary file (not a directory or symlink) under the project root, or correct the report.',
          evidenceKey: expectation.id,
          actual: corroboration.status,
        });
      }
    }
  }

  return { issues, filesystemCorroborationPerformed };
}

// ─── First-vertical-slice readiness ───────────────────────────────────────

const FIRST_SLICE_REQUIRED_SECTIONS = ['Minimal behavior', 'Entry point', 'Tied to product boundary'] as const;

function evaluateFirstVerticalSlice(
  profileId: string,
  selectedProfileId: string,
  sliceContent: string,
  legacyRun: boolean,
): ProfileValidationIssue[] {
  const issues: ProfileValidationIssue[] = [];
  const parsed = parseArtifact(sliceContent);

  let incomplete = false;
  for (const section of FIRST_SLICE_REQUIRED_SECTIONS) {
    const value = (parsed.sections.get(section) ?? '').trim();
    if (value.length === 0) {
      incomplete = true;
    }
  }

  const statusValue = (parsed.sections.get('Status') ?? '').split(/[\n\r]/)[0].trim().toLowerCase();
  if (statusValue !== 'complete') {
    incomplete = true;
  }

  if (incomplete) {
    issues.push({
      code: 'GF_FIRST_SLICE_INCOMPLETE',
      severity: 'error',
      profileId,
      affectedContract: 'first-vertical-slice.txt',
      reason: 'FirstVerticalSlice is missing required content or is not marked "complete".',
      correctiveAction: 'Provide Minimal behavior, Entry point, and Tied to product boundary content, and set Status: complete.',
      evidenceKey: 'first-vertical-slice.txt',
    });
  }

  const minimalBehavior = parsed.sections.get('Minimal behavior') ?? '';
  if (minimalBehavior.trim().length > 0 && isPlaceholderContent(minimalBehavior)) {
    issues.push({
      code: 'GF_FIRST_SLICE_BOILERPLATE',
      severity: 'error',
      profileId,
      affectedContract: 'first-vertical-slice.txt:Minimal behavior',
      reason: 'FirstVerticalSlice "Minimal behavior" content is placeholder-only or too short to be substantive.',
      correctiveAction: 'Describe the actual minimal behavior implemented, not a placeholder.',
      evidenceKey: 'first-vertical-slice.txt:Minimal behavior',
    });
  }

  if (!legacyRun) {
    const reportedProfileId = (parsed.sections.get('Profile') ?? '').trim();
    if (reportedProfileId.length > 0 && reportedProfileId !== selectedProfileId) {
      issues.push({
        code: 'GF_FIRST_SLICE_PROFILE_MISMATCH',
        severity: 'error',
        profileId,
        affectedContract: 'first-vertical-slice.txt:Profile',
        reason: `FirstVerticalSlice declares profile "${reportedProfileId}", which does not match the selected profile "${selectedProfileId}".`,
        correctiveAction: 'Regenerate the first vertical slice for the selected profile.',
        evidenceKey: 'first-vertical-slice.txt:Profile',
        expected: selectedProfileId,
        actual: reportedProfileId,
      });
    }
  }

  return issues;
}

// ─── Verification command evidence ────────────────────────────────────────

function evaluateCommandEvidence(
  profileId: string,
  validationCommands: readonly GreenfieldProfileCommand[],
  verificationReportContent: string | undefined,
): ProfileValidationIssue[] {
  const issues: ProfileValidationIssue[] = [];

  if (!verificationReportContent) {
    for (const command of validationCommands) {
      if (command.required) {
        issues.push(commandEvidenceMissingIssue(profileId, command, 'no VerificationReport was found'));
      }
    }
    return issues;
  }

  const parsed = parseArtifact(verificationReportContent);
  const evidence = parseCommandEvidenceSection(parsed.sections.get('Commands verified'));
  const evidenceByCommand = new Map<string, ReportedCommandEvidence>(evidence.map((e) => [e.command, e]));

  for (const command of validationCommands) {
    const entry = evidenceByCommand.get(command.command);

    if (command.required) {
      if (!entry) {
        if (mentionsUnsupportedPassClaim(verificationReportContent, command.command)) {
          issues.push(commandPassUnsupportedIssue(profileId, command));
        } else {
          issues.push(commandEvidenceMissingIssue(profileId, command, 'no recorded evidence for this command'));
        }
        continue;
      }
      if (entry.status !== 'passed') {
        issues.push(
          commandEvidenceMissingIssue(
            profileId,
            command,
            entry.status === 'failed' ? 'recorded evidence shows it failed' : 'a required command cannot be skipped',
          ),
        );
      }
      continue;
    }

    // Optional command.
    if (entry?.status === 'skipped' && !entry.reason) {
      issues.push({
        code: 'GF_OPTIONAL_SKIP_REASON_MISSING',
        severity: 'error',
        profileId,
        affectedContract: `validationCommands:${command.command}`,
        reason: `Optional command "${command.command}" was skipped without a nonblank reason.`,
        correctiveAction: `Record a reason for skipping "${command.command}" (e.g. matching its environmentNotes prerequisite).`,
        evidenceKey: command.command,
      });
    } else if (!entry && mentionsUnsupportedPassClaim(verificationReportContent, command.command)) {
      issues.push(commandPassUnsupportedIssue(profileId, command));
    }
  }

  return issues;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionsUnsupportedPassClaim(content: string, command: string): boolean {
  const re = new RegExp(`${escapeRegExp(command)}[^\\n]{0,40}(passed|success|succeeded)`, 'i');
  return re.test(content);
}

function commandEvidenceMissingIssue(
  profileId: string,
  command: GreenfieldProfileCommand,
  reason: string,
): ProfileValidationIssue {
  return {
    code: 'GF_COMMAND_EVIDENCE_MISSING',
    severity: 'error',
    profileId,
    affectedContract: `validationCommands:${command.command}`,
    reason: `Required command "${command.command}" has no recorded passing evidence (${reason}).`,
    correctiveAction: `Run "${command.command}" and record its outcome in the VerificationReport's "Commands verified" section.`,
    evidenceKey: command.command,
  };
}

function commandPassUnsupportedIssue(profileId: string, command: GreenfieldProfileCommand): ProfileValidationIssue {
  return {
    code: 'GF_COMMAND_PASS_UNSUPPORTED',
    severity: 'error',
    profileId,
    affectedContract: `validationCommands:${command.command}`,
    reason: `The verification report claims command "${command.command}" passed without a recorded "Commands verified" entry.`,
    correctiveAction: `Add a "- ${command.command}: passed" entry to "Commands verified", or remove the unsupported claim.`,
    evidenceKey: command.command,
  };
}

// ─── Shared issue builders ─────────────────────────────────────────────────

function scaffoldReportMissingIssue(profileId: string): ProfileValidationIssue {
  return {
    code: 'GF_SCAFFOLD_REPORT_MISSING',
    severity: 'error',
    profileId,
    affectedContract: 'scaffold-implementation-report.txt',
    reason: 'ScaffoldImplementationReport does not exist or is placeholder-only.',
    correctiveAction: 'Complete the scaffold-implementation stage and produce a substantive ScaffoldImplementationReport.',
    evidenceKey: 'scaffold-implementation-report.txt',
  };
}

function scaffoldReportStaleIssue(profileId: string): ProfileValidationIssue {
  return {
    code: 'GF_SCAFFOLD_REPORT_STALE',
    severity: 'error',
    profileId,
    affectedContract: 'scaffold-implementation-report.txt',
    reason: 'A required greenfield artifact is stale relative to its upstream dependency.',
    correctiveAction: 'Regenerate the artifact so it reflects its current upstream inputs.',
    evidenceKey: 'stale',
  };
}

function firstSliceMissingIssue(profileId: string): ProfileValidationIssue {
  return {
    code: 'GF_FIRST_SLICE_MISSING',
    severity: 'error',
    profileId,
    affectedContract: 'first-vertical-slice.txt',
    reason: 'FirstVerticalSlice does not exist or is placeholder-only.',
    correctiveAction: 'Complete the first-vertical-slice stage.',
    evidenceKey: 'first-vertical-slice.txt',
  };
}

function legacyEvidenceNotEvaluatedIssue(profileId: string): ProfileValidationIssue {
  return {
    code: 'GF_LEGACY_EVIDENCE_NOT_EVALUATED',
    severity: 'warning',
    profileId,
    affectedContract: 'scaffold-implementation-report.txt',
    reason: 'This run predates the v1.3.0 structured evidence sections; generated-target and command evidence were not evaluated.',
    correctiveAction: 'No action required for this legacy run; new runs use the current structured evidence template.',
    evidenceKey: 'legacy',
  };
}
