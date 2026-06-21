import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { getMostRecentRun, loadRun, getRunFolder } from '../run';
import { getArtifactStatuses, getNextStage, getSupportingReportStatuses } from '../stageDetector';

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

      const statuses = getArtifactStatuses(meta);
      const nextStage = getNextStage(meta);
      const presentArtifacts = statuses.filter((s) => s.present);
      const missingArtifacts = statuses.filter((s) => !s.present);
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
        `Current / next stage:`,
        `  ${nextStage ? nextStage.name : '(complete)'}`,
        ``,
        `Available prompts:`,
        ...meta.stages.map((s) => `  - ${s.name}`),
        ``,
        `Artifacts:`,
        ...statuses.map((s) => `  ${s.present ? '[present]' : '[missing]'} ${s.artifactFile}`),
        ``,
        `Present artifacts: ${presentArtifacts.length}/${statuses.length}`,
        `Missing artifacts: ${missingArtifacts.length}`,
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
        lines.push(`Status: All artifacts present.`);
        lines.push(`  my-dev-kit-orchestrator prompt final-report`);
      }

      console.log(lines.join('\n'));
    });
  return cmd;
}
