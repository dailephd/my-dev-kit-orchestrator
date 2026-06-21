import { Command } from 'commander';

export function makePromptCommand(): Command {
  const cmd = new Command('prompt');
  cmd
    .description('Print the next stage prompt for the active or selected run')
    .argument('[stage]', 'specific stage name in lowercase kebab-case (optional)')
    .option('--run <run-id>', 'select a specific workflow run by ID')
    .option('--root <path>', 'project root directory (default: current working directory)')
    .action((_stage: string | undefined, _options: { run?: string; root?: string }) => {
      console.log('[prompt] Not yet implemented — coming in Prompt 5');
    });
  return cmd;
}
