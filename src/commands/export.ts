import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { getMostRecentRun, loadRun, getRunFolder } from '../run';
import { readTraceCheckResults } from '../traceChecker';
import { readCheckResults } from '../promptChecker';
import { evaluateRunContextReadiness } from '../instructions/runContextReadiness';
import { evaluateRunIntegrityGate } from '../runIntegrityGate';
import { evaluateJudgeIntegrity, evaluateFinalReportEligibility, JudgeIntegrityResult } from '../judgeIntegrity';
import { readArtifactStateFile } from '../artifactLifecycle';
import { StageDefinition } from '../workflows';
import type { WorkflowMode } from '../types';

// ─── Path safety ──────────────────────────────────────────────────────────────

function isSafePath(rawInput: string, resolved: string): { safe: boolean; reason?: string } {
  // Refuse path traversal sequences in the raw, pre-resolution argument.
  // path.resolve() normalizes away ".." segments, so this must run against
  // the raw CLI input, not the already-resolved path -- checking the
  // resolved path here would always miss traversal attempts, since a
  // resolved absolute path never contains ".." segments by construction.
  // A plain substring check works identically regardless of OS path
  // separator convention ("/" or "\"), so no separator-specific parsing is
  // needed for this check to work cross-platform.
  if (rawInput.includes('..')) {
    return { safe: false, reason: 'output path contains path traversal (..)' };
  }

  // Refuse if the resolved path is a directory
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    return { safe: false, reason: 'output path is a directory' };
  }

  // Refuse if the resolved path is a symbolic link
  try {
    const lstat = fs.lstatSync(resolved);
    if (lstat.isSymbolicLink()) {
      return { safe: false, reason: 'output path is a symbolic link' };
    }
  } catch {
    // File does not exist -- that is fine
  }

  return { safe: true };
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function sectionHeader(title: string): string {
  return `\n=== ${title} ===\n`;
}

function artifactChecklist(
  runFolder: string,
  stages: Array<{ name: string; artifactFile: string }>,
): string {
  const lines: string[] = [];
  for (const stage of stages) {
    const fullPath = path.join(runFolder, stage.artifactFile);
    const exists = fs.existsSync(fullPath);
    const marker = exists ? '[present]' : '[missing]';
    lines.push(`  ${marker} ${stage.artifactFile} (${stage.name})`);
  }
  return lines.join('\n');
}

// v1.2.3 Batch 4: reports the *accepted* judge-integrity state (Batch 3),
// never the raw authored text alone -- otherwise export could claim
// "PASS -- no correction required" for a run status/check correctly reject
// as NEED_CONTEXT, the exact cross-surface disagreement AGENTS.txt Batch 4
// section 10 forbids. See tests/v123Batch4NegativeMatrix.test.ts.
function formatCorrectionState(judgeIntegrity: JudgeIntegrityResult): string {
  if (!judgeIntegrity.judgeArtifactPresent) return '  no judge report';
  if (judgeIntegrity.judgeVerdictParseStatus !== 'parsed') {
    return `  judge verdict ${judgeIntegrity.judgeVerdictParseStatus.replace('-', ' ')}`;
  }
  if (judgeIntegrity.correctionBlocked) {
    return `  ${judgeIntegrity.authoredJudgeVerdict} -- run is blocked (external resolution required)`;
  }
  if (judgeIntegrity.correctionRequired) {
    return `  ${judgeIntegrity.authoredJudgeVerdict} -> correction required (routed stage: ${judgeIntegrity.acceptedCorrectionStage})`;
  }
  if (judgeIntegrity.judgeVerdictAccepted && judgeIntegrity.authoredJudgeVerdict === 'PASS') {
    return '  PASS -- no correction required';
  }
  // Authored PASS rejected because it contradicts the canonical expected
  // verdict (Batch 3 section 6.2) -- never reported as accepted.
  return `  ${judgeIntegrity.authoredJudgeVerdict} -- rejected (expected ${judgeIntegrity.expectedJudgeVerdict}: ${judgeIntegrity.primaryReason ?? 'does not match canonical expected verdict'})`;
}

