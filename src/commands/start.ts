import { Command } from 'commander';
import { VALID_MODES, isValidMode } from '../types';

export function makeStartCommand(): Command {
  const cmd = new Command('start');
  cmd
    .description('Start a new workflow run')
    .argument('<request>', 'the software change request or description')
    .option('--mode <mode>', `workflow mode (${VALID_MODES.join(' | ')})`, 'feature')
    .option('--root <path>', 'project root directory (default: current working directory)')
    .option('--name <run-name>', 'readable name to include in the run ID')
    .option('--output-dir <path>', 'custom run output directory')
    .action((_request: string, options: { mode: string; root?: string; name?: string; outputDir?: string }) => {
      if (!isValidMode(options.mode)) {
        console.error(`Error: invalid mode "${options.mode}". Allowed values: ${VALID_MODES.join(', ')}`);
        process.exit(1);
      }
      console.log('[start] Not yet implemented — coming in Prompt 3');
    });
  return cmd;
}
