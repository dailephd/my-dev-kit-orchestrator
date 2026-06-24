import { Command } from 'commander';
import { makeInitCommand } from './commands/init';
import { makeStartCommand } from './commands/start';
import { makeStatusCommand } from './commands/status';
import { makePromptCommand } from './commands/prompt';
import { makeListCommand } from './commands/list';
import { makeMarkCommand } from './commands/mark';
import { makeCheckCommand } from './commands/check';
import { makeExportCommand } from './commands/export';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('my-dev-kit-orchestrator')
    .description(
      'CLI-first workflow tool for design-first software development with coding agents.\n\n' +
      'Guides coding agents through a staged design-to-code workflow:\n' +
      '  request -> architecture context -> behavior model -> pseudocode\n' +
      '  -> test strategy -> implementation -> test implementation\n' +
      '  -> verification -> judge -> final report'
    )
    .version('0.6.0');

  program.addCommand(makeInitCommand());
  program.addCommand(makeStartCommand());
  program.addCommand(makeStatusCommand());
  program.addCommand(makePromptCommand());
  program.addCommand(makeListCommand());
  program.addCommand(makeMarkCommand());
  program.addCommand(makeCheckCommand());
  program.addCommand(makeExportCommand());

  return program;
}