function readJudgeVerdict(judgeIntegrity: JudgeIntegrityResult): string {
  if (!judgeIntegrity.judgeArtifactPresent) return '  no judge report';
  if (judgeIntegrity.judgeVerdictParseStatus !== 'parsed') {
    return `  judge report present but verdict not parsed (${judgeIntegrity.judgeVerdictParseStatus})`;
  }
  return `  ${judgeIntegrity.authoredJudgeVerdict} (accepted: ${judgeIntegrity.judgeVerdictAccepted})`;
}

function readVerificationEvidence(runFolder: string): string {
  const p = path.join(runFolder, 'artifacts', 'verification-report.txt');
  if (!fs.existsSync(p)) return '  no verification report';
  const content = fs.readFileSync(p, 'utf8');
  const lines = content.split('\n');
  // Extract up to 20 lines of evidence summary (first non-empty lines)
  const evidence = lines.filter((l) => l.trim()).slice(0, 20);
  if (evidence.length === 0) return '  verification report is empty';
  return evidence.map((l) => `  ${l}`).join('\n');
}

function formatTraceCheckSummary(runFolder: string): string {
  const results = readTraceCheckResults(runFolder);
  if (!results) return '  trace check not run';
  const tr = results.traceResults;
  const pass = tr.filter((r) => r.passed && !r.issues.some((i) => i.severity === 'warn')).length;
  const warn = tr.filter((r) => r.passed && r.issues.some((i) => i.severity === 'warn')).length;
  const fail = tr.filter((r) => !r.passed).length;
  return `  trace: ${pass} pass, ${fail} fail, ${warn} warn (checked: ${results.checkedAt})`;
}

function formatCheckResultsSummary(runFolder: string): string {
  const results = readCheckResults(runFolder);
  if (!results) return '  content check not run';
  const ar = results.artifactResults;
  const aPass = ar.filter((r) => r.passed && !r.issues.some((i) => i.severity === 'warn')).length;
  const aWarn = ar.filter((r) => r.passed && r.issues.some((i) => i.severity === 'warn')).length;
  const aFail = ar.filter((r) => !r.passed).length;
  return `  content check: ${aPass} pass, ${aFail} fail, ${aWarn} warn (checked: ${results.checkedAt})`;
}

function listMissingArtifacts(
  runFolder: string,
  stages: Array<{ name: string; artifactFile: string }>,
): string {
  const missing = stages.filter(
    (s) => !fs.existsSync(path.join(runFolder, s.artifactFile)),
  );
  if (missing.length === 0) return '  none';
  return missing.map((s) => `  missing: ${s.artifactFile} (${s.name})`).join('\n');
}

