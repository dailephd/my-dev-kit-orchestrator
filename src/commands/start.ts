import { Command } from 'commander';
import * as path from 'path';
import { VALID_MODES, isValidMode } from '../types';
import { createRun } from '../run';
import { initWorkspace } from '../workspace';

export function makeStartCommand(): Command {
  const cmd = new Command('start');
  cmd
    .description('Start a new workflow run')
    .argument('<request>', 'the software change request or description')
    .option('--mode <mode>', `workflow mode (${VALID_MODES.join(' | ')})`, 'feature')
    .option('--root <path>', 'project root directory (default: current working directory)')
    .option('--name <run-name>', 'readable name to include in the run ID')
    .option('--output-dir <path>', 'custom run output directory')
    .action((request: string, options: { mode: string; root?: string; name?: string; outputDir?: string }) => {
      if (!isValidMode(options.mode)) {
        console.error(`Error: invalid mode "${options.mode}". Allowed values: ${VALID_MODES.join(', ')}`);
        process.exit(1);
      }

      const projectRoot = path.resolve(options.root ?? process.cwd());
      initWorkspace(projectRoot);

      try {
        const meta = createRun({
          request,
          mode: options.mode,
          projectRoot,
          name: options.name,
          outputDir: options.outputDir ? path.resolve(options.outputDir) : undefined,
        });

        console.log(
          `Created workflow run:\n${meta.runFolder}\n\nMode:\n${meta.mode}\n\nNext:\n  my-dev-kit-orchestrator prompt`
        );
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
  return cmd;
}
