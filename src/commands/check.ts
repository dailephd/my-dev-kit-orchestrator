import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { getMostRecentRun, loadRun, getRunFolder } from '../run';
import { readArtifactStateFile } from '../artifactLifecycle';
import { checkAllArtifacts, checkArtifact, ArtifactCheckResult } from '../artifactChecker';
import { checkAllPrompts, PromptCheckResult, writeCheckResults } from '../promptChecker';

function resultLabel(passed: boolean, hasWarns: boolean): string {
  if (!passed) return 'fail';
  if (hasWarns) return 'warn';
  return 'pass';
}

function formatArtifactResult(result: ArtifactCheckResult): string[] {
  const hasWarns = result.issues.some((i) => i.severity === 'warn');
  const label = resultLabel(result.passed, hasWarns);
  const lines = [`  [${label}] ${result.artifactFile} (${result.artifactKind})`];
  for (const issue of result.issues) {
    if (issue.severity !== 'pass') {
      lines.push(`         ${issue.code}: ${issue.message}`);
    }
  }
  return lines;
}

function formatPromptResult(result: PromptCheckResult): string[] {
  const hasWarns = result.issues.some((i) => i.severity === 'warn');
  const label = resultLabel(result.passed, hasWarns);
  const lines = [`  [${label}] ${result.promptFile}`];
  for (const issue of result.issues) {
    if (issue.severity !== 'pass') {
      lines.push(`         ${issue.code}: ${issue.message}`);
    }
  }
  return lines;
}

function summarize(
  artifactResults: ArtifactCheckResult[],
  promptResults: PromptCheckResult[],
): string[] {
  const aPass = artifactResults.filter((r) => r.passed && !r.issues.some((i) => i.severity === 'warn')).length;
  const aWarn = artifactResults.filter((r) => r.passed && r.issues.some((i) => i.severity === 'warn')).length;
  const aFail = artifactResults.filter((r) => !r.passed).length;

  const pPass = promptResults.filter((r) => r.passed && !r.issues.some((i) => i.severity === 'warn')).length;
  const pWarn = promptResults.filter((r) => r.passed && r.issues.some((i) => i.severity === 'warn')).length;
  const pFail = promptResults.filter((r) => !r.passed).length;

  const lines: string[] = ['Summary:'];
  if (artifactResults.length > 0) {
    lines.push(`  Artifacts: ${aPass} pass, ${aFail} fail, ${aWarn} warn`);
  }
  if (promptResults.length > 0) {
    lines.push(`  Prompts:   ${pPass} pass, ${pFail} fail, ${pWarn} warn`);
  }
  return lines;
}

function resolveArtifactTarget(
  meta: { stages: { name: string; artifactFile: string }[] },
  artifactArg: string,
): { stageName: string; artifactFile: string } | null {
  // Try matching as stage name
  const byStage = meta.stages.find((s) => s.name === artifactArg);
  if (byStage) return { stageName: byStage.name, artifactFile: byStage.artifactFile };

  // Try matching as artifact file (basename or full relative path)
  const normalized = artifactArg.startsWith('artifacts/')
    ? artifactArg
    : `artifacts/${artifactArg}`;
  const byFile = meta.stages.find(
    (s) =>
      s.artifactFile === normalized ||
      s.artifactFile === artifactArg ||
      path.basename(s.artifactFile) === path.basename(artifactArg),
  );
  if (byFile) return { stageName: byFile.name, artifactFile: byFile.artifactFile };

  return null;
}

export function makeCheckCommand(): Command {
  const cmd = new Command('check');
  cmd
    .description('Check artifact content and prompt quality for a workflow run')
    .option('--run <run-id>', 'select a specific workflow run by ID')
    .option('--root <path>', 'project root directory (default: current working directory)')
    .option('--artifact <name>', 'check a single artifact by filename or stage name')
    .option('--prompts', 'check generated prompt files instead of artifacts')
    .option('--strict', 'treat warn-severity issues as failures in exit code')
    .action(
      (options: {
        run?: string;
        root?: string;
        artifact?: string;
        prompts?: boolean;
        strict?: boolean;
      }) => {
        const projectRoot = path.resolve(options.root ?? process.cwd());

        let meta;
        if (options.run) {
          const runFolder = getRunFolder(projectRoot, options.run);
          if (!fs.existsSync(runFolder)) {
            console.error(`Error: run not found: ${options.run}`);
            process.exit(1);
          }
          try {
            meta = loadRun(runFolder);
          } catch {
            console.error(`Error: could not load run.json for: ${options.run}`);
            process.exit(1);
          }
        } else {
          meta = getMostRecentRun(projectRoot);
          if (!meta) {
            console.log(
              'No runs found.\n\nNext:\n  my-dev-kit-orchestrator start "<software change request>"',
            );
            return;
          }
        }

        const stateFile = readArtifactStateFile(meta.runFolder);
        const artifactResults: ArtifactCheckResult[] = [];
        const promptResults: PromptCheckResult[] = [];

        if (options.artifact) {
          const target = resolveArtifactTarget(meta, options.artifact);
          if (!target) {
            console.error(
              `Error: artifact not found: "${options.artifact}"\n` +
                `Available stages: ${meta.stages.map((s) => s.name).join(', ')}`,
            );
            process.exit(1);
          }
          artifactResults.push(
            checkArtifact(meta.runFolder, target.artifactFile, target.stageName, stateFile),
          );
        } else if (options.prompts) {
          promptResults.push(...checkAllPrompts(meta));
        } else {
          artifactResults.push(...checkAllArtifacts(meta, stateFile));
          promptResults.push(...checkAllPrompts(meta));
        }

        const lines: string[] = [`Check results for run: ${meta.runId}`, ``];

        if (artifactResults.length > 0) {
          lines.push('Artifacts:');
          for (const result of artifactResults) {
            lines.push(...formatArtifactResult(result));
          }
          lines.push('');
        }

        if (promptResults.length > 0) {
          lines.push('Prompts:');
          for (const result of promptResults) {
            lines.push(...formatPromptResult(result));
          }
          lines.push('');
        }

        lines.push(...summarize(artifactResults, promptResults));

        console.log(lines.join('\n'));

        // Persist results when checking all
        if (!options.artifact && !options.prompts) {
          try {
            writeCheckResults(meta.runFolder, {
              version: '1',
              checkedAt: new Date().toISOString(),
              artifactResults,
              promptResults,
            });
          } catch {
            // Non-fatal: persistence is optional
          }
        }

        // Exit code
        const anyArtifactFail = artifactResults.some((r) => !r.passed);
        const anyPromptFail = promptResults.some((r) => !r.passed);
        const anyArtifactWarn = artifactResults.some((r) =>
          r.issues.some((i) => i.severity === 'warn'),
        );
        const anyPromptWarn = promptResults.some((r) =>
          r.issues.some((i) => i.severity === 'warn'),
        );

        const hasFail = anyArtifactFail || anyPromptFail;
        const hasWarn = anyArtifactWarn || anyPromptWarn;

        if (hasFail || (options.strict && hasWarn)) {
          process.exit(1);
        }
      },
    );
  return cmd;
}