// Batch 5 section 21: structured, deterministic (aside from re-reading
// current disk state) repository-context readiness summary. Metadata and
// readiness only -- never embeds raw supplemental packet/report/capsule/
// audit text, and never copies an externally referenced file.
function formatContextReadinessSummary(meta: {
  mode: string;
  runFolder: string;
  projectRoot?: string;
  stages: Array<{ name: string }>;
  currentStage?: string;
}): string {
  const summary = evaluateRunContextReadiness({
    mode: meta.mode,
    runFolder: meta.runFolder,
    workflowStageNames: meta.stages.map((s) => s.name),
    currentStage: meta.currentStage,
    projectRoot: meta.projectRoot,
  });

  const lines: string[] = [
    `  schemaVersion: 1.0.0`,
    `  mode: ${summary.mode}`,
    `  overallDecision: ${summary.overallDecision}`,
    `  recommendedNextStage: ${summary.recommendedNextStage ?? '(none)'}`,
  ];

  for (const [label, result] of [
    ['implementationContext', summary.implementationContext],
    ['testContext', summary.testContext],
  ] as const) {
    if (!result) continue;
    lines.push(`  ${label}:`);
    lines.push(`    decision: ${result.decision}`);
    lines.push(`    classification: ${result.classification}`);
    lines.push(`    packetPath: ${result.packetPath}`);
    lines.push(`    reportPath: ${result.reportPath}`);
    lines.push(`    evaluatedFreshness: ${result.evaluatedFreshness}`);
    lines.push(`    evaluatedAdequacy: ${result.evaluatedAdequacy}`);
    lines.push(`    readyWithAssumptions: ${result.readyWithAssumptions}`);
    if (result.blockerSummary) {
      lines.push(`    primaryCode: ${result.blockerSummary.primaryCode}`);
      lines.push(`    primaryReason: ${result.blockerSummary.primaryReason}`);
      lines.push(`    correctiveAction: ${result.blockerSummary.correctiveAction}`);
      lines.push(`    evidenceTarget: ${result.blockerSummary.evidenceTarget}`);
      lines.push(`    blockingIssueCodes: ${result.blockerSummary.blockingIssueCodes.join(', ')}`);
    }
  }

  if (summary.primaryBlocker) {
    lines.push(`  primaryContextKind: ${summary.primaryBlocker.contextKind}`);
    lines.push(`  primaryCode: ${summary.primaryBlocker.primaryCode}`);
    lines.push(`  primaryReason: ${summary.primaryBlocker.primaryReason}`);
    lines.push(`  correctiveAction: ${summary.primaryBlocker.correctiveAction}`);
    lines.push(`  evidenceTarget: ${summary.primaryBlocker.evidenceTarget}`);
  }
  lines.push(`  blockingIssueCodes: ${summary.blockingIssueCodes.length > 0 ? summary.blockingIssueCodes.join(', ') : '(none)'}`);
  lines.push(`  warnings: ${summary.warnings.length > 0 ? summary.warnings.join('; ') : '(none)'}`);
  lines.push(`  affectedStages: ${summary.affectedStages.length > 0 ? summary.affectedStages.join(', ') : '(none)'}`);

  return lines.join('\n');
}

function formatNextCommand(
  meta: {
    runId: string;
    mode: WorkflowMode;
    currentStage: string;
    runFolder: string;
  },
  judgeIntegrity: JudgeIntegrityResult,
): string {
  if (judgeIntegrity.correctionRequired) {
    return `  my-dev-kit-orchestrator prompt --run ${meta.runId}  # correction: ${judgeIntegrity.acceptedCorrectionStage}`;
  }
  if (judgeIntegrity.correctionBlocked) {
    return `  # run is blocked -- resolve externally, then: my-dev-kit-orchestrator status --run ${meta.runId}`;
  }
  return `  my-dev-kit-orchestrator prompt --run ${meta.runId}`;
}

// ─── Export format builder ────────────────────────────────────────────────────

