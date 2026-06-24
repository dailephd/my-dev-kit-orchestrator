import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { getMostRecentRun, loadRun, getRunFolder } from '../run';
import { readArtifactStateFile } from '../artifactLifecycle';
import { checkAllArtifacts, checkArtifact, ArtifactCheckResult } from '../artifactChecker';
import { checkAllPrompts, PromptCheckResult, writeCheckResults } from '../promptChecker';
import {
  checkAllTraces,
  checkDesignMapTrace,
  TraceCheckResult,
  writeTraceCheckResults,
  buildTraceCorrectionSuggestions,
} from '../traceChecker';
import {
  checkRunArtifactContracts,
  checkStageGates,
  ArtifactContractCheckResult,
  StageGateViolation,
} from '../contractChecker';
import { readCorrectionState } from '../correctionState';

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

function formatTraceResult(result: TraceCheckResult): string[] {
  const hasWarns = result.issues.some((i) => i.severity === 'warn');
  const label = resultLabel(result.passed, hasWarns);
  const lines = [`  [${label}] ${result.artifactFile}`];
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

function summarizeTrace(traceResults: TraceCheckResult[]): string[] {
  // Exclude pass-with-no-issues (files that didn't exist - they return passed:true, issues:[])
  const checked = traceResults.filter((r) => r.issues.length > 0 || !r.passed);
  const pass = checked.filter((r) => r.passed && !r.issues.some((i) => i.severity === 'warn')).length;
  const warn = checked.filter((r) => r.passed && r.issues.some((i) => i.severity === 'warn')).length;
  const fail = checked.filter((r) => !r.passed).length;
  return ['Summary:', `  Trace: ${pass} pass, ${fail} fail, ${warn} warn`];
}

function formatContractResult(result: ArtifactContractCheckResult): string[] {
  const hasWarns = result.issues.some((i) => i.severity === 'warn');
  const label = resultLabel(result.passed, hasWarns);
  const lines = [
    `  [${label}] ${result.artifactFile} (${result.artifactKind}, stage: ${result.stageName}, mode: ${result.mode})`,
  ];
  for (const issue of result.issues) {
    if (issue.severity !== 'pass') {
      lines.push(`         ${issue.code} [${issue.severity}]: ${issue.message}`);
      if (issue.suggestedFix) {
        lines.push(`         Fix: ${issue.suggestedFix}`);
      }
    }
  }
  return lines;
}

function summarizeContracts(results: ArtifactContractCheckResult[]): string[] {
  const pass = results.filter((r) => r.passed && !r.issues.some((i) => i.severity === 'warn')).length;
  const warn = results.filter((r) => r.passed && r.issues.some((i) => i.severity === 'warn')).length;
  const fail = results.filter((r) => !r.passed).length;
  return [`  Contracts: ${pass} pass, ${fail} fail, ${warn} warn`];
}

function formatGateViolation(v: StageGateViolation): string[] {
  return [
    `  [fail] ${v.gateName}: ${v.message}`,
    `         Fix: ${v.suggestedFix}`,
  ];
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
    .option('--artifacts', 'check artifact contracts for all stages in the run (v1)')
    .option('--all', 'run all checks: contracts, stage gates, trace, design-map, correction routing (v1)')
    .option('--prompts', 'check generated prompt files instead of artifacts')
    .option('--trace', 'check trace IDs and links in all artifacts')
    .option('--design-map', 'check the design-map artifact (sections and trace links)')
    .option('--strict', 'treat warn-severity issues as failures in exit code')
    .action(
      (options: {
        run?: string;
        root?: string;
        artifact?: string;
        artifacts?: boolean;
        all?: boolean;
        prompts?: boolean;
        trace?: boolean;
        designMap?: boolean;
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

        // ── --artifacts mode (v1 contract check) ──────────────────────────────
        if (options.artifacts) {
          const contractResult = checkRunArtifactContracts(meta, { strict: options.strict });
          const lines: string[] = [`Artifact contract check for run: ${meta.runId}`, ``];

          if (!contractResult.modeValid) {
            for (const issue of contractResult.modeIssues) {
              lines.push(`  [fail] ${issue.code}: ${issue.message}`);
            }
          } else {
            if (contractResult.modeIssues.length > 0) {
              lines.push('Run issues:');
              for (const issue of contractResult.modeIssues) {
                lines.push(`  [warn] ${issue.code}: ${issue.message}`);
              }
              lines.push('');
            }

            lines.push('Artifacts:');
            for (const result of contractResult.results) {
              lines.push(...formatContractResult(result));
            }
            lines.push('');
            lines.push('Summary:');
            lines.push(...summarizeContracts(contractResult.results));
          }

          console.log(lines.join('\n'));

          const anyFail = !contractResult.modeValid ||
            contractResult.results.some((r) => !r.passed) ||
            contractResult.modeIssues.some((i) => i.severity === 'fail');
          const anyWarn = contractResult.results.some((r) =>
            r.issues.some((i) => i.severity === 'warn'),
          );
          if (anyFail || (options.strict && anyWarn)) {
            process.exit(1);
          }
          return;
        }

        // ── --all mode (all v1 checks combined) ───────────────────────────────
        if (options.all) {
          const contractOpts = { strict: options.strict };
          const contractResult = checkRunArtifactContracts(meta, contractOpts);
          const gateViolations = checkStageGates(meta);
          const traceResults = checkAllTraces(meta);

          // Design-map check if file exists
          const designMapPath = path.join(meta.runFolder, 'artifacts/design-map.txt');
          const hasDesignMap = fs.existsSync(designMapPath);
          const dmTraceResult = hasDesignMap ? checkDesignMapTrace(meta.runFolder) : null;

          // Correction routing check
          const correctionState = readCorrectionState(meta.runFolder);

          const lines: string[] = [`Full check for run: ${meta.runId}`, ``];

          // Contract checks
          lines.push('=== Artifact contracts ===');
          if (!contractResult.modeValid) {
            for (const issue of contractResult.modeIssues) {
              lines.push(`  [fail] ${issue.code}: ${issue.message}`);
            }
          } else {
            if (contractResult.modeIssues.length > 0) {
              for (const issue of contractResult.modeIssues) {
                lines.push(`  [warn] ${issue.code}: ${issue.message}`);
              }
            }
            for (const result of contractResult.results) {
              if (!result.passed || result.issues.length > 0) {
                lines.push(...formatContractResult(result));
              }
            }
            const hasNoIssues = contractResult.results.every(
              (r) => r.passed && r.issues.length === 0,
            );
            if (hasNoIssues && contractResult.modeIssues.length === 0) {
              lines.push('  all artifact contracts pass');
            }
          }
          lines.push('');

          // Stage gate checks
          lines.push('=== Stage gates ===');
          if (gateViolations.length === 0) {
            lines.push('  all stage gates pass');
          } else {
            for (const v of gateViolations) {
              lines.push(...formatGateViolation(v));
            }
          }
          lines.push('');

          // Trace checks
          lines.push('=== Trace checks ===');
          const hasTraceIssues = traceResults.some((r) => r.issues.length > 0);
          if (hasTraceIssues) {
            for (const result of traceResults) {
              if (result.issues.length > 0) {
                lines.push(...formatTraceResult(result));
              }
            }
          } else {
            lines.push('  no trace issues found');
          }
          if (dmTraceResult && dmTraceResult.issues.length > 0) {
            lines.push('  design-map:');
            lines.push(...formatTraceResult(dmTraceResult));
          }
          lines.push('');

          // Correction routing
          lines.push('=== Correction routing ===');
          if (!correctionState) {
            lines.push('  no judge report found');
          } else if (correctionState.routeStatus === 'pass') {
            lines.push('  Judge correction: PASS -- no correction required');
          } else if (correctionState.routeStatus === 'correction_required') {
            lines.push(`  Judge correction: ${correctionState.verdict} -> ${correctionState.routedStage}`);
          } else if (correctionState.routeStatus === 'blocked') {
            lines.push(`  Judge correction: ${correctionState.verdict} -- run is blocked`);
          } else {
            lines.push(`  Judge correction: ${correctionState.routeStatus}`);
          }
          lines.push('');

          // Persist trace results
          try {
            writeTraceCheckResults(meta.runFolder, {
              version: '1',
              checkedAt: new Date().toISOString(),
              traceResults,
            });
          } catch {
            // Non-fatal
          }

          // Trace-aware correction suggestions
          const allTraceResults = dmTraceResult ? [...traceResults, dmTraceResult] : traceResults;
          const traceSuggestions = buildTraceCorrectionSuggestions(allTraceResults);
          if (traceSuggestions.length > 0) {
            lines.push('=== Correction suggestions ===');
            for (const suggestion of traceSuggestions) {
              lines.push(`  ${suggestion}`);
            }
            lines.push('');
          }

          // Summary
          lines.push('=== Summary ===');
          lines.push(...summarizeContracts(contractResult.results));
          lines.push(
            `  Stage gates: ${gateViolations.length} violation${gateViolations.length === 1 ? '' : 's'}`,
          );
          lines.push(...summarizeTrace(traceResults));

          console.log(lines.join('\n'));

          const anyContractFail =
            !contractResult.modeValid ||
            contractResult.results.some((r) => !r.passed) ||
            contractResult.modeIssues.some((i) => i.severity === 'fail');
          const anyContractWarn = contractResult.results.some((r) =>
            r.issues.some((i) => i.severity === 'warn'),
          );
          const anyTraceFail = traceResults.some((r) => !r.passed);
          const anyTraceWarn = traceResults.some((r) =>
            r.issues.some((i) => i.severity === 'warn'),
          );
          const hasGateViolations = gateViolations.length > 0;

          const hasFail = anyContractFail || anyTraceFail || hasGateViolations;
          const hasWarn = anyContractWarn || anyTraceWarn;

          if (hasFail || (options.strict && hasWarn)) {
            process.exit(1);
          }
          return;
        }

        // ── --trace mode ──────────────────────────────────────────────────────
        if (options.trace) {
          const traceResults = checkAllTraces(meta);
          const lines: string[] = [`Trace check results for run: ${meta.runId}`, ``];

          const hasAny = traceResults.some((r) => r.issues.length > 0);
          if (hasAny) {
            lines.push('Artifacts:');
            for (const result of traceResults) {
              if (result.issues.length > 0) {
                lines.push(...formatTraceResult(result));
              }
            }
          } else {
            lines.push('Artifacts: no trace issues found');
          }
          lines.push('');
          lines.push(...summarizeTrace(traceResults));

          // Trace-aware correction suggestions
          const traceSuggestions = buildTraceCorrectionSuggestions(traceResults);
          if (traceSuggestions.length > 0) {
            lines.push('');
            lines.push('Correction suggestions:');
            for (const suggestion of traceSuggestions) {
              lines.push(`  ${suggestion}`);
            }
          }

          console.log(lines.join('\n'));

          // Persist
          try {
            writeTraceCheckResults(meta.runFolder, {
              version: '1',
              checkedAt: new Date().toISOString(),
              traceResults,
            });
          } catch {
            // Non-fatal
          }

          const anyFail = traceResults.some((r) => !r.passed);
          const anyWarn = traceResults.some((r) =>
            r.issues.some((i) => i.severity === 'warn'),
          );
          if (anyFail || (options.strict && anyWarn)) {
            process.exit(1);
          }
          return;
        }

        // ── --design-map mode ─────────────────────────────────────────────────
        if (options.designMap) {
          const stateFile = readArtifactStateFile(meta.runFolder);
          // Section/structure check via existing artifact checker
          const artifactResult = checkArtifact(
            meta.runFolder,
            'artifacts/design-map.txt',
            'design-map',
            stateFile,
          );
          // Trace-specific check
          const traceResult = checkDesignMapTrace(meta.runFolder);

          const lines: string[] = [`Design map check for run: ${meta.runId}`, ``];

          lines.push('Artifact check:');
          lines.push(...formatArtifactResult(artifactResult));
          lines.push('');
          lines.push('Trace check:');
          lines.push(...formatTraceResult(traceResult));
          lines.push('');

          const anyFail = !artifactResult.passed || !traceResult.passed;
          const anyWarn =
            artifactResult.issues.some((i) => i.severity === 'warn') ||
            traceResult.issues.some((i) => i.severity === 'warn');

          // Trace-aware correction suggestions for design-map
          const dmSuggestions = buildTraceCorrectionSuggestions([traceResult]);
          if (dmSuggestions.length > 0) {
            lines.push('Correction suggestions:');
            for (const suggestion of dmSuggestions) {
              lines.push(`  ${suggestion}`);
            }
            lines.push('');
          }

          console.log(lines.join('\n'));

          if (anyFail || (options.strict && anyWarn)) {
            process.exit(1);
          }
          return;
        }

        // ── Standard artifact/prompts mode (unchanged) ────────────────────────
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

