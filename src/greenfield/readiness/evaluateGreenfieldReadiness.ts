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
import { GreenfieldFullstackCapability } from '../fullstack/fullstackCapabilityTypes';
import { validateFullstackCapability } from '../fullstack/validateFullstackCapability';
import { composeEffectiveGreenfieldTargetExpectations } from '../scaffold/effectiveTargetExpectations';

export function evaluateGreenfieldReadiness(inputs: GreenfieldReadinessInputs): GreenfieldReadinessResult {
  const { profile, capability } = inputs;
  const profileId = profile.id;
  const issues: ProfileValidationIssue[] = [];

  issues.push(...validateGreenfieldProfile(profile).issues);

  // v1.3.1 Batch 5: structurally validate the resolved full-stack capability
  // itself (reuses Batch 3's validator; also defends against a malformed/
  // externally-edited bootstrap-bundle.json). No-op for every ordinary
  // non-full-stack run.
  if (capability) {
    issues.push(...validateFullstackCapability(capability).issues);
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

      const composedTargetExpectations = composeEffectiveGreenfieldTargetExpectations(profile, capability);

      const corroboration = evaluateGeneratedTargetEvidence(
        profileId,
        composedTargetExpectations,
        normalizedPaths,
        inputs.projectRoot,
      );
      issues.push(...corroboration.issues);
      filesystemCorroborationPerformed = corroboration.filesystemCorroborationPerformed;
    }
  }

  // v1.3.0 Batch 4 correction: scaffold-plan validation is gated on
  // !legacyRun (not on reportMissing), mirroring generated-target and
  // first-vertical-slice evidence -- a legacy run's plan predates the
  // structured "Profile"/"Target paths"/command sections this evaluator's
  // caller now reconstructs from, so it is left unevaluated, the same
  // compatibility treatment every other structured-evidence check already
  // gives a legacy run. A non-legacy run always validates its plan; when the
  // caller could not supply one (missing/unparseable scaffold-plan.txt),
  // validateGreenfieldScaffoldPlan() naturally reports it via its existing
  // "plan does not declare a profile id" branch of GF_PLAN_PROFILE_MISMATCH.
  if (!legacyRun && inputs.scaffoldPlan) {
    issues.push(...validateGreenfieldScaffoldPlan(profile, inputs.scaffoldPlan, { capability }).issues);
  }

  const sliceContent = inputs.firstVerticalSliceContent;
  const sliceMissing = !sliceContent || isPlaceholderContent(sliceContent);
  if (sliceMissing) {
    issues.push(firstSliceMissingIssue(profileId));
  } else {
    issues.push(...evaluateFirstVerticalSlice(profileId, profile.id, sliceContent, legacyRun, capability));
    if (inputs.firstVerticalSliceStale) {
      issues.push(scaffoldReportStaleIssue(profileId)); // shared stale code; affectedContract distinguishes the artifact
    }
  }

  // v1.3.1 Batch 5: capability validationCommands compose additively with
  // the profile's own, reusing the exact existing evidence check.
  const composedValidationCommands = capability
    ? [...profile.validationCommands, ...capability.validationCommands]
    : profile.validationCommands;
  issues.push(...evaluateCommandEvidence(profileId, composedValidationCommands, inputs.verificationReportContent));

  if (!legacyRun && capability) {
    // Batch 4 placed most required development/test lifecycle operations
    // (Docker readiness, database up/wait, Prisma generate, migrations,
    // test DB lifecycle) in the capability's own setupCommands, distinct
    // from validationCommands. Evidence is required for these the same way
    // -- reusing evaluateCommandEvidence with a distinct contract prefix so
    // issues are correctly labeled "setupCommands:<command>".
    issues.push(
      ...evaluateCommandEvidence(profileId, capability.setupCommands, inputs.verificationReportContent, 'setupCommands'),
    );
    issues.push(...evaluateProductionMigrationOrdering(profileId, capability, inputs.verificationReportContent));
  }

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

