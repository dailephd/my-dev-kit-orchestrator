import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { getMostRecentRun, loadRun, getRunFolder } from '../run';
import {
  getArtifactStatuses,
  getSupportingReportStatuses,
  getArtifactLifecycleStatusesWithRunIntegrity,
  getNextStageWithRunIntegrity,
  ArtifactLifecycleStatus,
} from '../stageDetector';
import { readArtifactStateFile } from '../artifactLifecycle';
import { readCheckResults } from '../promptChecker';
import { readTraceCheckResults } from '../traceChecker';
import { evaluateRunContextReadiness } from '../instructions/runContextReadiness';
import { deriveRunIntegrityGateResult } from '../runIntegrityGate';
import { evaluateJudgeIntegrity, evaluateFinalReportEligibility } from '../judgeIntegrity';
import { checkGreenfieldRunReadiness } from '../greenfield/readiness/checkGreenfieldRunReadiness';

function lifecycleLabel(status: ArtifactLifecycleStatus): string[] {
  const label = `  [${status.lifecycleState.padEnd(10)}] ${status.artifactFile}`;
  if (status.reason) {
    return [label, `                Reason: ${status.reason}`];
  }
  return [label];
}

export function makeStatusCommand(): Command {
  const cmd = new Command('status');
  cmd
    .description('Show the current or selected workflow run status')
    .option('--run <run-id>', 'select a specific workflow run by ID')
    .option('--root <path>', 'project root directory (default: current working directory)')
    .action((options: { run?: string; root?: string }) => {
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
          console.log('No runs found.\n\nNext:\n  my-dev-kit-orchestrator start "<software change request>"');
          return;
        }
      }

      const stateFile = readArtifactStateFile(meta.runFolder);
      // Canonical run-integrity gate (v1.2.3 Batch 2): computed once, up
      // front, from the same readiness evaluation rendered in the
      // "Repository context readiness" section below, so the artifact list
      // and "Current / next stage" line can never contradict it (invariant
      // 6.5 -- avoid duplicate contradictory readiness sections).
      const readiness = evaluateRunContextReadiness({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        currentStage: meta.currentStage,
        projectRoot: meta.projectRoot,
      });
      const gate = deriveRunIntegrityGateResult(meta.mode, readiness);
      // Canonical judge-integrity / final-report eligibility (v1.2.3
      // Batch 3): computed once here, reused for the artifact list,
      // current/next stage, and the single "Judge and final-report
      // integrity" section below -- never a second, contradictory summary
      // (invariant 11.1).
      const judgeIntegrity = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
      const finalReportEligibility = evaluateFinalReportEligibility({
        gate,
        judgeIntegrity,
        runFolder: meta.runFolder,
        stages: meta.stages,
        stateFile,
        proofOnly: meta.proofOnly === true,
        verificationResponsibility: meta.verificationResponsibility,
      });
      const lifecycleStatuses = getArtifactLifecycleStatusesWithRunIntegrity(meta, stateFile, gate, finalReportEligibility.eligible);
      const legacyStatuses = getArtifactStatuses(meta);
      const nextStage = getNextStageWithRunIntegrity(meta, stateFile, gate, finalReportEligibility.eligible);
      const presentArtifacts = legacyStatuses.filter((s) => s.present);
      const nonCompleteArtifacts = lifecycleStatuses.filter((s) => s.lifecycleState !== 'complete');
      const supportingReports = getSupportingReportStatuses(meta);

      const lines: string[] = [
        `Run:`,
        `  ${meta.runId}`,
        ``,
        `Mode:`,
        `  ${meta.mode}`,
        ``,
        `Request:`,
        `  ${meta.request}`,
        ``,
        ...(meta.proofOnly ? [`Proof-only:`, `  active`, `Verification responsibility:`, `  ${meta.verificationResponsibility}`, ``] : []),
        `Run folder:`,
        `  ${meta.runFolder}`,
        ``,
        ...(meta.sourceRepoRoot ? [`Source repository:`, `  ${meta.sourceRepoRoot}`, ``] : []),
        ...(meta.targetRepoRoot ? [`Target repository:`, `  ${meta.targetRepoRoot}`, ``] : []),
        `Current / next stage:`,
        `  ${nextStage ? nextStage.name : '(complete)'}`,
        ``,
        `Available prompts:`,
        ...meta.stages.map((s) => `  - ${s.name}`),
        ``,
        `Artifacts:`,
        ...lifecycleStatuses.flatMap(lifecycleLabel),
        ``,
        `Present artifacts: ${presentArtifacts.length}/${legacyStatuses.length}`,
        `Non-complete artifacts: ${nonCompleteArtifacts.length}`,
        ``,
        `Supporting reports:`,
        ...(supportingReports.length > 0
          ? supportingReports.map((r) => `  ${r.present ? '[present]' : '[missing]'} ${r.reportFile}`)
          : [`  (none for this workflow mode)`]),
        ``,
      ];

      // Content check summary
      const checkResults = readCheckResults(meta.runFolder);
      if (checkResults) {
        const aResults = checkResults.artifactResults;
        const pResults = checkResults.promptResults;
        const allResults = [...aResults, ...pResults];
        const pass = allResults.filter((r) => r.passed && !r.issues.some((i) => i.severity === 'warn')).length;
        const warn = allResults.filter((r) => r.passed && r.issues.some((i) => i.severity === 'warn')).length;
        const fail = allResults.filter((r) => !r.passed).length;
        lines.push(`Content check: ${pass} pass, ${warn} warn, ${fail} fail  (run: my-dev-kit-orchestrator check)`);
      } else {
        lines.push(`Content check: not run  (run: my-dev-kit-orchestrator check)`);
      }
      lines.push(``);

      // Trace check summary
      const traceResults = readTraceCheckResults(meta.runFolder);
      if (traceResults) {
        const tr = traceResults.traceResults;
        const pass = tr.filter((r) => r.passed && !r.issues.some((i) => i.severity === 'warn')).length;
        const warn = tr.filter((r) => r.passed && r.issues.some((i) => i.severity === 'warn')).length;
        const fail = tr.filter((r) => !r.passed).length;
        lines.push(`Trace check: ${pass} pass, ${warn} warn, ${fail} fail  (run: my-dev-kit-orchestrator check --trace)`);
      } else {
        lines.push(`Trace check: not run  (run: my-dev-kit-orchestrator check --trace)`);
      }
      lines.push(``);

      // Judge and final-report integrity (v1.2.3 Batch 3, invariant 11.1):
      // one coherent section covering expected verdict, authored verdict
      // (or parse state), acceptance, correction state, and final-report
      // eligibility -- never split across sections that could disagree.
      if (judgeIntegrity.judgeArtifactPresent) {
        lines.push(`Judge and final-report integrity:`);
        lines.push(`  Expected judge verdict: ${judgeIntegrity.expectedJudgeVerdict}`);
        if (judgeIntegrity.judgeVerdictParseStatus === 'parsed') {
          lines.push(`  Authored judge verdict: ${judgeIntegrity.authoredJudgeVerdict}`);
          lines.push(`  Verdict accepted: ${judgeIntegrity.judgeVerdictAccepted}`);
          if (!judgeIntegrity.judgeVerdictAccepted && judgeIntegrity.primaryReason) {
            lines.push(`  Mismatch reason: ${judgeIntegrity.primaryReason}`);
          }
          if (judgeIntegrity.correctionBlocked) {
            lines.push(`  Judge correction: ${judgeIntegrity.authoredJudgeVerdict} - run is blocked`);
            lines.push(`  This run requires external resolution before it can continue.`);
          } else if (judgeIntegrity.correctionRequired) {
            lines.push(`  Judge correction: correction required`);
            lines.push(`  Routed stage: ${judgeIntegrity.acceptedCorrectionStage}`);
          } else if (judgeIntegrity.judgeVerdictAccepted && judgeIntegrity.authoredJudgeVerdict === 'PASS') {
            lines.push(`  Judge correction: PASS - no correction required`);
          }
        } else if (judgeIntegrity.judgeVerdictParseStatus === 'unknown-verdict') {
          lines.push(`  Verdict accepted: false`);
          lines.push(`  Unrecognized verdict in judge-report.txt`);
          if (judgeIntegrity.primaryReason) lines.push(`  Reason: ${judgeIntegrity.primaryReason}`);
        } else if (judgeIntegrity.judgeVerdictParseStatus === 'missing-verdict') {
          lines.push(`  Verdict accepted: false`);
          lines.push(`  No verdict found in judge-report.txt`);
        }
        lines.push(`  Final-report eligible: ${finalReportEligibility.eligible}`);
        if (!finalReportEligibility.eligible && finalReportEligibility.blockingCodes.length > 0) {
          lines.push(`  Final-report blocking codes: ${finalReportEligibility.blockingCodes.join(', ')}`);
        }
        lines.push(``);
      }

      // Repository context readiness (Batch 5). Read-only, and reuses the
      // same `readiness` evaluated above for the canonical gate -- never
      // recomputed a second time, never written back, never triggers
      // my-dev-kit.
      if (readiness.overallDecision === 'not-required') {
        lines.push(`Repository context: not required`);
      } else {
        lines.push(`Repository context readiness: ${readiness.overallDecision}`);
        if (readiness.implementationContext) {
          lines.push(
            `  Implementation context: ${readiness.implementationContext.decision} (${readiness.implementationContext.classification}, freshness: ${readiness.implementationContext.evaluatedFreshness}, adequacy: ${readiness.implementationContext.evaluatedAdequacy})`,
          );
          if (readiness.implementationContext.blockerSummary) {
            const blocker = readiness.implementationContext.blockerSummary;
            lines.push(`    Primary blocker: ${blocker.primaryCode}`);
            lines.push(`    Reason: ${blocker.primaryReason}`);
            lines.push(`    Blocking: ${blocker.blockingIssueCodes.join(', ')}`);
            lines.push(`    Corrective action: ${blocker.correctiveAction}`);
            lines.push(`    Evidence target: ${blocker.evidenceTarget}`);
          }
        }
        if (readiness.testContext) {
          lines.push(
            `  Test context: ${readiness.testContext.decision} (${readiness.testContext.classification}, freshness: ${readiness.testContext.evaluatedFreshness}, adequacy: ${readiness.testContext.evaluatedAdequacy})`,
          );
          if (readiness.testContext.criticalResponsibilitySummary) {
            const s = readiness.testContext.criticalResponsibilitySummary;
            lines.push(`    Critical responsibility mapping: ${s.criticalMapped}/${s.criticalResponsibilities} fully mapped`);
          }
          if (readiness.testContext.blockerSummary) {
            const blocker = readiness.testContext.blockerSummary;
            lines.push(`    Primary blocker: ${blocker.primaryCode}`);
            lines.push(`    Reason: ${blocker.primaryReason}`);
            lines.push(`    Blocking: ${blocker.blockingIssueCodes.join(', ')}`);
            lines.push(`    Corrective action: ${blocker.correctiveAction}`);
            lines.push(`    Evidence target: ${blocker.evidenceTarget}`);
          }
        }
        if (readiness.overallDecision === 'refresh-required' && readiness.recommendedNextStage) {
          lines.push(`  Recommended next stage: ${readiness.recommendedNextStage}`);
        }
      }
      lines.push(``);

      // v1.3.0 Batch 4: greenfield readiness (section 9.1). Read-only;
      // no-op for non-greenfield runs and for a greenfield run with no
      // profile selected yet.
      const greenfieldReadiness = checkGreenfieldRunReadiness(meta);
      if (greenfieldReadiness) {
        const state = greenfieldReadiness.legacyRun
          ? 'legacy-compatible'
          : greenfieldReadiness.ready
            ? 'ready'
            : greenfieldReadiness.valid
              ? 'incomplete'
              : 'invalid';
        lines.push(`Greenfield readiness: ${state}`);
        lines.push(
          `  Filesystem corroboration: ${greenfieldReadiness.filesystemCorroborationPerformed ? 'performed' : 'not performed'}`,
        );
        const errorCount = greenfieldReadiness.issues.filter((i) => i.severity === 'error').length;
        const warningCount = greenfieldReadiness.issues.filter((i) => i.severity === 'warning').length;
        lines.push(`  Issues: ${errorCount} error(s), ${warningCount} warning(s)  (run: my-dev-kit-orchestrator check)`);
        lines.push(``);
      }

      if (nextStage) {
        lines.push(`Next:`);
        lines.push(`  my-dev-kit-orchestrator prompt`);
      } else {
        lines.push(`Status: All artifacts complete.`);
        lines.push(`  my-dev-kit-orchestrator prompt final-report`);
      }

      console.log(lines.join('\n'));
    });
  return cmd;
}