export function buildExportText(meta: {
  runId: string;
  mode: WorkflowMode;
  request: string;
  currentStage: string;
  status: string;
  createdAt: string;
  runFolder: string;
  projectRoot?: string;
  stages: Array<{ name: string; artifactFile: string }>;
  proofOnly?: boolean;
  verificationResponsibility?: string;
}): string {
  const parts: string[] = [];

  // Canonical judge-integrity state (v1.2.3 Batch 4), computed once and
  // reused for every section below so export cannot disagree with
  // status/check on whether a verdict was actually accepted.
  const gate = evaluateRunIntegrityGate({
    mode: meta.mode,
    runFolder: meta.runFolder,
    workflowStageNames: meta.stages.map((s) => s.name),
    currentStage: meta.currentStage,
    projectRoot: meta.projectRoot,
  });
  const judgeIntegrity = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
  const finalEligibility = evaluateFinalReportEligibility({
    gate, judgeIntegrity, runFolder: meta.runFolder, stages: meta.stages as StageDefinition[],
    stateFile: readArtifactStateFile(meta.runFolder),
    proofOnly: meta.proofOnly === true, verificationResponsibility: meta.verificationResponsibility,
  });

  parts.push('my-dev-kit-orchestrator run handoff export');
  parts.push(`Generated: ${new Date().toISOString()}`);

  parts.push(sectionHeader('Run identity'));
  parts.push(`  Run ID:       ${meta.runId}`);
  parts.push(`  Mode:         ${meta.mode}`);
  parts.push(`  Status:       ${meta.status}`);
  parts.push(`  Created:      ${meta.createdAt}`);
  parts.push(`  Current stage: ${meta.currentStage}`);
  parts.push(`  Run folder:   ${meta.runFolder}`);
  if (meta.proofOnly) {
    parts.push(`  Proof-only:  active`);
    parts.push(`  Verification responsibility: ${meta.verificationResponsibility}`);
    parts.push(`  Proof evidence: ${finalEligibility.proofEvidence?.state ?? 'invalid'}`);
  }

  parts.push(sectionHeader('Request'));
  parts.push(`  ${meta.request}`);

  parts.push(sectionHeader('Artifact checklist'));
  parts.push(artifactChecklist(meta.runFolder, meta.stages));

  parts.push(sectionHeader('Missing artifacts'));
  parts.push(listMissingArtifacts(meta.runFolder, meta.stages));

  parts.push(sectionHeader('Judge verdict'));
  parts.push(readJudgeVerdict(judgeIntegrity));

  parts.push(sectionHeader('Correction state'));
  parts.push(formatCorrectionState(judgeIntegrity));

  parts.push(sectionHeader('Verification evidence'));
  parts.push(readVerificationEvidence(meta.runFolder));

  parts.push(sectionHeader('Check summaries'));
  parts.push(formatCheckResultsSummary(meta.runFolder));
  parts.push(formatTraceCheckSummary(meta.runFolder));

  parts.push(sectionHeader('Repository context readiness'));
  parts.push(formatContextReadinessSummary(meta));

  parts.push(sectionHeader('Next command'));
  parts.push(formatNextCommand(meta, judgeIntegrity));

  parts.push('');
  return parts.join('\n');
}

// ─── Command ──────────────────────────────────────────────────────────────────

export function makeExportCommand(): Command {
  const cmd = new Command('export');
  cmd
    .description('Export a portable plain-text run handoff for use in another session or agent')
    .option('--run <run-id>', 'select a specific workflow run by ID')
    .option('--root <path>', 'project root directory (default: current working directory)')
    .option('--out <file>', 'write export to this file (default: print to stdout)')
    .option(
      '--overwrite',
      'allow overwriting an existing output file (default: refuse if file exists)',
    )
    .action(
      (options: {
        run?: string;
        root?: string;
        out?: string;
        overwrite?: boolean;
      }) => {
        const projectRoot = path.resolve(options.root ?? process.cwd());

        let meta;
        if (options.run) {
          const runFolder = getRunFolder(projectRoot, options.run);
          if (!fs.existsSync(runFolder)) {
            console.error(`Error: run not found: ${options.run}`);
            process.exit(1);
          }
          try {
            meta = loadRun(runFolder);
          } catch {
            console.error(`Error: could not load run.json for: ${options.run}`);
            process.exit(1);
          }
        } else {
          meta = getMostRecentRun(projectRoot);
          if (!meta) {
            console.log(
              'No runs found.\n\nNext:\n  my-dev-kit-orchestrator start "<software change request>"',
            );
            return;
          }
        }

        const exportText = buildExportText(meta);

        if (!options.out) {
          process.stdout.write(exportText);
          return;
        }

        const outPath = path.resolve(options.out);

        // Path safety checks (must inspect the raw --out argument, not just the resolved path)
        const safety = isSafePath(options.out, outPath);
        if (!safety.safe) {
          console.error(`Error: output path rejected: ${safety.reason}`);
          process.exit(1);
        }

        // Refuse to overwrite unless --overwrite is set
        if (fs.existsSync(outPath) && !options.overwrite) {
          console.error(
            `Error: output file already exists: ${outPath}\n` +
              `Use --overwrite to replace it.`,
          );
          process.exit(1);
        }

        // Ensure parent directory exists
        const outDir = path.dirname(outPath);
        if (!fs.existsSync(outDir)) {
          console.error(`Error: output directory does not exist: ${outDir}`);
          process.exit(1);
        }

        fs.writeFileSync(outPath, exportText, 'utf8');
        console.log(`Export written to: ${outPath}`);
      },
    );
  return cmd;
}