// v1.3.1 Batch 5: honest, bounded keyword check proving the described
// behavior at least names the full-stack boundary it must cross (Next.js ->
// canonical Prisma/database owner -> PostgreSQL -> observable result). This
// cannot prove the code actually does this (that is Batch 4's scaffold-plan
// contract plus generated-file/verification evidence, evaluated separately)
// -- it only rejects a slice description that never mentions the database
// boundary at all (e.g. "renders a static page").
const DATABASE_BACKED_SLICE_RE = /\b(prisma|postgres(ql)?|database|db)\b/i;

function evaluateFirstVerticalSlice(
  profileId: string,
  selectedProfileId: string,
  sliceContent: string,
  legacyRun: boolean,
  capability: GreenfieldFullstackCapability | undefined,
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

  if (!legacyRun && capability && minimalBehavior.trim().length > 0 && !DATABASE_BACKED_SLICE_RE.test(minimalBehavior)) {
    issues.push({
      code: 'GF_FULLSTACK_FIRST_SLICE_NOT_DATABASE_BACKED',
      severity: 'error',
      profileId,
      affectedContract: 'first-vertical-slice.txt:Minimal behavior',
      reason:
        'The resolved full-stack capability requires the first vertical slice to cross the application -> ' +
        'Prisma/database owner -> PostgreSQL boundary, but "Minimal behavior" does not mention the database.',
      correctiveAction:
        'Describe how the minimal behavior reaches the canonical Prisma database client and PostgreSQL, not ' +
        'only static page rendering.',
      evidenceKey: 'first-vertical-slice.txt:Minimal behavior',
    });
  }

  return issues;
}

// ─── Verification command evidence ────────────────────────────────────────

