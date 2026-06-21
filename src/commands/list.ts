import { Command } from 'commander';
import * as path from 'path';
import { VALID_MODES, isValidMode } from '../types';
import { listRunFolders, loadRun } from '../run';
import { getNextStage } from '../stageDetector';

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

      const projectRoot = path.resolve(options.root ?? process.cwd());
      const folders = listRunFolders(projectRoot);

      if (folders.length === 0) {
        console.log('No runs found.\n\nNext:\n  my-dev-kit-orchestrator start "<software change request>"');
        return;
      }

      const runs = folders
        .map((folder) => {
          try {
            return loadRun(folder);
          } catch {
            return null;
          }
        })
        .filter((r) => r !== null);

      const filtered = options.mode
        ? runs.filter((r) => r!.mode === options.mode)
        : runs;

      if (filtered.length === 0) {
        console.log(`No runs found for mode: ${options.mode}`);
        return;
      }

      const lines: string[] = [];
      for (const meta of filtered) {
        if (!meta) continue;
        const nextStage = getNextStage(meta);
        const requestLabel = meta.request.length > 60
          ? meta.request.slice(0, 57) + '...'
          : meta.request;
        const status = nextStage ? 'in_progress' : 'complete';
        const currentStage = nextStage ? nextStage.name : '(complete)';

        lines.push(`─────────────────────────────────────────────`);
        lines.push(`Run ID:       ${meta.runId}`);
        lines.push(`Mode:         ${meta.mode}`);
        lines.push(`Request:      ${requestLabel}`);
        lines.push(`Status:       ${status}`);
        lines.push(`Created:      ${meta.createdAt}`);
        lines.push(`Next stage:   ${currentStage}`);
        lines.push(`Run folder:   ${meta.runFolder}`);
      }
      lines.push(`─────────────────────────────────────────────`);
      lines.push(`Total: ${filtered.length} run(s)`);

      console.log(lines.join('\n'));
    });
  return cmd;
}
