import { Command } from 'commander';
import * as path from 'path';
import { getMostRecentRun, loadRun, getRunFolder } from '../run';
import * as fs from 'fs';
import {
  isManualState,
  isForbiddenManualState,
  setArtifactManualState,
  readArtifactStateFile,
  ManualArtifactLifecycleState,
} from '../artifactLifecycle';
import { resolveArtifactState } from '../artifactLifecycle';

function resolveArtifactKey(
  artifactName: string,
  runFolder: string,
  stages: { artifactFile: string; additionalArtifactFiles?: string[] }[],
): string | undefined {
  const allFiles: string[] = [];
  for (const stage of stages) {
    allFiles.push(stage.artifactFile);
    if (stage.additionalArtifactFiles) {
      allFiles.push(...stage.additionalArtifactFiles);
    }
  }

  // Exact match first (e.g., artifacts/request-brief.txt)
  if (allFiles.includes(artifactName)) return artifactName;

  // Basename match (e.g., request-brief.txt)
  const baseName = path.basename(artifactName);
  return allFiles.find((f) => path.basename(f) === baseName);
}

export function makeMarkCommand(): Command {
  const cmd = new Command('mark');
  cmd
    .description('Manually set the lifecycle state of a run artifact')
    .argument('<artifact-name>', 'artifact filename (e.g., request-brief.txt)')
    .requiredOption('--state <state>', 'lifecycle state: incomplete | blocked | complete')
    .option('--reason <reason>', 'reason for the state change (required for blocked and incomplete)')
    .option('--run <run-id>', 'select a specific workflow run by ID')
    .option('--root <path>', 'project root directory (default: current working directory)')
    .action(
      (
        artifactName: string,
        options: { state: string; reason?: string; run?: string; root?: string },
      ) => {
        const projectRoot = path.resolve(options.root ?? process.cwd());

        if (isForbiddenManualState(options.state)) {
          console.error(
            `Error: "${options.state}" cannot be set manually.\n` +
            `  "missing" is computed from file absence.\n` +
            `  "stale" is computed from upstream artifact timestamps.\n` +
            `Allowed manual states: incomplete, blocked, complete`,
          );
          process.exit(1);
        }

        if (!isManualState(options.state)) {
          console.error(
            `Error: invalid state "${options.state}".\n` +
            `Allowed manual states: incomplete, blocked, complete`,
          );
          process.exit(1);
        }

        const state = options.state as ManualArtifactLifecycleState;

        if ((state === 'blocked' || state === 'incomplete') && !options.reason) {
          console.error(
            `Error: --reason is required when marking an artifact as ${state}.\n` +
            `Example: my-dev-kit-orchestrator mark ${artifactName} --state ${state} --reason "Explain why"`,
          );
          process.exit(1);
        }

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
            console.error('No runs found. Run: my-dev-kit-orchestrator start "<request>"');
            process.exit(1);
          }
        }

        const artifactKey = resolveArtifactKey(artifactName, meta.runFolder, meta.stages);
        if (!artifactKey) {
          const knownArtifacts = meta.stages.flatMap((s) => [
            s.artifactFile,
            ...(s.additionalArtifactFiles ?? []),
          ]);
          console.error(
            `Error: unknown artifact "${artifactName}".\n` +
            `Known artifacts for this run:\n` +
            knownArtifacts.map((f) => `  - ${path.basename(f)}`).join('\n'),
          );
          process.exit(1);
        }

        setArtifactManualState(meta.runFolder, artifactKey, state, {
          reason: options.reason,
        });

        // Warn if marking complete but file is missing
        if (state === 'complete') {
          const stateFile = readArtifactStateFile(meta.runFolder);
          const effectiveState = resolveArtifactState(
            meta.runFolder,
            artifactKey,
            meta.stages,
            stateFile,
          );
          if (effectiveState === 'missing') {
            console.warn(
              `Warning: "${path.basename(artifactKey)}" was marked complete but the artifact file does not exist.\n` +
              `  Effective state remains: missing\n` +
              `  Create the file before the stage can be considered complete.`,
            );
          }
        }

        const reasonMsg = options.reason ? ` — ${options.reason}` : '';
        console.log(
          `Marked ${path.basename(artifactKey)} as ${state}${reasonMsg}\n` +
          `Run: ${meta.runId}`,
        );
      },
    );
  return cmd;
}
