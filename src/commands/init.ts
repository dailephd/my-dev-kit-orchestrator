import { Command } from 'commander';
import * as path from 'path';
import { initWorkspace, workspaceExists, getWorkspaceRoot } from '../workspace';

export function makeInitCommand(): Command {
  const cmd = new Command('init');
  cmd
    .description('Initialize the my-dev-kit-orchestrator workspace inside the current project')
    .option('--root <path>', 'project root directory (default: current working directory)')
    .action((options: { root?: string }) => {
      const projectRoot = path.resolve(options.root ?? process.cwd());
      const alreadyExists = workspaceExists(projectRoot);

      initWorkspace(projectRoot);

      const wsDir = getWorkspaceRoot(projectRoot);
      if (alreadyExists) {
        console.log(`Workspace already initialized at:\n${wsDir}`);
      } else {
        console.log(`Initialized my-dev-kit-orchestrator workspace.\n\nWorkspace:\n${wsDir}\n\nNext:\n  my-dev-kit-orchestrator start "<software change request>"`);
      }
    });
  return cmd;
}
