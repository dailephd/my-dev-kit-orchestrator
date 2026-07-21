// Shared in-process CLI invocation helper, consolidating the runCli pattern
// duplicated across the Batch 5 context-integration test files (Batch 6
// section 26.2: reuse existing helpers, do not create another duplicate).
// Not a test file itself.

import { createProgram } from '../src/program';

export interface CliResult {
  output: string;
  exitCode: number | undefined;
}

export function runCli(args: string[]): CliResult {
  const capturedLog: string[] = [];
  const capturedStdout: string[] = [];
  const capturedErr: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  const origWrite = process.stdout.write.bind(process.stdout);
  console.log = (msg: string) => capturedLog.push(msg);
  console.error = (msg: string) => capturedErr.push(msg);
  process.stdout.write = ((chunk: string) => {
    capturedStdout.push(chunk.toString());
    return true;
  }) as never;
  const origExit = process.exit;
  let exitCode: number | undefined;
  process.exit = ((code?: number) => {
    exitCode = code;
    throw new Error('exit');
  }) as never;
  try {
    createProgram().parse(['node', 'cli', ...args]);
  } catch (e) {
    if ((e as Error).message !== 'exit') throw e;
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.stdout.write = origWrite;
    process.exit = origExit;
  }
  return { output: capturedStdout.join('') + capturedLog.join('\n') + capturedErr.join('\n'), exitCode };
}
