import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { getMostRecentRun, loadRun, getRunFolder } from '../run';
import { readCorrectionState } from '../correctionState';
import { readTraceCheckResults } from '../traceChecker';
import { readCheckResults } from '../promptChecker';

// ─── Path safety ──────────────────────────────────────────────────────────────

function isSafePath(outputPath: string): { safe: boolean; reason?: string } {
  // Must be an absolute resolved path (caller should path.resolve first)
  const resolved = path.resolve(outputPath);

  // Refuse if the path is a directory
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    return { safe: false, reason: 'output path is a directory' };
  }

  // Refuse if the path is a symbolic link
  try {
    const lstat = fs.lstatSync(resolved);
    if (lstat.isSymbolicLink()) {
      return { safe: false, reason: 'output path is a symbolic link' };
    }
  } catch {
    // File does not exist -- that is fine
  }

  // Refuse path traversal sequences in the raw argument
  if (outputPath.includes('..')) {
    return { safe: false, reason: 'output path contains path traversal (..)' };
  }

  return { safe: true };
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function sectionHeader(title: string): string {
  return `\n=== ${title} ===\n`;
}

function artifactChecklist(
  runFolder: string,
  stages: Array<{ name: string; artifactFile: string }>,
): string {
  const lines: string[] = [];
  for (const stage of stages) {
    const fullPath = path.join(runFolder, stage.artifactFile);
    const exists = fs.existsSync(fullPath);
    const marker = exists ? '[present]' : '[missing]';
    lines.push(`  ${marker} ${stage.artifactFile} (${stage.name})`);
  }
  return lines.join('\n');
}

function formatCorrectionState(runFolder: string): string {
  const state = readCorrectionState(runFolder);
  if (!state) return '  no judge report';
  if (state.routeStatus === 'pass') return '  PASS -- no correction required';
  if (state.routeStatus === 'correction_required') {
    return `  ${state.verdict} -> correction required (routed stage: ${state.routedStage})`;
  }
  if (state.routeStatus === 'blocked') {
    return `  ${state.verdict} -- run is blocked (external resolution required)`;
  }
  return `  ${state.routeStatus}`;
}

function readJudgeVerdict(runFolder: string): string {
  const p = path.join(runFolder, 'artifacts', 'judge-report.txt');
  if (!fs.existsSync(p)) return '  no judge report';
  const state = readCorrectionState(runFolder);
  if (!state || !state.verdict) return '  judge report present but verdict not parsed';
  return `  ${state.verdict}`;
}

function readVerificationEvidence(runFolder: string): string {
  const p = path.join(runFolder, 'artifacts', 'verification-report.txt');
  if (!fs.existsSync(p)) return '  no verification report';
  const content = fs.readFileSync(p, 'utf8');
  const lines = content.split('\n');
  // Extract up to 20 lines of evidence summary (first non-empty lines)
  const evidence = lines.filter((l) => l.trim()).slice(0, 20);
  if (evidence.length === 0) return '  verification report is empty';
  return evidence.map((l) => `  ${l}`).join('\n');
}

function formatTraceCheckSummary(runFolder: string): string {
  const results = readTraceCheckResults(runFolder);
  if (!results) return '  trace check not run';
  const tr = results.traceResults;
  const pass = tr.filter((r) => r.passed && !r.issues.some((i) => i.severity === 'warn')).length;
  const warn = tr.filter((r) => r.passed && r.issues.some((i) => i.severity === 'warn')).length;
  const fail = tr.filter((r) => !r.passed).length;
  return `  trace: ${pass} pass, ${fail} fail, ${warn} warn (checked: ${results.checkedAt})`;
}

function formatCheckResultsSummary(runFolder: string): string {
  const results = readCheckResults(runFolder);
  if (!results) return '  content check not run';
  const ar = results.artifactResults;
  const aPass = ar.filter((r) => r.passed && !r.issues.some((i) => i.severity === 'warn')).length;
  const aWarn = ar.filter((r) => r.passed && r.issues.some((i) => i.severity === 'warn')).length;
  const aFail = ar.filter((r) => !r.passed).length;
  return `  content check: ${aPass} pass, ${aFail} fail, ${aWarn} warn (checked: ${results.checkedAt})`;
}

