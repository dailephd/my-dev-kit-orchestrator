// Renders bounded stage-prompt content for the scaffold-plan and
// scaffold-implementation greenfield stages.
//
// Kept separate from src/promptGenerator.ts (section 10.3) because these two
// prompts are specifically tied to the GreenfieldScaffoldPlan contract
// (buildScaffoldPlan.ts) rather than being generic template text; every
// other greenfield stage prompt lives inline in promptGenerator.ts alongside
// all other modes' stage prompts.

export interface GreenfieldPromptContext {
  stage: string;
  mode: string;
  runId: string;
  projectRoot: string;
  runFolder: string;
}

function header(ctx: GreenfieldPromptContext): string {
  return [
    `Stage: ${ctx.stage}`,
    `Workflow mode: ${ctx.mode}`,
    `Run ID: ${ctx.runId}`,
    `Project root: ${ctx.projectRoot}`,
    `Run folder: ${ctx.runFolder}`,
    '',
  ].join('\n');
}

export function renderScaffoldPlanPrompt(ctx: GreenfieldPromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/bootstrap-bundle.json
- ${ctx.runFolder}/artifacts/project-docs-report.txt

Task:
Produce ${ctx.runFolder}/artifacts/scaffold-plan.txt (artifact: ScaffoldPlan), a platform-neutral scaffold plan derived from the bootstrap bundle and project docs report.

The ScaffoldPlan must define:
- planned file groups (illustrative paths only; this stage does not create files)
- first runnable behavior
- setup commands
- validation commands
- test expectations
- documentation expectations
- unresolved decisions
- non-goals

Use the bootstrap bundle's scaffoldPlanningInputs (src/greenfield/bootstrap/bootstrapBundleTypes.ts) as the source of truth; do not invent structure beyond it.

Required output artifact: ScaffoldPlan
Output file: ${ctx.runFolder}/artifacts/scaffold-plan.txt

Stop conditions:
- do not write scaffold files
- do not install dependencies
- do not run project creation commands
- do not implement first vertical slice in this stage
- do not add file trees for a profile other than the one selected in the bootstrap bundle

Return format:
Produce the artifact as a plain-text file using the template:
  Artifact: ScaffoldPlan
  Workflow mode: greenfield
  Planned file groups: ...
  First runnable behavior: ...
  Setup commands: ...
  Validation commands: ...
  Test expectations: ...
  Documentation expectations: ...
  Unresolved decisions: ...
  Non-goals: ...
  Status: complete | incomplete | blocked
`;
}

export function renderScaffoldImplementationPrompt(ctx: GreenfieldPromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/bootstrap-bundle.json
- ${ctx.runFolder}/artifacts/project-docs-report.txt
- ${ctx.runFolder}/artifacts/scaffold-plan.txt

Task:
Implement the scaffold exactly as described in scaffold-plan.txt and record the result in ${ctx.runFolder}/reports/scaffold-implementation-report.txt (artifact: ScaffoldImplementationReport).

The ScaffoldImplementationReport must include:
- the selected profile id
- files changed, one normalized relative path per line (e.g. "- src/cli.ts")
- commands run, if any, one per line in the exact form
  "- <command text>: passed" / "- <command text>: failed" /
  "- <command text>: skipped, <nonblank reason>", using the command text
  exactly as it appears in the selected profile's setupCommands
- deviations from the scaffold plan
- blockers
- risks

Required output artifact: ScaffoldImplementationReport
Output file: ${ctx.runFolder}/reports/scaffold-implementation-report.txt

Stop conditions:
- do not claim verification success without command evidence
- do not broaden scope beyond scaffold-plan.txt
- do not add behavior for a profile other than the one selected in the bootstrap bundle

Return format:
Produce the artifact as a plain-text file using the template:
  Artifact: ScaffoldImplementationReport
  Workflow mode: greenfield
  Profile: <selected profile id>
  Files changed: ...
  Commands run: ...
  Deviations: ...
  Blockers: ...
  Risks: ...
  Status: complete | incomplete | blocked
`;
}
