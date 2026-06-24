import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { getMostRecentRun, loadRun, getRunFolder } from '../run';
import {
  getArtifactStatuses,
  getSupportingReportStatuses,
  getArtifactLifecycleStatuses,
  getNextStageWithLifecycle,
  ArtifactLifecycleStatus,
} from '../stageDetector';
import { readArtifactStateFile } from '../artifactLifecycle';
import { readCheckResults } from '../promptChecker';
import { readTraceCheckResults } from '../traceChecker';
import { readCorrectionState } from '../correctionState';

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
      const lifecycleStatuses = getArtifactLifecycleStatuses(meta, stateFile);
      const legacyStatuses = getArtifactStatuses(meta);
      const nextStage = getNextStageWithLifecycle(meta, stateFile);
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

      // Judge correction routing summary
      const correctionState = readCorrectionState(meta.runFolder);
      if (correctionState) {
        if (correctionState.routeStatus === 'pass') {
          lines.push(`Judge correction: PASS - no correction required`);
        } else if (correctionState.routeStatus === 'correction_required') {
          lines.push(`Judge correction: ${correctionState.verdict} → correction required`);
          lines.push(`  Routed stage: ${correctionState.routedStage}`);
          if (correctionState.warnings.length > 0) {
            lines.push(`  Warning: ${correctionState.warnings[0]}`);
          }
        } else if (correctionState.routeStatus === 'blocked') {
          lines.push(`Judge correction: ${correctionState.verdict} - run is blocked`);
          lines.push(`  This run requires external resolution before it can continue.`);
        } else if (correctionState.routeStatus === 'unknown_verdict') {
          lines.push(`Judge correction: unrecognized verdict in judge-report.txt`);
          if (correctionState.errors.length > 0) {
            lines.push(`  Error: ${correctionState.errors[0]}`);
          }
        } else if (correctionState.routeStatus === 'missing_verdict') {
          lines.push(`Judge correction: no verdict found in judge-report.txt`);
        }
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

