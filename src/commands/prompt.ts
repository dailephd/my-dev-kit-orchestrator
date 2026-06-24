import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { getMostRecentRun, loadRun, getRunFolder } from '../run';
import { generateStagePrompt } from '../promptGenerator';
import {
  getNextStage,
  isRunComplete,
  getMissingPriorArtifacts,
  getNextStageWithLifecycle,
  isRunCompleteWithLifecycle,
  resolveCurrentArtifactStates,
} from '../stageDetector';
import { readArtifactStateFile, ArtifactStateFile, ArtifactLifecycleState } from '../artifactLifecycle';
import { StageDefinition } from '../workflows';
import { readCorrectionState } from '../correctionState';
import { generateCorrectionPrompt } from '../promptGenerator';

function buildLifecycleContextBlock(
  stage: StageDefinition,
  states: ArtifactLifecycleState[],
  stateFile: ArtifactStateFile,
): string {
  const dominantState = states.find((s) => s !== 'complete' && s !== 'missing') ?? states[0];
  if (dominantState === 'complete') return '';

  const record = stateFile.artifacts[stage.artifactFile];
  const reason = record?.reason;

  const lines: string[] = ['=== LIFECYCLE CONTEXT ==='];

  if (dominantState === 'blocked') {
    lines.push(`Current artifact state: blocked`);
    if (reason) lines.push(`Reason: ${reason}`);
    lines.push('');
    lines.push('This artifact is blocked. Do not guess or fabricate missing information.');
    lines.push('Document the blocker clearly in the artifact. Identify what external input');
    lines.push('or decision is needed before work can continue.');
  } else if (dominantState === 'incomplete') {
    lines.push(`Current artifact state: incomplete`);
    if (reason) lines.push(`Reason: ${reason}`);
    lines.push('');
    lines.push('This artifact is marked incomplete. Finish the unfinished sections.');
    lines.push('Preserve existing content that is already correct. Review and complete');
    lines.push('what remains before marking this artifact done.');
  } else if (dominantState === 'stale') {
    lines.push(`Current artifact state: stale`);
    lines.push('');
    lines.push('This artifact is stale - an upstream artifact changed after this one was');
    lines.push('completed. Reconcile this artifact against the newer upstream artifacts');
    lines.push('before continuing. Review what changed and update accordingly.');
  } else {
    return '';
  }

  lines.push('=========================');
  lines.push('');
  return lines.join('\n');
}

export function makePromptCommand(): Command {
  const cmd = new Command('prompt');
  cmd
    .description('Print the next stage prompt for the active or selected run')
    .argument('[stage]', 'specific stage name in lowercase kebab-case (optional)')
    .option('--run <run-id>', 'select a specific workflow run by ID')
    .option('--root <path>', 'project root directory (default: current working directory)')
    .action((stage: string | undefined, options: { run?: string; root?: string }) => {
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
          console.error(`Error: could not load run: ${options.run}`);
          process.exit(1);
        }
      } else {
        meta = getMostRecentRun(projectRoot);
        if (!meta) {
          console.error('No runs found. Run: my-dev-kit-orchestrator start "<request>"');
          process.exit(1);
        }
      }

      const stateFile = readArtifactStateFile(meta.runFolder);

      if (stage) {
        const stageExists = meta.stages.some((s) => s.name === stage);
        if (!stageExists) {
          const available = meta.stages.map((s) => s.name).join(', ');
          console.error(`Error: stage "${stage}" does not exist in ${meta.mode} workflow.\nAvailable stages: ${available}`);
          process.exit(1);
        }

        const missingPrior = getMissingPriorArtifacts(meta, stage);
        if (missingPrior.length > 0) {
          console.error(
            `Warning: the following required prior artifacts are missing:\n` +
            missingPrior.map((f) => `  - ${f}`).join('\n') +
            `\n\nReturn to the stage that produces the missing artifact before continuing.\n` +
            `Next missing stage: ${getNextStage(meta)?.name ?? 'none'}`
          );
          process.exit(1);
        }

        const stageObj = meta.stages.find((s) => s.name === stage)!;
        const states = resolveCurrentArtifactStates(meta, stateFile, stageObj);
        const lifecycleBlock = buildLifecycleContextBlock(stageObj, states, stateFile);

        try {
          const promptText = generateStagePrompt(meta, stage);
          process.stdout.write(lifecycleBlock + promptText);
        } catch (err) {
          console.error(`Error generating prompt: ${(err as Error).message}`);
          process.exit(1);
        }
      } else {
        if (isRunCompleteWithLifecycle(meta, stateFile)) {
          if (isRunComplete(meta)) {
            console.log(
              `Run ${meta.runId} is complete - all expected artifacts are present.\n\n` +
              `To view the final report:\n  ${path.join(meta.runFolder, 'artifacts/final-report.txt')}\n\n` +
              `To inspect run status:\n  my-dev-kit-orchestrator status`
            );
          } else {
            console.log(
              `Run ${meta.runId} is complete - all artifacts are in complete state.\n\n` +
              `To view the final report:\n  ${path.join(meta.runFolder, 'artifacts/final-report.txt')}\n\n` +
              `To inspect run status:\n  my-dev-kit-orchestrator status`
            );
          }
          return;
        }

        // Check for active correction routing (judge-report.txt with non-PASS verdict)
        const correctionState = readCorrectionState(meta.runFolder);
        if (correctionState && correctionState.routeStatus === 'correction_required' && correctionState.routedStage) {
          try {
            const correctionPrompt = generateCorrectionPrompt(meta, correctionState);
            process.stdout.write(correctionPrompt);
          } catch (err) {
            console.error(`Error generating correction prompt: ${(err as Error).message}`);
            process.exit(1);
          }
          return;
        }

        if (correctionState && correctionState.routeStatus === 'blocked') {
          console.log(
            `Run ${meta.runId} is blocked by judge verdict: ${correctionState.verdict}\n\n` +
            `This run requires external resolution (e.g. scope clarification or design restart)\n` +
            `before it can continue automatically.\n\n` +
            `Inspect the judge report:\n  ${meta.runFolder}/artifacts/judge-report.txt\n\n` +
            `To inspect run status:\n  my-dev-kit-orchestrator status`
          );
          return;
        }

        const nextStage = getNextStageWithLifecycle(meta, stateFile);
        if (!nextStage) {
          console.log('No missing stage artifact remains.');
          return;
        }

        const states = resolveCurrentArtifactStates(meta, stateFile, nextStage);
        const lifecycleBlock = buildLifecycleContextBlock(nextStage, states, stateFile);

        try {
          const promptText = generateStagePrompt(meta, nextStage.name);
          process.stdout.write(lifecycleBlock + promptText);
        } catch (err) {
          console.error(`Error generating prompt: ${(err as Error).message}`);
          process.exit(1);
        }
      }
    });
  return cmd;
}

