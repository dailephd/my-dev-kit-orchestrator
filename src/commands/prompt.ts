import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { getMostRecentRun, loadRun, getRunFolder } from '../run';
import { generateStagePrompt } from '../promptGenerator';
import { getNextStage, isRunComplete, getMissingPriorArtifacts } from '../stageDetector';

export function makePromptCommand(): Command {
  const cmd = new Command('prompt');
  cmd
    .description('Print the next stage prompt for the active or selected run')
    .argument('[stage]', 'specific stage name in lowercase kebab-case (optional)')
    .option('--run <run-id>', 'select a specific workflow run by ID')
    .option('--root <path>', 'project root directory (default: current working directory)')
    .action((stage: string | undefined, options: { run?: string; root?: string }) => {
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
          console.error(`Error: could not load run: ${options.run}`);
          process.exit(1);
        }
      } else {
        meta = getMostRecentRun(projectRoot);
        if (!meta) {
          console.error('No runs found. Run: my-dev-kit-orchestrator start "<request>"');
          process.exit(1);
        }
      }

      if (stage) {
        const stageExists = meta.stages.some((s) => s.name === stage);
        if (!stageExists) {
          const available = meta.stages.map((s) => s.name).join(', ');
          console.error(`Error: stage "${stage}" does not exist in ${meta.mode} workflow.\nAvailable stages: ${available}`);
          process.exit(1);
        }

        const missingPrior = getMissingPriorArtifacts(meta, stage);
        if (missingPrior.length > 0) {
          console.error(
            `Warning: the following required prior artifacts are missing:\n` +
            missingPrior.map((f) => `  - ${f}`).join('\n') +
            `\n\nReturn to the stage that produces the missing artifact before continuing.\n` +
            `Next missing stage: ${getNextStage(meta)?.name ?? 'none'}`
          );
          process.exit(1);
        }

        try {
          const promptText = generateStagePrompt(meta, stage);
          process.stdout.write(promptText);
        } catch (err) {
          console.error(`Error generating prompt: ${(err as Error).message}`);
          process.exit(1);
        }
      } else {
        if (isRunComplete(meta)) {
          console.log(
            `Run ${meta.runId} is complete — all expected artifacts are present.\n\n` +
            `To view the final report:\n  ${path.join(meta.runFolder, 'artifacts/final-report.txt')}\n\n` +
            `To inspect run status:\n  my-dev-kit-orchestrator status`
          );
          return;
        }

        const nextStage = getNextStage(meta);
        if (!nextStage) {
          console.log('No missing stage artifact remains.');
          return;
        }

        try {
          const promptText = generateStagePrompt(meta, nextStage.name);
          process.stdout.write(promptText);
        } catch (err) {
          console.error(`Error generating prompt: ${(err as Error).message}`);
          process.exit(1);
        }
      }
    });
  return cmd;
}
