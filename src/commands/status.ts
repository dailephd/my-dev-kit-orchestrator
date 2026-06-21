import { Command } from 'commander';

export function makeStatusCommand(): Command {
  const cmd = new Command('status');
  cmd
    .description('Show the current or selected workflow run status')
    .option('--run <run-id>', 'select a specific workflow run by ID')
    .option('--root <path>', 'project root directory (default: current working directory)')
    .action((_options: { run?: string; root?: string }) => {
      console.log('[status] Not yet implemented — coming in Prompt 6');
    });
  return cmd;
}