function listMissingArtifacts(
  runFolder: string,
  stages: Array<{ name: string; artifactFile: string }>,
): string {
  const missing = stages.filter(
    (s) => !fs.existsSync(path.join(runFolder, s.artifactFile)),
  );
  if (missing.length === 0) return '  none';
  return missing.map((s) => `  missing: ${s.artifactFile} (${s.name})`).join('\n');
}

function formatNextCommand(meta: {
  runId: string;
  currentStage: string;
  runFolder: string;
}): string {
  const correctionState = readCorrectionState(meta.runFolder);
  if (correctionState && correctionState.routeStatus === 'correction_required') {
    return `  my-dev-kit-orchestrator prompt --run ${meta.runId}  # correction: ${correctionState.routedStage}`;
  }
  if (correctionState && correctionState.routeStatus === 'blocked') {
    return `  # run is blocked -- resolve externally, then: my-dev-kit-orchestrator status --run ${meta.runId}`;
  }
  return `  my-dev-kit-orchestrator prompt --run ${meta.runId}`;
}

// ─── Export format builder ────────────────────────────────────────────────────

export function buildExportText(meta: {
  runId: string;
  mode: string;
  request: string;
  currentStage: string;
  status: string;
  createdAt: string;
  runFolder: string;
  stages: Array<{ name: string; artifactFile: string }>;
}): string {
  const parts: string[] = [];

  parts.push('my-dev-kit-orchestrator run handoff export');
  parts.push(`Generated: ${new Date().toISOString()}`);

  parts.push(sectionHeader('Run identity'));
  parts.push(`  Run ID:       ${meta.runId}`);
  parts.push(`  Mode:         ${meta.mode}`);
  parts.push(`  Status:       ${meta.status}`);
  parts.push(`  Created:      ${meta.createdAt}`);
  parts.push(`  Current stage: ${meta.currentStage}`);
  parts.push(`  Run folder:   ${meta.runFolder}`);

  parts.push(sectionHeader('Request'));
  parts.push(`  ${meta.request}`);

  parts.push(sectionHeader('Artifact checklist'));
  parts.push(artifactChecklist(meta.runFolder, meta.stages));

  parts.push(sectionHeader('Missing artifacts'));
  parts.push(listMissingArtifacts(meta.runFolder, meta.stages));

  parts.push(sectionHeader('Judge verdict'));
  parts.push(readJudgeVerdict(meta.runFolder));

  parts.push(sectionHeader('Correction state'));
  parts.push(formatCorrectionState(meta.runFolder));

  parts.push(sectionHeader('Verification evidence'));
  parts.push(readVerificationEvidence(meta.runFolder));

  parts.push(sectionHeader('Check summaries'));
  parts.push(formatCheckResultsSummary(meta.runFolder));
  parts.push(formatTraceCheckSummary(meta.runFolder));

  parts.push(sectionHeader('Next command'));
  parts.push(formatNextCommand(meta));

  parts.push('');
  return parts.join('\n');
}

// ─── Command ──────────────────────────────────────────────────────────────────

export function makeExportCommand(): Command {
  const cmd = new Command('export');
  cmd
    .description('Export a portable plain-text run handoff for use in another session or agent')
    .option('--run <run-id>', 'select a specific workflow run by ID')
    .option('--root <path>', 'project root directory (default: current working directory)')
    .option('--out <file>', 'write export to this file (default: print to stdout)')
    .option(
      '--overwrite',
      'allow overwriting an existing output file (default: refuse if file exists)',
    )
    .action(
      (options: {
        run?: string;
        root?: string;
        out?: string;
        overwrite?: boolean;
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

        const exportText = buildExportText(meta);

        if (!options.out) {
          process.stdout.write(exportText);
          return;
        }

        const outPath = path.resolve(options.out);

        // Path safety checks
        const safety = isSafePath(outPath);
        if (!safety.safe) {
          console.error(`Error: output path rejected: ${safety.reason}`);
          process.exit(1);
        }

        // Refuse to overwrite unless --overwrite is set
        if (fs.existsSync(outPath) && !options.overwrite) {
          console.error(
            `Error: output file already exists: ${outPath}\n` +
              `Use --overwrite to replace it.`,
          );
          process.exit(1);
        }

        // Ensure parent directory exists
        const outDir = path.dirname(outPath);
        if (!fs.existsSync(outDir)) {
          console.error(`Error: output directory does not exist: ${outDir}`);
          process.exit(1);
        }

        fs.writeFileSync(outPath, exportText, 'utf8');
        console.log(`Export written to: ${outPath}`);
      },
    );
  return cmd;
}
