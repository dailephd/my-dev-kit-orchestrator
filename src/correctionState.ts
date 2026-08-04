import * as fs from 'fs';
import * as path from 'path';
import { parseJudgeReport } from './judgeParser';
import { routeJudgeVerdict, CorrectionRouteResult } from './correctionRouter';
import type { WorkflowMode } from './types';

/**
 * Reads artifacts/judge-report.txt from the run folder and computes the
 * correction route result. Returns null when no judge report exists yet.
 * This is computed fresh each call - no additional persistence file is needed.
 */
export function readCorrectionState(
  runFolder: string,
  options: { strict?: boolean; workflowMode?: WorkflowMode } = {},
): CorrectionRouteResult | null {
  const reportPath = path.join(runFolder, 'artifacts', 'judge-report.txt');
  if (!fs.existsSync(reportPath)) return null;

  const content = fs.readFileSync(reportPath, 'utf8');
  const parsed = parseJudgeReport(content);
  return routeJudgeVerdict(parsed, options);
}

/**
 * Returns true when a correction route is active for this run:
 * a judge report exists with a non-PASS, non-blocked verdict that maps
 * to a correctable stage.
 */
export function isCorrectionActive(runFolder: string, workflowMode?: WorkflowMode): boolean {
  const state = readCorrectionState(runFolder, { workflowMode });
  return state !== null && state.routeStatus === 'correction_required';
}