function evaluateCommandEvidence(
  profileId: string,
  validationCommands: readonly GreenfieldProfileCommand[],
  verificationReportContent: string | undefined,
  // v1.3.1 Batch 5: additive optional parameter, defaulting to the exact
  // pre-Batch-5 label so every existing call site (profile.validationCommands)
  // is unaffected. Passed as 'setupCommands' when this same function is
  // reused for the resolved capability's setupCommands.
  contractPrefix: string = 'validationCommands',
): ProfileValidationIssue[] {
  const issues: ProfileValidationIssue[] = [];

  if (!verificationReportContent) {
    for (const command of validationCommands) {
      if (command.required) {
        issues.push(commandEvidenceMissingIssue(profileId, command, 'no VerificationReport was found', contractPrefix));
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
          issues.push(commandPassUnsupportedIssue(profileId, command, contractPrefix));
        } else {
          issues.push(commandEvidenceMissingIssue(profileId, command, 'no recorded evidence for this command', contractPrefix));
        }
        continue;
      }
      if (entry.status !== 'passed') {
        issues.push(
          commandEvidenceMissingIssue(
            profileId,
            command,
            entry.status === 'failed' ? 'recorded evidence shows it failed' : 'a required command cannot be skipped',
            contractPrefix,
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
        affectedContract: `${contractPrefix}:${command.command}`,
        reason: `Optional command "${command.command}" was skipped without a nonblank reason.`,
        correctiveAction: `Record a reason for skipping "${command.command}" (e.g. matching its environmentNotes prerequisite).`,
        evidenceKey: command.command,
      });
    } else if (!entry && mentionsUnsupportedPassClaim(verificationReportContent, command.command)) {
      issues.push(commandPassUnsupportedIssue(profileId, command, contractPrefix));
    }
  }

  return issues;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionsUnsupportedPassClaim(content: string, command: string): boolean {
  // v1.3.1 Batch 5 correction: the negative lookahead `(?!:\S)` rejects a
  // match where `command` is immediately followed by ":" plus a non-space
  // character (e.g. "npm run dev" inside "npm run dev:db"), so one full-
  // stack command that is a literal text prefix of another (npm run dev /
  // npm run dev:db / npm run dev:db:wait / npm run dev:down) cannot produce
  // a false "unsupported pass claim" for the shorter command merely because
  // the longer, unrelated command's own passing evidence appears nearby. A
  // genuine free-text claim like "npm run dev: passed" (colon then space)
  // or "npm test passed" (no colon) is unaffected.
  const re = new RegExp(`${escapeRegExp(command)}(?!:\\S)[^\\n]{0,40}(passed|success|succeeded)`, 'i');
  return re.test(content);
}

function commandEvidenceMissingIssue(
  profileId: string,
  command: GreenfieldProfileCommand,
  reason: string,
  contractPrefix: string = 'validationCommands',
): ProfileValidationIssue {
  return {
    code: 'GF_COMMAND_EVIDENCE_MISSING',
    severity: 'error',
    profileId,
    affectedContract: `${contractPrefix}:${command.command}`,
    reason: `Required command "${command.command}" has no recorded passing evidence (${reason}).`,
    correctiveAction: `Run "${command.command}" and record its outcome in the VerificationReport's "Commands verified" section.`,
    evidenceKey: command.command,
  };
}

function commandPassUnsupportedIssue(
  profileId: string,
  command: GreenfieldProfileCommand,
  contractPrefix: string = 'validationCommands',
): ProfileValidationIssue {
  return {
    code: 'GF_COMMAND_PASS_UNSUPPORTED',
    severity: 'error',
    profileId,
    affectedContract: `${contractPrefix}:${command.command}`,
    reason: `The verification report claims command "${command.command}" passed without a recorded "Commands verified" entry.`,
    correctiveAction: `Add a "- ${command.command}: passed" entry to "Commands verified", or remove the unsupported claim.`,
    evidenceKey: command.command,
  };
}

// ─── v1.3.1 Batch 5: production migration ordering ─────────────────────────
//
// Preserves Batch 3's invariant (production migration deploy -> application
// traffic/readiness) using the one ordering signal the existing verification
// artifact format actually provides: the order "Commands verified" lines
// were reported in. This does not invent timestamps or a new ordering
// field -- it reads the same parsed array parseCommandEvidenceSection()
// already returns (list order, not a Map), which the artifact's own
// "one command per line, in the order reported" convention already
// represents. If the migration-deploy command is missing entirely, the
// existing evaluateCommandEvidence() check above already reports
// GF_COMMAND_EVIDENCE_MISSING; this check only fires when both commands
// have evidence, so it never duplicates that finding.

const PRODUCTION_MIGRATION_COMMAND = 'npm run db:migrate:deploy';
const PRODUCTION_READINESS_COMMANDS = ['npm run smoke:readiness', 'npm run smoke:liveness', 'docker compose -f compose.yaml up -d app'];

function evaluateProductionMigrationOrdering(
  profileId: string,
  capability: GreenfieldFullstackCapability,
  verificationReportContent: string | undefined,
): ProfileValidationIssue[] {
  if (!verificationReportContent) {
    return [];
  }
  const allCommands = [...capability.setupCommands, ...capability.validationCommands];
  if (!allCommands.some((c) => c.command === PRODUCTION_MIGRATION_COMMAND)) {
    return []; // this capability instance does not declare the command; nothing to order.
  }

  const parsed = parseArtifact(verificationReportContent);
  const evidence = parseCommandEvidenceSection(parsed.sections.get('Commands verified'));
  const migrationIndex = evidence.findIndex((e) => e.command === PRODUCTION_MIGRATION_COMMAND && e.status === 'passed');
  if (migrationIndex === -1) {
    return []; // no successful migration evidence at all; already reported by evaluateCommandEvidence.
  }

  const readinessIndex = evidence.findIndex(
    (e) => PRODUCTION_READINESS_COMMANDS.includes(e.command) && e.status === 'passed',
  );
  if (readinessIndex === -1) {
    return []; // no successful readiness/startup evidence reported yet; nothing to order against.
  }

  if (readinessIndex < migrationIndex) {
    return [
      {
        code: 'GF_FULLSTACK_MIGRATION_ORDER_VIOLATION',
        severity: 'error',
        profileId,
        affectedContract: 'validationCommands,setupCommands',
        reason:
          `Verification evidence reports "${evidence[readinessIndex].command}" (application startup/readiness) ` +
          `before "${PRODUCTION_MIGRATION_COMMAND}" (production migration), which violates the required ` +
          'pre-traffic migration ordering.',
        correctiveAction:
          `Report "${PRODUCTION_MIGRATION_COMMAND}" as passed before any application startup/readiness ` +
          'evidence in "Commands verified".',
        evidenceKey: 'production-migration-order',
      },
    ];
  }

  return [];
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
