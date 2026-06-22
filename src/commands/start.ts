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
    .option('--source <path>', 'source repository root (required for extraction mode)')
    .option('--target <path>', 'target repository root (required for extraction mode)')
    .action((request: string, options: { mode: string; root?: string; name?: string; outputDir?: string; source?: string; target?: string }) => {
      if (!isValidMode(options.mode)) {
        console.error(`Error: invalid mode "${options.mode}". Allowed values: ${VALID_MODES.join(', ')}`);
        process.exit(1);
      }

      if (options.mode === 'extraction') {
        if (!options.source) {
          console.error('Error: --source <path> is required for extraction mode');
          process.exit(1);
        }
        if (!options.target) {
          console.error('Error: --target <path> is required for extraction mode');
          process.exit(1);
        }
      }

      const sourceRepoRoot = options.source ? path.resolve(options.source) : undefined;
      const targetRepoRoot = options.target ? path.resolve(options.target) : undefined;

      // For extraction mode, run artifacts live under the target repository
      const projectRoot = targetRepoRoot ?? path.resolve(options.root ?? process.cwd());
      initWorkspace(projectRoot);

      try {
        const meta = createRun({
          request,
          mode: options.mode,
          projectRoot,
          name: options.name,
          outputDir: options.outputDir ? path.resolve(options.outputDir) : undefined,
          sourceRepoRoot,
          targetRepoRoot,
        });

        const lines = [`Created workflow run:\n${meta.runFolder}\n\nMode:\n${meta.mode}`];
        if (meta.sourceRepoRoot) {
          lines.push(`\nSource repository:\n${meta.sourceRepoRoot}`);
        }
        if (meta.targetRepoRoot) {
          lines.push(`\nTarget repository:\n${meta.targetRepoRoot}`);
        }
        lines.push(`\nNext:\n  my-dev-kit-orchestrator prompt`);
        console.log(lines.join(''));
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
  return cmd;
}
