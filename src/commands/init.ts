import { Command } from 'commander';

export function makeInitCommand(): Command {
  const cmd = new Command('init');
  cmd
    .description('Initialize the my-dev-kit-orchestrator workspace inside the current project')
    .option('--root <path>', 'project root directory (default: current working directory)')
    .action((_options: { root?: string }) => {
      console.log('[init] Not yet implemented — coming in Prompt 3');
    });
  return cmd;
}
