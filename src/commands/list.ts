import { Command } from 'commander';
import { VALID_MODES, isValidMode } from '../types';

export function makeListCommand(): Command {
  const cmd = new Command('list');
  cmd
    .description('List previous workflow runs')
    .option('--mode <mode>', `filter by workflow mode (${VALID_MODES.join(' | ')})`)
    .option('--root <path>', 'project root directory (default: current working directory)')
    .action((options: { mode?: string; root?: string }) => {
      if (options.mode !== undefined && !isValidMode(options.mode)) {
        console.error(`Error: invalid mode "${options.mode}". Allowed values: ${VALID_MODES.join(', ')}`);
        process.exit(1);
      }
      console.log('[list] Not yet implemented — coming in Prompt 6');
    });
  return cmd;
}
