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
