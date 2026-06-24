import * as fs from 'fs';
import * as path from 'path';
import { WorkflowMode } from './types';
import { RunMetadata } from './run';
import { CorrectionRouteResult } from './correctionRouter';

interface PromptContext {
  stage: string;
  mode: WorkflowMode;
  runId: string;
  projectRoot: string;
  runFolder: string;
  stageNumber: number;
  totalStages: number;
  sourceRepoRoot?: string;
  targetRepoRoot?: string;
}

function header(ctx: PromptContext): string {
  const lines = [
    `Stage: ${ctx.stage}`,
    `Workflow mode: ${ctx.mode}`,
    `Run ID: ${ctx.runId}`,
    `Project root: ${ctx.projectRoot}`,
    `Run folder: ${ctx.runFolder}`,
  ];
  if (ctx.sourceRepoRoot) lines.push(`Source repository: ${ctx.sourceRepoRoot}`);
  if (ctx.targetRepoRoot) lines.push(`Target repository: ${ctx.targetRepoRoot}`);
  lines.push('');
  return lines.join('\n');
}

// ─── Core shared stages ───────────────────────────────────────────────────────

function requestBriefPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- original request: ${ctx.runFolder}/00-request.txt

Task:
Produce ${ctx.runFolder}/artifacts/request-brief.txt (artifact: RequestBrief).

The RequestBrief must define:
- original request (verbatim from 00-request.txt)
- requested change
- target area (project, component, workflow, or command) if identifiable
- user-visible or externally observable behavior
- constraints
- non-goals
- success criteria
- ambiguity or missing information
- expected next stage: architecture-context

Required output artifact: RequestBrief
Output file: ${ctx.runFolder}/artifacts/request-brief.txt

Stop conditions:
- do not inspect code deeply in this stage
- do not write pseudocode
- do not write tests
- do not implement code

Return format:
Produce the artifact as a plain-text file using the template:
  Artifact: RequestBrief
  Workflow mode: ...
  Original request: ...
  Requested change: ...
  Target area: ...
  User-visible or external behavior: ...
  Constraints: ...
  Non-goals: ...
  Success criteria: ...
  Ambiguity or missing information: ...
  Expected next stage: architecture-context
  Status: complete | incomplete | blocked
`;
}

function architectureContextPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- project root: ${ctx.projectRoot}

Task:
Retrieve bounded project context and synthesize it into the required workflow artifact.

Produce two output files:
1. Supporting retrieval report: ${ctx.runFolder}/reports/architecture-context-retrieval-report.txt
2. Required workflow artifact: ${ctx.runFolder}/artifacts/architecture-context-packet.txt (artifact: ArchitectureContextPacket)

Later workflow stages consume ArchitectureContextPacket.
Do not dump raw retrieval output directly into ArchitectureContextPacket.
Synthesize retrieval evidence into the artifact before writing it.

Graph-guided context acquisition sequence (when my-dev-kit is available):

Step 1 — Index or refresh the target repository:
  npx @dailephd/my-dev-kit index --root . --src src --out .my-dev-kit --call-graph --json

Step 2 — Search for task-specific candidate nodes:
  npx @dailephd/my-dev-kit search --index .my-dev-kit --query "<task-specific term>" --limit 20 --json
  Run multiple queries for different aspects of the request.

Step 3 — Look up selected nodes and their relationships:
  npx @dailephd/my-dev-kit lookup --index .my-dev-kit --node "<selected-node-id>" --depth 1 --json

Step 4 — Slice around the strongest relevant node:
  npx @dailephd/my-dev-kit slice --index .my-dev-kit --node "<strongest-node-id>" --depth 2 --direction both --out .my-dev-kit/<task-name>-slice.json --json

Step 5 — Retrieve exact symbol source (preferred):
  npx @dailephd/my-dev-kit source --index .my-dev-kit --node "<symbol-node-id>" --max-lines 160 --format numbered
  or:
  npx @dailephd/my-dev-kit source --index .my-dev-kit --file "<file-path>" --symbol "<symbol-name>" --max-lines 160 --format numbered

Step 6 — Use line-range retrieval only as fallback when symbol retrieval is insufficient:
  npx @dailephd/my-dev-kit source --index .my-dev-kit --file "<file-path>" --start <start-line> --end <end-line> --max-lines <cap> --format numbered

Step 7 — Inspect semantic artifacts, tests, docs, or data-model artifacts only when relevant to the task.

Step 8 — Avoid whole-file reading unless bounded retrieval is insufficient. If a whole file must be read, state why.

If my-dev-kit is unavailable, use focused manual inspection of relevant files and symbols. Document what was inspected, why, and what bounded context was gathered.

The ArchitectureContextPacket must identify:
- relevant files
- relevant symbols
- relevant components, modules, routes, commands, services, or data boundaries
- relevant tests
- relevant docs
- state owners and data owners
- upstream dependencies
- downstream consumers
- existing patterns to preserve
- likely files or modules involved in this change
- context gaps or uncertainty
- selection rationale for each major file or symbol chosen

Required output artifact: ArchitectureContextPacket
Output file: ${ctx.runFolder}/artifacts/architecture-context-packet.txt

Supporting report output file: ${ctx.runFolder}/reports/architecture-context-retrieval-report.txt

Stop conditions:
- do not redesign the feature
- do not write pseudocode
- do not implement code
- do not write test files
- do not claim implementation or test implementation work in this stage

Return format:

Write the supporting retrieval report using this template:

  Retrieval evidence report

  Index artifacts used:
  - Index directory:
  - Refreshed or reused:
  - manifest.json status:
  - Semantic artifacts available:

  Search queries run:
  - Query:
    Reason:

  Candidate nodes selected:
  - Node ID:
    Reason:

  Lookup commands run:
  - Node ID:
    Useful relationships found:

  Graph slices created:
  - Focus node:
  - Depth:
  - Direction:
  - Output path:
  - Reason:

  Source symbols retrieved:
  - Symbol node ID:
  - File path:
  - Reason:

  Line-range fallback retrieval used:
  - File path or none:
  - Lines:
  - Reason:

  Full files read beyond retrieved source:
  - File path or none:
  - Reason:
  - Missing context provided:

  Semantic artifacts inspected:
  - Artifact or command:
  - Reason:

  Context gaps or uncertainty:
  - Gap:
    Impact:

Then write ArchitectureContextPacket using this template:

  Artifact: ArchitectureContextPacket
  Workflow mode: ...
  Project root: ...

  Retrieval evidence used:
  - Retrieval report: ${ctx.runFolder}/reports/architecture-context-retrieval-report.txt
  - Index directory:
  - Graph slice files:
  - Source excerpts:
  - Semantic artifacts:

  Retrieval method:
  - my-dev-kit used: yes | no
  - graph-guided retrieval used: yes | no
  - manual inspection used: yes | no

  Relevant files: ...
  Relevant symbols: ...
  Relevant components / modules / commands / routes / services / boundaries: ...
  Relevant tests: ...
  Relevant docs: ...
  State owners: ...
  Data owners: ...
  Upstream dependencies: ...
  Downstream consumers: ...
  Existing patterns to preserve: ...
  Likely files or modules involved: ...
  Context gaps or uncertainty: ...
  Selection rationale: ...
  Expected next stage: (next in workflow)
  Status: complete | incomplete | blocked
`;
}

function behaviorModelPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

Task:
Produce ${ctx.runFolder}/artifacts/behavior-model.txt (artifact: BehaviorModel).

Define intended behavior before pseudocode, implementation, or test writing begins.

The BehaviorModel must define:
- behavior summary
- externally visible behavior
- internal supporting behavior
- state variables
- inputs
- events
- derived values
- invariants
- valid states
- invalid states
- boundaries and partitions
- empty states
- error states
- loading or pending states when relevant
- external contracts
- state transitions
- behavior to preserve
- behavior intentionally changed
- unresolved design questions

Trace IDs (optional):
Assign trace IDs to behaviors, invariants, and transitions to enable downstream traceability.
Format: BEH-001: description, INV-001: description, TRN-001: description.
If trace IDs are used, link related items using: FROM_ID -> TO_ID.
Use canonical format (PREFIX-NNN with 3+ digits). Run: my-dev-kit-orchestrator check --trace

Required output artifact: BehaviorModel
Output file: ${ctx.runFolder}/artifacts/behavior-model.txt

Stop conditions:
- do not write production code
- do not write test files
- do not produce implementation-specific code

Return format:
Produce the artifact as a plain-text file following the BehaviorModel template.
  Artifact: BehaviorModel
  Workflow mode: ...
  Inputs used: ...
  Behavior summary: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function pseudocodePacketPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt

Task:
Produce ${ctx.runFolder}/artifacts/pseudocode-packet.txt (artifact: PseudocodePacket).

Convert the BehaviorModel into implementation-neutral pseudocode.
This is the shared design contract for both implementation and testing.

The PseudocodePacket must define:
- behavior references
- data flow
- state flow
- state transitions
- derived-value rules
- validation rules
- empty-state handling
- error-state handling
- external contract handling
- component, module, service, route, command, or helper contracts
- acceptance criteria
- likely files or modules to modify
- implementation constraints
- assumptions preserved
- assumptions removed or guarded
- unresolved implementation questions

Trace IDs (optional):
Assign PSE-NNN trace IDs to pseudocode entries to enable downstream traceability.
Format: PSE-001: pseudocode entry. Link to behavior IDs using: BEH-001 -> PSE-001.
Use canonical format (PREFIX-NNN with 3+ digits). Run: my-dev-kit-orchestrator check --trace

Required output artifact: PseudocodePacket
Output file: ${ctx.runFolder}/artifacts/pseudocode-packet.txt

Stop conditions:
- do not write production code
- do not write test files
- do not modify files

Return format:
Produce the artifact as a plain-text file following the PseudocodePacket template.
  Artifact: PseudocodePacket
  Workflow mode: ...
  Inputs used: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function testStrategyPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt
- ${ctx.runFolder}/artifacts/pseudocode-packet.txt

Task:
Produce ${ctx.runFolder}/artifacts/test-strategy-packet.txt (artifact: TestStrategyPacket).

Derive test responsibilities from the BehaviorModel and PseudocodePacket.
Do not write test files in this stage.

The TestStrategyPacket must identify:
- behavior under test
- participating layers
- state variables
- events
- derived values
- invariants
- boundaries and partitions
- external contracts
- state transitions when relevant
- relevant failure modes
- existing tests
- test matrix
- test level assignment (unit / component / integration / end-to-end)
- required verification commands
- coverage gaps
- risks not covered and why

Each test responsibility must trace to at least one of:
- behavior
- invariant
- state transition
- derived value
- boundary
- external contract
- failure mode

Trace IDs (optional):
Assign TST-NNN trace IDs to test responsibilities to enable downstream traceability.
Format: TST-001: test responsibility. Link to behaviors or pseudocode: PSE-001 -> TST-001.
Use canonical format (PREFIX-NNN with 3+ digits). Run: my-dev-kit-orchestrator check --trace

Required output artifact: TestStrategyPacket
Output file: ${ctx.runFolder}/artifacts/test-strategy-packet.txt

Stop conditions:
- do not write test files in this stage
- do not write production code
- do not invent behavior not supported by prior artifacts
- do not include test responsibilities that cannot be traced to behavior, invariant, transition, derived value, boundary, contract, or failure mode

Return format:
Produce the artifact as a plain-text file following the TestStrategyPacket template.
  Artifact: TestStrategyPacket
  Workflow mode: ...
  Inputs used: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function implementationPrompt(ctx: PromptContext, extraInputs: string[] = []): string {
  const inputs = [
    `- ${ctx.runFolder}/artifacts/request-brief.txt`,
    `- ${ctx.runFolder}/artifacts/architecture-context-packet.txt`,
    `- ${ctx.runFolder}/artifacts/behavior-model.txt`,
    `- ${ctx.runFolder}/artifacts/pseudocode-packet.txt`,
    ...extraInputs.map((i) => `- ${ctx.runFolder}/artifacts/${i}`),
  ].join('\n');

  return `${header(ctx)}
Inputs:
${inputs}

Task:
Implement the PseudocodePacket in the current project and produce ${ctx.runFolder}/artifacts/implementation-report.txt (artifact: ImplementationReport).

Read required source files and implement from the PseudocodePacket.
Follow the architecture and patterns identified in the ArchitectureContextPacket.
Preserve the BehaviorModel.

The ImplementationReport must include:
- files read
- files changed
- behavior implemented
- pseudocode sections implemented
- assumptions preserved
- assumptions removed or guarded
- deviations from the PseudocodePacket
- reason for each deviation
- blockers encountered
- unresolved risks
- tests that should be run
- notes for the test implementation stage

Required output artifact: ImplementationReport
Output file: ${ctx.runFolder}/artifacts/implementation-report.txt

Stop conditions:
- do not broaden scope without reporting a blocker
- do not create parallel architecture
- do not claim verification success without command evidence
- do not ignore contradictions in prior artifacts
- do not modify files outside justified scope

Return format:
Produce the artifact as a plain-text file following the ImplementationReport template.
  Artifact: ImplementationReport
  Workflow mode: ...
  Inputs used: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function testImplementationPrompt(ctx: PromptContext, extraInputs: string[] = []): string {
  const inputs = [
    `- ${ctx.runFolder}/artifacts/behavior-model.txt`,
    `- ${ctx.runFolder}/artifacts/pseudocode-packet.txt`,
    `- ${ctx.runFolder}/artifacts/test-strategy-packet.txt`,
    ...extraInputs.map((i) => `- ${ctx.runFolder}/artifacts/${i}`),
    `- ${ctx.runFolder}/artifacts/implementation-report.txt (if available)`,
  ].join('\n');

  return `${header(ctx)}
Inputs:
${inputs}

Task:
Implement tests from the TestStrategyPacket and produce ${ctx.runFolder}/artifacts/test-implementation-report.txt (artifact: TestImplementationReport).

Follow the TestStrategyPacket. Do not invent a separate test strategy.

The TestImplementationReport must include:
- test files changed
- tests added
- tests updated
- behaviors covered
- invariants covered
- state transitions covered
- derived values covered
- boundaries covered
- external contracts covered
- failure modes covered
- TestStrategyPacket items not implemented
- reason for each missing test
- verification commands to run

Required output artifact: TestImplementationReport
Output file: ${ctx.runFolder}/artifacts/test-implementation-report.txt

Stop conditions:
- do not replace the TestStrategyPacket with a new unrelated strategy
- do not change production behavior unless reporting a blocker
- do not claim tests passed unless command evidence is included

Return format:
Produce the artifact as a plain-text file following the TestImplementationReport template.
  Artifact: TestImplementationReport
  Workflow mode: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function verificationPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/test-strategy-packet.txt
- ${ctx.runFolder}/artifacts/implementation-report.txt
- ${ctx.runFolder}/artifacts/test-implementation-report.txt

Task:
Run the required verification commands and produce ${ctx.runFolder}/artifacts/verification-report.txt (artifact: VerificationReport).

Use the commands identified in the TestStrategyPacket, ImplementationReport, and TestImplementationReport.
Run the narrowest relevant checks first, then broader validation.

The VerificationReport must include:
- commands run
- working directory for each command
- exit codes
- pass/fail status
- output summary
- failed tests if any
- skipped checks
- reason for skipped checks
- environment notes if relevant
- remaining verification gaps

Required output artifact: VerificationReport
Output file: ${ctx.runFolder}/artifacts/verification-report.txt

Stop conditions:
- do not claim checks passed unless command output was produced
- do not hide failed commands
- do not omit skipped required checks

Return format:
Produce the artifact as a plain-text file following the VerificationReport template.
  Artifact: VerificationReport
  Workflow mode: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function judgePrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt (or mode-specific entry artifact)
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt (or reconstruction)
- ${ctx.runFolder}/artifacts/pseudocode-packet.txt (or mode-specific equivalent)
- ${ctx.runFolder}/artifacts/test-strategy-packet.txt (or mode-specific strategy)
- ${ctx.runFolder}/artifacts/implementation-report.txt
- ${ctx.runFolder}/artifacts/test-implementation-report.txt
- ${ctx.runFolder}/artifacts/verification-report.txt

Task:
Review the implementation and tests against the workflow artifacts and produce ${ctx.runFolder}/artifacts/judge-report.txt (artifact: JudgeReport).

The JudgeReport must assess:
- implementation vs PseudocodePacket
- tests vs TestStrategyPacket
- behavior coverage
- architecture alignment
- scope control
- verification evidence
- risks and gaps
- trace link integrity (if trace IDs were used): check for orphan IDs, missing link targets,
  and malformed IDs by running: my-dev-kit-orchestrator check --trace
  Include trace check results or note that trace IDs were not used in this run.

Verdict must be one of:
  PASS | DESIGN_INCOMPLETE | PSEUDOCODE_INCOMPLETE | IMPLEMENTATION_MISMATCH |
  TEST_COVERAGE_INCOMPLETE | ARCHITECTURE_MISMATCH | NEED_CONTEXT | SCOPE_VIOLATION |
  NEED_VERIFICATION | BLOCKED

Required output artifact: JudgeReport
Output file: ${ctx.runFolder}/artifacts/judge-report.txt

Stop conditions:
- do not rewrite code
- do not approve without verification evidence
- do not hide uncertainty or gaps
- do not skip trace check if trace IDs are present in prior artifacts

Return format:
Produce the artifact as a plain-text file.
  Artifact: JudgeReport
  Workflow mode: ...
  Verdict: ...
  Recommended next stage if not PASS: ...
  Status: complete
`;
}

function finalReportPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/judge-report.txt
- ${ctx.runFolder}/artifacts/verification-report.txt
- ${ctx.runFolder}/artifacts/request-brief.txt (or mode-specific entry artifact)
- major design and implementation artifacts

Task:
Summarize the completed workflow and produce ${ctx.runFolder}/artifacts/final-report.txt (artifact: FinalReport).

The FinalReport must include:
- original request
- workflow mode
- run ID: ${ctx.runId}
- stages completed
- behavior designed
- architecture context used
- pseudocode summary
- tests designed
- implementation summary
- tests added or updated
- verification summary
- judge verdict
- unresolved risks
- follow-up recommendations if needed

Required output artifact: FinalReport
Output file: ${ctx.runFolder}/artifacts/final-report.txt

Stop conditions:
- do not exaggerate success
- do not omit failed or skipped verification
- do not hide unresolved risks

Return format:
Produce the artifact as a plain-text file following the FinalReport template.
  Artifact: FinalReport
  Workflow mode: ...
  Run ID: ...
  [all required sections]
  Status: complete
`;
}

// ─── Repair-specific stages ───────────────────────────────────────────────────

function observedBehaviorReportPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- original request / observed behavior description: ${ctx.runFolder}/00-request.txt

Task:
Produce ${ctx.runFolder}/artifacts/observed-behavior-report.txt (artifact: ObservedBehaviorReport).

Capture the wrong or unexpected behavior without jumping to code-level causes.

The ObservedBehaviorReport must define:
- observed behavior (verbatim or close description)
- expected behavior if known
- triggering action or system event
- visible output or runtime symptom
- affected workflow or area
- frequency or reproducibility
- evidence available
- uncertainty

Required output artifact: ObservedBehaviorReport
Output file: ${ctx.runFolder}/artifacts/observed-behavior-report.txt

Stop conditions:
- do not guess code-level causes yet
- do not write pseudocode
- do not write tests
- do not implement code

Return format:
Produce the artifact as a plain-text file following the ObservedBehaviorReport template.
  Artifact: ObservedBehaviorReport
  Observed behavior: ...
  Expected behavior: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function behaviorTracePrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/observed-behavior-report.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

Task:
Produce ${ctx.runFolder}/artifacts/behavior-trace.txt (artifact: BehaviorTrace).

Connect the observed behavior to the intended behavior model or pseudocode path.

The BehaviorTrace must identify:
- observed behavior reference
- matched behavior artifact if available
- matched behavior rule
- matched pseudocode section if available
- expected data flow
- expected state flow
- expected output
- missing design artifact if no match found

Required output artifact: BehaviorTrace
Output file: ${ctx.runFolder}/artifacts/behavior-trace.txt

Stop conditions:
- do not modify code
- do not write tests
- do not implement fixes yet

Return format:
  Artifact: BehaviorTrace
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function divergenceReportPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/observed-behavior-report.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/behavior-trace.txt

Task:
Produce ${ctx.runFolder}/artifacts/divergence-report.txt (artifact: DivergenceReport).

Identify the first point where actual behavior diverges from intended behavior.

The DivergenceReport must include:
- expected path
- actual path
- first divergence point
- affected layer
- evidence
- correction category (behavior design update / pseudocode update / implementation correction / test correction / external contract correction / runtime state ordering correction / artifact update)
- uncertainty

Required output artifact: DivergenceReport
Output file: ${ctx.runFolder}/artifacts/divergence-report.txt

Stop conditions:
- do not modify code
- do not implement fixes yet

Return format:
  Artifact: DivergenceReport
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function correctionDesignPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/observed-behavior-report.txt
- ${ctx.runFolder}/artifacts/behavior-trace.txt
- ${ctx.runFolder}/artifacts/divergence-report.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

Task:
Produce ${ctx.runFolder}/artifacts/correction-design.txt (artifact: CorrectionDesign).

Define how the system should be corrected before implementation.

The CorrectionDesign must include:
- correction goal
- artifact to update if any
- code behavior to change
- tests to add or update
- acceptance criteria
- risks

Required output artifact: CorrectionDesign
Output file: ${ctx.runFolder}/artifacts/correction-design.txt

Stop conditions:
- do not implement code in this stage
- do not write test files

Return format:
  Artifact: CorrectionDesign
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function regressionTestStrategyPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/divergence-report.txt
- ${ctx.runFolder}/artifacts/correction-design.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

Task:
Produce ${ctx.runFolder}/artifacts/regression-test-strategy.txt (artifact: RegressionTestStrategy).

Define tests that prove the observed divergence cannot recur and cover related behavior.

The RegressionTestStrategy must include:
- divergence being protected against
- behavior or pseudocode rule being protected
- regression test responsibilities
- related boundary or transition coverage
- verification commands

Each test responsibility must trace to behavior, invariant, transition, derived value, boundary, contract, or failure mode.
Do not write test files in this stage.

Required output artifact: RegressionTestStrategy
Output file: ${ctx.runFolder}/artifacts/regression-test-strategy.txt

Stop conditions:
- do not write test files in this stage
- do not implement code

Return format:
  Artifact: RegressionTestStrategy
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

// ─── Test-mode-specific stages ────────────────────────────────────────────────

function testTargetBriefPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- original test target description: ${ctx.runFolder}/00-request.txt

Task:
Produce ${ctx.runFolder}/artifacts/test-target-brief.txt (artifact: TestTargetBrief).

Define the target of this test-design or test-implementation run.

The TestTargetBrief must include:
- test target
- target behavior or workflow
- whether code changes are allowed
- desired test depth
- constraints
- success criteria

Required output artifact: TestTargetBrief
Output file: ${ctx.runFolder}/artifacts/test-target-brief.txt

Stop conditions:
- do not write test files yet
- do not implement code
- do not write pseudocode

Return format:
  Artifact: TestTargetBrief
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function behaviorReconstructionPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/test-target-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

Task:
Produce ${ctx.runFolder}/artifacts/behavior-reconstruction.txt (artifact: BehaviorReconstruction).

Reconstruct behavior for the target feature when no BehaviorModel exists yet.

The BehaviorReconstruction must include:
- observed existing behavior
- current architecture evidence
- state variables
- events
- derived values
- invariants
- external contracts
- uncertainty

Required output artifact: BehaviorReconstruction
Output file: ${ctx.runFolder}/artifacts/behavior-reconstruction.txt

Stop conditions:
- do not write test files
- do not implement code

Return format:
  Artifact: BehaviorReconstruction
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function pseudocodeSummaryPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/test-target-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/behavior-reconstruction.txt

Task:
Produce ${ctx.runFolder}/artifacts/pseudocode-summary.txt (artifact: PseudocodeSummary).

Summarize existing implementation behavior in pseudocode form when no full PseudocodePacket exists.

The PseudocodeSummary must include:
- implementation-neutral behavior summary
- data flow
- state flow
- derived values
- validation rules
- error or empty state handling
- uncertainty

Required output artifact: PseudocodeSummary
Output file: ${ctx.runFolder}/artifacts/pseudocode-summary.txt

Stop conditions:
- do not write test files
- do not implement code

Return format:
  Artifact: PseudocodeSummary
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

// ─── Refactor-mode-specific stages ───────────────────────────────────────────

function refactorBriefPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- original refactor goal: ${ctx.runFolder}/00-request.txt

Task:
Produce ${ctx.runFolder}/artifacts/refactor-brief.txt (artifact: RefactorBrief).

Define the intended code-structure change and behavior-preservation requirement.

The RefactorBrief must include:
- refactor goal
- behavior that must remain unchanged
- target area
- constraints
- non-goals
- success criteria

Required output artifact: RefactorBrief
Output file: ${ctx.runFolder}/artifacts/refactor-brief.txt

Stop conditions:
- do not inspect code deeply
- do not write pseudocode
- do not implement code
- do not write tests

Return format:
  Artifact: RefactorBrief
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function existingBehaviorMapPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/refactor-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

Task:
Produce ${ctx.runFolder}/artifacts/existing-behavior-map.txt (artifact: ExistingBehaviorMap).

Map the behavior that must remain stable during the refactor.

The ExistingBehaviorMap must include:
- current behaviors
- state variables
- events
- derived values
- invariants
- external contracts
- existing tests
- behavior gaps

Required output artifact: ExistingBehaviorMap
Output file: ${ctx.runFolder}/artifacts/existing-behavior-map.txt

Stop conditions:
- do not implement code
- do not write tests
- do not write pseudocode

Return format:
  Artifact: ExistingBehaviorMap
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function preservedInvariantListPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/refactor-brief.txt
- ${ctx.runFolder}/artifacts/existing-behavior-map.txt

Task:
Produce ${ctx.runFolder}/artifacts/preserved-invariant-list.txt (artifact: PreservedInvariantList).

Define what must remain true after the refactor.

The PreservedInvariantList must include:
- invariants to preserve
- affected code areas
- tests protecting each invariant
- missing tests

Required output artifact: PreservedInvariantList
Output file: ${ctx.runFolder}/artifacts/preserved-invariant-list.txt

Stop conditions:
- do not implement code
- do not write test files yet

Return format:
  Artifact: PreservedInvariantList
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function compatibilityTestStrategyPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/existing-behavior-map.txt
- ${ctx.runFolder}/artifacts/preserved-invariant-list.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

Task:
Produce ${ctx.runFolder}/artifacts/compatibility-test-strategy.txt (artifact: CompatibilityTestStrategy).

Define tests that prove the refactor preserved behavior.

The CompatibilityTestStrategy must include:
- preserved behavior
- compatibility test responsibilities
- existing tests to run
- new tests needed
- verification commands

Each test responsibility must trace to behavior, invariant, transition, derived value, boundary, contract, or failure mode.
Do not write test files in this stage.

Required output artifact: CompatibilityTestStrategy
Output file: ${ctx.runFolder}/artifacts/compatibility-test-strategy.txt

Stop conditions:
- do not write test files in this stage
- do not implement code

Return format:
  Artifact: CompatibilityTestStrategy
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function refactorPseudocodePacketPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/refactor-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/existing-behavior-map.txt
- ${ctx.runFolder}/artifacts/preserved-invariant-list.txt
- ${ctx.runFolder}/artifacts/compatibility-test-strategy.txt

Task:
Produce ${ctx.runFolder}/artifacts/refactor-pseudocode-packet.txt (artifact: RefactorPseudocodePacket).

Define the implementation-neutral design for the refactor. Preserve the behavior identified in ExistingBehaviorMap.

The RefactorPseudocodePacket must include:
- target structure
- data flow changes
- invariants preserved
- files allowed to change
- component or module contracts
- acceptance criteria
- assumptions preserved
- unresolved implementation questions

Required output artifact: RefactorPseudocodePacket
Output file: ${ctx.runFolder}/artifacts/refactor-pseudocode-packet.txt

Stop conditions:
- do not write production code
- do not write test files
- do not modify files

Return format:
  Artifact: RefactorPseudocodePacket
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

// ─── Harden-mode-specific stages ─────────────────────────────────────────────

function hardeningBriefPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- original hardening goal: ${ctx.runFolder}/00-request.txt

Task:
Produce ${ctx.runFolder}/artifacts/hardening-brief.txt (artifact: HardeningBrief).

Define the robustness or failure-handling improvement requested.

The HardeningBrief must include:
- hardening goal
- target behavior or boundary
- current risk
- constraints
- success criteria

Required output artifact: HardeningBrief
Output file: ${ctx.runFolder}/artifacts/hardening-brief.txt

Stop conditions:
- do not inspect code deeply
- do not write pseudocode
- do not implement code
- do not write tests

Return format:
  Artifact: HardeningBrief
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function assumptionReportPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/hardening-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

Task:
Produce ${ctx.runFolder}/artifacts/assumption-report.txt (artifact: AssumptionReport).

Identify assumptions currently made by the code or design.

For each assumption include:
- assumption statement
- source of assumption
- where it is used
- what breaks if false
- decision (preserve / remove / validate / guard)
- required follow-up

Required output artifact: AssumptionReport
Output file: ${ctx.runFolder}/artifacts/assumption-report.txt

Stop conditions:
- do not implement code
- do not write tests

Return format:
  Artifact: AssumptionReport
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function failureModeMatrixPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/hardening-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/assumption-report.txt

Task:
Produce ${ctx.runFolder}/artifacts/failure-mode-matrix.txt (artifact: FailureModeMatrix).

Classify realistic ways the behavior can fail and decide how each should be handled.

For each failure mode include:
- failure mode
- category (input / state / contract / parser / storage / async / rendering / data volume / configuration / environment)
- trigger
- affected layer
- current behavior
- desired behavior
- handling strategy (prevent / recover / surface to user / log / retry / ignore safely / fail fast)
- required code change
- required test
- priority

Required output artifact: FailureModeMatrix
Output file: ${ctx.runFolder}/artifacts/failure-mode-matrix.txt

Stop conditions:
- do not implement code
- do not write tests yet

Return format:
  Artifact: FailureModeMatrix
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function guardPseudocodePacketPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/hardening-brief.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/assumption-report.txt
- ${ctx.runFolder}/artifacts/failure-mode-matrix.txt

Task:
Produce ${ctx.runFolder}/artifacts/guard-pseudocode-packet.txt (artifact: GuardPseudocodePacket).

Define pseudocode for validation, guards, recovery paths, and error or empty states.

The GuardPseudocodePacket must include:
- assumptions being guarded
- failure modes handled
- validation rules
- guard rules
- recovery behavior
- error-state behavior
- acceptance criteria

Required output artifact: GuardPseudocodePacket
Output file: ${ctx.runFolder}/artifacts/guard-pseudocode-packet.txt

Stop conditions:
- do not write production code
- do not write test files
- do not modify files

Return format:
  Artifact: GuardPseudocodePacket
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function resilienceTestStrategyPrompt(ctx: PromptContext): string {
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/assumption-report.txt
- ${ctx.runFolder}/artifacts/failure-mode-matrix.txt
- ${ctx.runFolder}/artifacts/guard-pseudocode-packet.txt
- ${ctx.runFolder}/artifacts/architecture-context-packet.txt

Task:
Produce ${ctx.runFolder}/artifacts/resilience-test-strategy.txt (artifact: ResilienceTestStrategy).

Define tests that verify hardening behavior.

The ResilienceTestStrategy must include:
- assumptions tested
- failure modes tested
- validation tests
- guard tests
- recovery tests
- error-state tests
- verification commands
- remaining risks

Each test responsibility must trace to assumption, failure mode, boundary, contract, or behavior.
Do not write test files in this stage.

Required output artifact: ResilienceTestStrategy
Output file: ${ctx.runFolder}/artifacts/resilience-test-strategy.txt

Stop conditions:
- do not write test files in this stage
- do not implement code

Return format:
  Artifact: ResilienceTestStrategy
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

// ─── Extraction-mode-specific stages ─────────────────────────────────────────

function extractionRequestBriefPrompt(ctx: PromptContext): string {
  const sourceDir = ctx.sourceRepoRoot ?? '<source-repo-root>';
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- original extraction request: ${ctx.runFolder}/00-request.txt

Task:
Produce ${ctx.runFolder}/artifacts/request-brief.txt (artifact: ExtractionRequestBrief).

Extraction guardrails:
- The source repository is evidence, not destiny. Do not port code just because it exists.
- Do not start by copying files from source to target.
- Do not assume the source architecture is the desired target architecture.
- Do not implement anything in the target repository in this stage.

The ExtractionRequestBrief must define:
- original request (verbatim from 00-request.txt)
- source repository: ${sourceDir}
- target repository: ${targetDir}
- workflow or feature to extract
- desired target scope (what should exist in the target when complete)
- features explicitly excluded from the extraction
- critical behaviors to preserve from the source workflow
- expected deliverables
- constraints
- success criteria
- ambiguity or missing information
- expected next stage: source-architecture-context

Required output artifact: ExtractionRequestBrief
Output file: ${ctx.runFolder}/artifacts/request-brief.txt

Stop conditions:
- do not inspect source code deeply in this stage
- do not write pseudocode
- do not write tests
- do not start implementing in this stage
- do not port files

Return format:
Produce the artifact as a plain-text file using this template:
  Artifact: ExtractionRequestBrief
  Workflow mode: extraction
  Original request: ...
  Source repository: ${sourceDir}
  Target repository: ${targetDir}
  Workflow or feature to extract: ...
  Desired target scope: ...
  Excluded features: ...
  Critical behaviors to preserve: ...
  Expected deliverables: ...
  Constraints: ...
  Success criteria: ...
  Ambiguity or missing information: ...
  Expected next stage: source-architecture-context
  Status: complete | incomplete | blocked
`;
}

function sourceArchitectureContextPrompt(ctx: PromptContext): string {
  const sourceDir = ctx.sourceRepoRoot ?? '<source-repo-root>';
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- source repository: ${sourceDir}

Task:
Use my-dev-kit to inspect the source repository and produce a supporting retrieval report and source architecture context artifact.

Produce two output files:
1. Supporting retrieval report: ${ctx.runFolder}/reports/source-architecture-context-retrieval-report.txt
2. Required workflow artifact: ${ctx.runFolder}/artifacts/source-architecture-context-packet.txt (artifact: SourceArchitectureContextPacket)

Extraction guardrails:
- The source repository is evidence, not destiny. Do not port code just because it exists.
- Do not start by reading whole source files.
- Do not use target repository indexing to infer source behavior.
- Do not modify the source repository.
- Do not decide porting strategy in this stage.
- Do not modify the target repository in this stage.
- Source and target index directories must stay separate.

Source repository inspection sequence (when my-dev-kit is available):

Step 1 — Index the source repository into its own index directory:
  npx @dailephd/my-dev-kit index --root ${sourceDir} --src src --out ${sourceDir}/.my-dev-kit --call-graph --json

  Do not use ${targetDir}/.my-dev-kit to infer source behavior.

Step 2 — Search for task-specific candidate nodes in the source repository:
  npx @dailephd/my-dev-kit search --index ${sourceDir}/.my-dev-kit --query "<task-specific term>" --limit 20 --json
  Run multiple queries for different aspects of the extraction request.

Step 3 — Look up selected nodes and their relationships:
  npx @dailephd/my-dev-kit lookup --index ${sourceDir}/.my-dev-kit --node "<selected-node-id>" --depth 1 --json

Step 4 — Slice around the strongest relevant node:
  npx @dailephd/my-dev-kit slice --index ${sourceDir}/.my-dev-kit --node "<strongest-node-id>" --depth 2 --direction both --json

Step 5 — Retrieve exact symbol source (preferred):
  npx @dailephd/my-dev-kit source --index ${sourceDir}/.my-dev-kit --node "<symbol-node-id>" --max-lines 160 --format numbered

Step 6 — Use line-range retrieval only as fallback when symbol retrieval is insufficient:
  npx @dailephd/my-dev-kit source --index ${sourceDir}/.my-dev-kit --file "<file-path>" --start <start-line> --end <end-line> --max-lines 220 --format numbered

Step 7 — Avoid reading whole source files unless bounded retrieval is insufficient. If a whole file must be read, state why.

If my-dev-kit is unavailable, use focused manual inspection of relevant files and symbols in the source repository. Document what was inspected and why.

The SourceArchitectureContextPacket must identify relevant source architecture context without deciding what to port.

Required output artifact: SourceArchitectureContextPacket
Output file: ${ctx.runFolder}/artifacts/source-architecture-context-packet.txt

Supporting report output file: ${ctx.runFolder}/reports/source-architecture-context-retrieval-report.txt

Stop conditions:
- do not decide porting strategy in this stage
- do not write pseudocode
- do not start implementing in this stage
- do not write test files
- do not modify source or target repositories

Return format:

Write the supporting retrieval report using this template:

  Source retrieval evidence report

  Source repository: ${sourceDir}
  Index directory: ${sourceDir}/.my-dev-kit

  Refreshed or reused:
  manifest.json status:
  Semantic artifacts available:

  Search queries run:
  - Query:
    Reason:

  Candidate nodes selected:
  - Node ID:
    Reason:

  Lookup commands run:
  - Node ID:
    Useful relationships found:

  Graph slices created:
  - Focus node:
  - Depth:
  - Direction:
  - Reason:

  Source symbols retrieved:
  - Symbol node ID:
  - File path:
  - Reason:

  Full files read beyond retrieved source:
  - File path or none:
  - Reason:

  Context gaps or uncertainty:
  - Gap:
    Impact:

Then write SourceArchitectureContextPacket using this template:

  Artifact: SourceArchitectureContextPacket
  Workflow mode: extraction
  Source repository: ${sourceDir}

  Relevant source files: ...
  Relevant source symbols: ...
  Relevant source components / modules / routes / services: ...
  Source data contracts: ...
  Source persistence dependencies: ...
  Source external service dependencies: ...
  Source state owners: ...
  Source tests found: ...
  Source patterns: ...
  Context gaps or uncertainty: ...
  Expected next stage: source-workflow-map
  Status: complete | incomplete | blocked
`;
}

function sourceWorkflowMapPrompt(ctx: PromptContext): string {
  const sourceDir = ctx.sourceRepoRoot ?? '<source-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/source-architecture-context-packet.txt
- source repository (read-only evidence): ${sourceDir}

Task:
Produce ${ctx.runFolder}/artifacts/source-workflow-map.txt (artifact: SourceWorkflowMap).

This stage describes what exists in the source repository. It does not decide what to port.

Extraction guardrails:
- The source repository is evidence, not destiny. Do not port code just because it exists.
- Do not decide porting strategy in this stage.
- Do not start by copying files.
- Do not modify the source repository.
- Do not modify the target repository in this stage.
- do not start implementing in this stage.

Required sections for SourceWorkflowMap:
- Source repo path
- Workflow entry point
- User-facing steps
- Frontend components
- Frontend state owners
- API routes
- Backend services
- Data contracts
- Persistence dependencies
- External service dependencies
- Tests found
- Known behavior risks
- Ambiguous or missing context

Required output artifact: SourceWorkflowMap
Output file: ${ctx.runFolder}/artifacts/source-workflow-map.txt

Stop conditions:
- do not include porting decisions
- do not include implementation plans
- do not include target architecture details
- do not write pseudocode
- do not implement code
- do not write test files
- completion criteria: all required sections are present; the map describes what exists in the source, not what should be built in the target

Return format:
Produce the artifact as a plain-text file using this template:

  Artifact: SourceWorkflowMap
  Workflow mode: extraction
  Source repo path: ${sourceDir}
  Workflow entry point: <entry point file or component>

  User-facing steps:
  1. <step>
  2. <step>

  Frontend components: <list>
  Frontend state owners: <list>

  API routes: <list>
  Backend services: <list>
  Data contracts: <list>

  Persistence dependencies: <list>
  External service dependencies: <list>

  Tests found: <list>

  Known behavior risks:
  - <risk>

  Ambiguous or missing context:
  - <gap>

  Status: complete | incomplete | blocked
`;
}

function portingMapPrompt(ctx: PromptContext): string {
  const sourceDir = ctx.sourceRepoRoot ?? '<source-repo-root>';
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/source-architecture-context-packet.txt
- ${ctx.runFolder}/artifacts/source-workflow-map.txt

Task:
Produce TWO output files:
1. ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt (artifact: SourceToTargetPortingMap)
2. ${ctx.runFolder}/artifacts/do-not-port-list.txt (artifact: DoNotPortList)

Classify each source subsystem as: port as-is, port with refactor, rewrite cleanly, discard, or postpone.
Explicitly list every source system that must not be ported.

Extraction guardrails:
- The source repository is evidence, not destiny. Do not port code just because it exists.
- Do not create a second copy of the old architecture inside the target project.
- Do not port authentication, persistence, workspaces, database schema, background jobs, or downstream workflows unless explicitly in scope.
- Do not preserve old UI labels if they conflict with the new workflow.
- do not start implementing in this stage.
- Do not modify source or target repositories.

SourceToTargetPortingMap required structure for each item:
- Source behavior
- Source files or symbols
- Target behavior
- Target module or component (planned target location in ${targetDir})
- Decision: port as-is | port with refactor | rewrite cleanly | discard | postpone
- Reason
- Required tests
- Risks

DoNotPortList required sections:
- Systems excluded from the target project
- UI labels excluded from the target project
- Backend routes excluded from the target project
- Persistence layers excluded from the target project
- Downstream workflows excluded from the target project
- Reason each exclusion exists
- Consequences if accidentally ported

Completion criteria:
- Every significant source subsystem has a documented decision in SourceToTargetPortingMap
- Every discarded subsystem also appears in DoNotPortList
- Both artifact files must be present before the next stage can proceed

Required output artifact: SourceToTargetPortingMap
Output file: ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt

Required output artifact: DoNotPortList
Output file: ${ctx.runFolder}/artifacts/do-not-port-list.txt

Stop conditions:
- do not include implementation code
- do not start implementing
- do not write test files
- do not modify source or target repositories

Return format:
Produce both artifacts as plain-text files.

SourceToTargetPortingMap template:

  Artifact: SourceToTargetPortingMap
  Workflow mode: extraction
  Source repository: ${sourceDir}
  Target repository: ${targetDir}

  --- Item ---
  Source behavior: <description>
  Source files or symbols: <list>
  Target behavior: <description>
  Target module or component: <planned target location>
  Decision: <port as-is | port with refactor | rewrite cleanly | discard | postpone>
  Reason: <explanation>
  Required tests: <list>
  Risks: <list>

  --- Item ---
  ...

  Status: complete | incomplete | blocked

DoNotPortList template:

  Artifact: DoNotPortList
  Workflow mode: extraction
  Source repository: ${sourceDir}
  Target repository: ${targetDir}

  Systems excluded from the target project:
  - <system name>: <reason>

  UI labels excluded:
  - <label>: <reason for exclusion>

  Backend routes excluded:
  - <route>: <reason>

  Persistence layers excluded:
  - <persistence layer>: <reason>

  Downstream workflows excluded:
  - <workflow>: <reason>

  Consequences if accidentally ported:
  - <consequence>

  Status: complete | incomplete | blocked
`;
}

function goldenBehaviorContractPrompt(ctx: PromptContext): string {
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/source-workflow-map.txt
- ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt
- ${ctx.runFolder}/artifacts/do-not-port-list.txt

Task:
Produce ${ctx.runFolder}/artifacts/golden-behavior-contract.txt (artifact: GoldenBehaviorContract).

Define the exact behavior that the target implementation must satisfy.
This is the primary source of truth for the target implementation and the judge stage.
No production implementation should begin before this artifact exists.

Extraction guardrails:
- Do not include source implementation details as requirements.
- Do not include source file paths or source architecture references as requirements.
- Do not reference source architecture as the target design.
- do not start implementing in this stage.
- Do not modify source or target repositories in this stage.
- The source repository is evidence. This artifact defines what must be true in the target, not what exists in the source.

Required sections:
- User-visible behavior
- API behavior
- State behavior
- Sorting and ranking behavior
- Pagination behavior
- Selection behavior
- Error and empty-state behavior
- Edge cases
- Non-negotiable regression tests
- Acceptance criteria

For fragile or complex workflows, define specific testable statements. Examples:
- Search results must be ordered by relevance descending.
- Page-size options must be 10, 30, 50, and 100.
- Pagination must use Previous, numbered pages, ellipsis, last page, and Next.
- Selection must be stored by stable item ID, not page index.
- Select all current page must select only visible page items.
- Deselect all current page must deselect only visible page items.
- Automatic mode must use top N valid ranked results, not the first N visible rows.
- Manual mode must use only user-selected items.
- Changing page size must preserve valid selections.
- Out-of-range pages must be clamped.

Completion criteria:
- Every user-visible behavior item is described precisely enough that a developer could implement it without reading the source repository.
- Every non-negotiable regression test is listed.

Required output artifact: GoldenBehaviorContract
Output file: ${ctx.runFolder}/artifacts/golden-behavior-contract.txt

Stop conditions:
- do not write pseudocode
- do not write test files
- do not implement code
- do not reference source architecture as the target design

Return format:
Produce the artifact as a plain-text file using this template:

  Artifact: GoldenBehaviorContract
  Workflow mode: extraction
  Target repository: ${targetDir}

  User-visible behavior:
  1. <behavior>
  2. <behavior>

  API behavior:
  - <endpoint>: <contract>

  State behavior:
  - <state item>: <contract>

  Sorting and ranking behavior:
  - <rule>

  Pagination behavior:
  - <rule>

  Selection behavior:
  - <rule>

  Error and empty-state behavior:
  - <case>: <expected result>

  Edge cases:
  - <case>: <expected result>

  Non-negotiable regression tests:
  1. <test description>
  2. <test description>

  Acceptance criteria:
  - <criterion>

  Status: complete | incomplete | blocked
`;
}

function targetArchitecturePrompt(ctx: PromptContext): string {
  const sourceDir = ctx.sourceRepoRoot ?? '<source-repo-root>';
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt
- ${ctx.runFolder}/artifacts/do-not-port-list.txt
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt

Task:
Produce ${ctx.runFolder}/artifacts/target-architecture-proposal.txt (artifact: TargetArchitectureProposal).

Describe the clean target architecture before implementation begins.

Extraction guardrails:
- Do not carry source implementation details forward without an explicit porting decision.
- Do not include any architecture items from the DoNotPortList.
- do not start implementing in this stage.
- The proposal must be sufficient for implementation to begin without consulting the source repository again.
- Every item must map back to the SourceToTargetPortingMap or be a new target-side concern.

If the target repository already exists, use my-dev-kit to inspect it separately from the source repository:
  npx @dailephd/my-dev-kit index --root ${targetDir} --src src --out ${targetDir}/.my-dev-kit --call-graph --json
  npx @dailephd/my-dev-kit search --index ${targetDir}/.my-dev-kit --query "<task term>" --limit 20 --json

Do not mix source (${sourceDir}/.my-dev-kit) and target (${targetDir}/.my-dev-kit) retrieval results.

If the target repository does not exist yet, define the planned structure and contracts before any scaffolding begins.

Required sections:
- Target repo path
- Target project purpose
- Target workflow
- Frontend components
- Backend services
- API routes
- Shared contracts
- State ownership
- Persistence policy
- External dependencies
- Testing strategy overview
- Source components reused
- Source components rewritten
- Source components discarded
- Architecture guardrails

Required output artifact: TargetArchitectureProposal
Output file: ${ctx.runFolder}/artifacts/target-architecture-proposal.txt

Stop conditions:
- do not write production code
- do not write test files
- do not include items from DoNotPortList
- do not reference source implementation without a porting decision

Return format:
Produce the artifact as a plain-text file using this template:

  Artifact: TargetArchitectureProposal
  Workflow mode: extraction
  Target repo path: ${targetDir}
  Target project purpose: <description>

  Target workflow:
  1. <step>
  2. <step>

  Frontend components: <list>
  Backend services: <list>
  API routes: <list>
  Shared contracts: <list>

  State ownership:
  - <state>: owned by <component>

  Persistence policy: <description>
  External dependencies: <list>

  Testing strategy overview: <description>

  Source components reused: <list>
  Source components rewritten: <list>
  Source components discarded: <list>

  Architecture guardrails:
  - <guardrail>

  Status: complete | incomplete | blocked
`;
}

function extractionBehaviorModelPrompt(ctx: PromptContext): string {
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/target-architecture-proposal.txt
- ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt

Task:
Produce ${ctx.runFolder}/artifacts/behavior-model.txt (artifact: BehaviorModel).

Use the GoldenBehaviorContract as the primary source of truth for the target behavior.
Map behavior to the target system in ${targetDir}, not to the source architecture.

Extraction guardrails:
- Do not use source implementation details as the behavior definition.
- Do not port behavior not listed in the SourceToTargetPortingMap or GoldenBehaviorContract.
- do not start implementing in this stage.
- Do not write test files.

The BehaviorModel must define:
- behavior summary (target system only)
- externally visible behavior
- internal supporting behavior
- state variables
- inputs
- events
- derived values
- invariants
- valid states
- invalid states
- boundaries and partitions
- empty states
- error states
- loading or pending states when relevant
- external contracts
- state transitions
- behavior from the GoldenBehaviorContract to preserve
- behavior intentionally changed from source
- unresolved design questions

Required output artifact: BehaviorModel
Output file: ${ctx.runFolder}/artifacts/behavior-model.txt

Stop conditions:
- do not write production code
- do not write test files
- do not produce source architecture in behavior descriptions

Return format:
Produce the artifact as a plain-text file following the BehaviorModel template.
  Artifact: BehaviorModel
  Workflow mode: extraction
  Target repository: ${targetDir}
  Inputs used: ...
  Behavior summary: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function extractionPseudocodePacketPrompt(ctx: PromptContext): string {
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/target-architecture-proposal.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt

Task:
Produce ${ctx.runFolder}/artifacts/pseudocode-packet.txt (artifact: PseudocodePacket).

Convert the BehaviorModel into implementation-neutral pseudocode for the target system.
Map to the target architecture in ${targetDir}, not to the source architecture.
This is the shared design contract for both implementation and testing.

Extraction guardrails:
- Do not copy source implementation code into this artifact.
- Do not reference source module paths as the target module paths.
- Do not port patterns from the DoNotPortList.
- do not start implementing in this stage.

The PseudocodePacket must define:
- behavior references (from GoldenBehaviorContract)
- data flow
- state flow
- state transitions
- derived-value rules
- validation rules
- empty-state handling
- error-state handling
- external contract handling
- target component, module, service, route, command, or helper contracts
- acceptance criteria
- likely files or modules to create or modify in the target repository
- implementation constraints
- assumptions preserved
- unresolved implementation questions

Required output artifact: PseudocodePacket
Output file: ${ctx.runFolder}/artifacts/pseudocode-packet.txt

Stop conditions:
- do not write production code
- do not write test files
- do not modify source or target repositories

Return format:
Produce the artifact as a plain-text file following the PseudocodePacket template.
  Artifact: PseudocodePacket
  Workflow mode: extraction
  Target repository: ${targetDir}
  Inputs used: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function extractionTestStrategyPrompt(ctx: PromptContext): string {
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/target-architecture-proposal.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt
- ${ctx.runFolder}/artifacts/pseudocode-packet.txt

Task:
Produce ${ctx.runFolder}/artifacts/test-strategy-packet.txt (artifact: TestStrategyPacket).

Derive test responsibilities from the GoldenBehaviorContract, BehaviorModel, and PseudocodePacket.
All tests must target the target repository in ${targetDir}.
Do not write test files in this stage.

Extraction guardrails:
- Do not test source repository behavior.
- Do not write test files in this stage.
- Do not start implementing code.

The TestStrategyPacket must include:
- contract tests (from GoldenBehaviorContract)
- backend unit tests
- frontend component tests
- state behavior tests
- integration tests
- E2E tests for the full extracted workflow
- regression tests for every non-negotiable item in the GoldenBehaviorContract
- behavior under test
- participating layers
- state variables
- events
- derived values
- invariants
- boundaries and partitions
- external contracts
- relevant failure modes
- test matrix
- test level assignment (unit / component / integration / end-to-end)
- required verification commands
- coverage gaps

Each test responsibility must trace to at least one of:
- golden behavior contract item
- behavior
- invariant
- state transition
- derived value
- boundary
- external contract
- failure mode

Required output artifact: TestStrategyPacket
Output file: ${ctx.runFolder}/artifacts/test-strategy-packet.txt

Stop conditions:
- do not write test files in this stage
- do not write production code
- do not invent behavior not in GoldenBehaviorContract or BehaviorModel

Return format:
Produce the artifact as a plain-text file following the TestStrategyPacket template.
  Artifact: TestStrategyPacket
  Workflow mode: extraction
  Target repository: ${targetDir}
  Inputs used: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function extractionImplementationPrompt(ctx: PromptContext): string {
  const sourceDir = ctx.sourceRepoRoot ?? '<source-repo-root>';
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/target-architecture-proposal.txt
- ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt
- ${ctx.runFolder}/artifacts/do-not-port-list.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt
- ${ctx.runFolder}/artifacts/pseudocode-packet.txt

Task:
Implement the extracted workflow in the target repository and produce ${ctx.runFolder}/artifacts/implementation-report.txt (artifact: ImplementationReport).

Implement in ${targetDir} only. The source repository (${sourceDir}) is read-only evidence.
Use the GoldenBehaviorContract as the implementation source of truth.
Follow the TargetArchitectureProposal and PseudocodePacket.

Extraction guardrails:
- Implement only in the target repository (${targetDir}) unless source repository changes are explicitly permitted by the request brief.
- Do not copy files directly from source to target.
- Do not port systems listed in the DoNotPortList.
- Do not import source repository modules into the target.
- Do not assume source architecture is the required target architecture.
- The GoldenBehaviorContract defines what must be true — not the source code.

The ImplementationReport must include:
- files read (source and target)
- files created or changed (target only)
- behavior implemented (must map to GoldenBehaviorContract items)
- pseudocode sections implemented
- porting decisions applied (from SourceToTargetPortingMap)
- systems excluded (from DoNotPortList)
- deviations from the PseudocodePacket and reason for each
- source repository changes made, if any (normally: none)
- blockers encountered
- unresolved risks
- tests that should be run
- notes for the test implementation stage

Required output artifact: ImplementationReport
Output file: ${ctx.runFolder}/artifacts/implementation-report.txt

Stop conditions:
- do not port DoNotPortList systems
- do not modify the source repository unless explicitly allowed by the request brief
- do not claim verification success without command evidence
- do not broaden scope without reporting a blocker

Return format:
Produce the artifact as a plain-text file following the ImplementationReport template.
  Artifact: ImplementationReport
  Workflow mode: extraction
  Source repository: ${sourceDir}
  Target repository: ${targetDir}
  Inputs used: ...
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function extractionTestImplementationPrompt(ctx: PromptContext): string {
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt
- ${ctx.runFolder}/artifacts/pseudocode-packet.txt
- ${ctx.runFolder}/artifacts/test-strategy-packet.txt
- ${ctx.runFolder}/artifacts/implementation-report.txt (if available)

Task:
Add or update tests in the target repository and produce ${ctx.runFolder}/artifacts/test-implementation-report.txt (artifact: TestImplementationReport).

All test work must happen in ${targetDir}.
Prioritize non-negotiable regression tests from the GoldenBehaviorContract.
Follow the TestStrategyPacket. Do not invent a separate test strategy.

Extraction guardrails:
- Add or update tests in the target repository only.
- Do not add tests to the source repository.
- Regression tests must cover every non-negotiable item in the GoldenBehaviorContract.
- Do not claim tests passed unless command evidence is included.

The TestImplementationReport must include:
- test files changed (target repository only)
- tests added
- tests updated
- GoldenBehaviorContract items covered
- behaviors covered
- invariants covered
- state transitions covered
- derived values covered
- boundaries covered
- external contracts covered
- failure modes covered
- TestStrategyPacket items not implemented
- reason for each missing test
- verification commands to run

Required output artifact: TestImplementationReport
Output file: ${ctx.runFolder}/artifacts/test-implementation-report.txt

Stop conditions:
- do not replace the TestStrategyPacket with a new unrelated strategy
- do not change production behavior unless reporting a blocker
- do not add tests to the source repository

Return format:
Produce the artifact as a plain-text file following the TestImplementationReport template.
  Artifact: TestImplementationReport
  Workflow mode: extraction
  Target repository: ${targetDir}
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function extractionVerificationPrompt(ctx: PromptContext): string {
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/test-strategy-packet.txt
- ${ctx.runFolder}/artifacts/implementation-report.txt
- ${ctx.runFolder}/artifacts/test-implementation-report.txt

Task:
Run validation commands in the target repository and produce ${ctx.runFolder}/artifacts/verification-report.txt (artifact: VerificationReport).

Run target project validation commands in ${targetDir}.
Do not validate the source repository unless explicitly requested by the request brief.

Extraction guardrails:
- Run all validation commands from inside the target repository.
- Do not claim checks passed unless actual command output was produced.
- Do not hide failed commands.

The VerificationReport must include:
- commands run and working directory for each (should be ${targetDir})
- exit codes
- pass/fail status
- output summary
- failed tests if any
- GoldenBehaviorContract items verified by tests
- skipped checks
- reason for skipped checks
- environment notes if relevant
- remaining verification gaps

Required output artifact: VerificationReport
Output file: ${ctx.runFolder}/artifacts/verification-report.txt

Stop conditions:
- do not claim checks passed unless command output was produced
- do not hide failed commands
- do not validate source repository unless explicitly requested

Return format:
Produce the artifact as a plain-text file following the VerificationReport template.
  Artifact: VerificationReport
  Workflow mode: extraction
  Target repository: ${targetDir}
  [all required sections]
  Status: complete | incomplete | blocked
`;
}

function extractionJudgePrompt(ctx: PromptContext): string {
  const sourceDir = ctx.sourceRepoRoot ?? '<source-repo-root>';
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/source-workflow-map.txt
- ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt
- ${ctx.runFolder}/artifacts/do-not-port-list.txt
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/target-architecture-proposal.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt
- ${ctx.runFolder}/artifacts/pseudocode-packet.txt
- ${ctx.runFolder}/artifacts/test-strategy-packet.txt
- ${ctx.runFolder}/artifacts/implementation-report.txt
- ${ctx.runFolder}/artifacts/test-implementation-report.txt
- ${ctx.runFolder}/artifacts/verification-report.txt

Task:
Review the target implementation against all extraction artifacts and produce ${ctx.runFolder}/artifacts/judge-report.txt (artifact: JudgeReport).

Do not mark the run as passed unless the target implementation satisfies the GoldenBehaviorContract.

The JudgeReport must assess:
- implementation vs GoldenBehaviorContract (primary gate)
- implementation vs PseudocodePacket
- implementation vs TargetArchitectureProposal
- tests vs TestStrategyPacket
- tests vs GoldenBehaviorContract non-negotiable regression tests
- DoNotPortList compliance: no excluded systems were ported
- SourceToTargetPortingMap decisions followed
- source repository read-only compliance: was the source repository modified?
- behavior coverage
- verification evidence
- scope control
- risks and gaps

Verdict must be one of:
  PASS | DESIGN_INCOMPLETE | PSEUDOCODE_INCOMPLETE | IMPLEMENTATION_MISMATCH |
  TEST_COVERAGE_INCOMPLETE | ARCHITECTURE_MISMATCH | DO_NOT_PORT_VIOLATION |
  GOLDEN_CONTRACT_NOT_SATISFIED | NEED_VERIFICATION | SCOPE_VIOLATION | BLOCKED

Required output artifact: JudgeReport
Output file: ${ctx.runFolder}/artifacts/judge-report.txt

Source repository: ${sourceDir}
Target repository: ${targetDir}

Stop conditions:
- do not rewrite code
- do not approve without verification evidence
- do not hide gaps in GoldenBehaviorContract coverage

Return format:
Produce the artifact as a plain-text file.
  Artifact: JudgeReport
  Workflow mode: extraction
  Source repository: ${sourceDir}
  Target repository: ${targetDir}
  Verdict: ...
  GoldenBehaviorContract satisfied: yes | no | partial
  DoNotPortList compliant: yes | no
  Source repository modified: yes | no
  Recommended next stage if not PASS: ...
  Status: complete
`;
}

function extractionFinalReportPrompt(ctx: PromptContext): string {
  const sourceDir = ctx.sourceRepoRoot ?? '<source-repo-root>';
  const targetDir = ctx.targetRepoRoot ?? '<target-repo-root>';
  return `${header(ctx)}
Inputs:
- ${ctx.runFolder}/artifacts/request-brief.txt
- ${ctx.runFolder}/artifacts/source-workflow-map.txt
- ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt
- ${ctx.runFolder}/artifacts/do-not-port-list.txt
- ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- ${ctx.runFolder}/artifacts/target-architecture-proposal.txt
- ${ctx.runFolder}/artifacts/behavior-model.txt
- ${ctx.runFolder}/artifacts/pseudocode-packet.txt
- ${ctx.runFolder}/artifacts/test-strategy-packet.txt
- ${ctx.runFolder}/artifacts/implementation-report.txt
- ${ctx.runFolder}/artifacts/test-implementation-report.txt
- ${ctx.runFolder}/artifacts/verification-report.txt
- ${ctx.runFolder}/artifacts/judge-report.txt

Task:
Summarize the completed extraction workflow and produce ${ctx.runFolder}/artifacts/final-report.txt (artifact: FinalReport).

The FinalReport must include:
- Mode: extraction
- Run ID: ${ctx.runId}
- Original extraction request
- Source repository: ${sourceDir}
- Target repository: ${targetDir}
- Final status (judge verdict)
- Source workflow map: ${ctx.runFolder}/artifacts/source-workflow-map.txt
- Source-to-target porting map: ${ctx.runFolder}/artifacts/source-to-target-porting-map.txt
- Do-not-port list: ${ctx.runFolder}/artifacts/do-not-port-list.txt
- Golden behavior contract: ${ctx.runFolder}/artifacts/golden-behavior-contract.txt
- Target architecture proposal: ${ctx.runFolder}/artifacts/target-architecture-proposal.txt
- Source components reused
- Source components rewritten
- Source components discarded
- Files changed in target repository
- Files changed in source repository (normally: none)
- Tests added or updated
- Verification commands and results
- Judge result
- Remaining risks
- Recommended next extraction or implementation step

Required output artifact: FinalReport
Output file: ${ctx.runFolder}/artifacts/final-report.txt

Stop conditions:
- do not exaggerate success
- do not omit failed or skipped verification
- do not hide unresolved risks

Return format:
Produce the artifact as a plain-text file following the FinalReport template.
  Artifact: FinalReport
  Workflow mode: extraction
  Run ID: ${ctx.runId}
  Source repository: ${sourceDir}
  Target repository: ${targetDir}
  [all required sections]
  Status: complete
`;
}

// ─── Stage router ─────────────────────────────────────────────────────────────

export function generateStagePrompt(meta: RunMetadata, stageName: string): string {
  const stageIndex = meta.stages.findIndex((s) => s.name === stageName);
  if (stageIndex === -1) {
    throw new Error(`Stage "${stageName}" not found in ${meta.mode} workflow`);
  }

  const ctx: PromptContext = {
    stage: stageName,
    mode: meta.mode,
    runId: meta.runId,
    projectRoot: meta.projectRoot,
    runFolder: meta.runFolder,
    stageNumber: stageIndex + 1,
    totalStages: meta.stages.length,
    sourceRepoRoot: meta.sourceRepoRoot,
    targetRepoRoot: meta.targetRepoRoot,
  };

  const isExtraction = meta.mode === 'extraction';

  switch (stageName) {
    // shared — non-extraction
    case 'architecture-context': return architectureContextPrompt(ctx);
    case 'verification': return isExtraction ? extractionVerificationPrompt(ctx) : verificationPrompt(ctx);
    case 'judge': return isExtraction ? extractionJudgePrompt(ctx) : judgePrompt(ctx);
    case 'final-report': return isExtraction ? extractionFinalReportPrompt(ctx) : finalReportPrompt(ctx);
    // shared stages with extraction-specific overrides
    case 'behavior-model': return isExtraction ? extractionBehaviorModelPrompt(ctx) : behaviorModelPrompt(ctx);
    case 'pseudocode-packet': return isExtraction ? extractionPseudocodePacketPrompt(ctx) : pseudocodePacketPrompt(ctx);
    case 'test-strategy': return isExtraction ? extractionTestStrategyPrompt(ctx) : testStrategyPrompt(ctx);
    case 'implementation': return isExtraction ? extractionImplementationPrompt(ctx) : implementationPrompt(ctx);
    case 'test-implementation': return isExtraction ? extractionTestImplementationPrompt(ctx) : testImplementationPrompt(ctx);
    // feature
    case 'request-brief': return isExtraction ? extractionRequestBriefPrompt(ctx) : requestBriefPrompt(ctx);
    // repair
    case 'observed-behavior-report': return observedBehaviorReportPrompt(ctx);
    case 'behavior-trace': return behaviorTracePrompt(ctx);
    case 'divergence-report': return divergenceReportPrompt(ctx);
    case 'correction-design': return correctionDesignPrompt(ctx);
    case 'regression-test-strategy': return regressionTestStrategyPrompt(ctx);
    // test
    case 'test-target-brief': return testTargetBriefPrompt(ctx);
    case 'behavior-reconstruction': return behaviorReconstructionPrompt(ctx);
    case 'pseudocode-summary': return pseudocodeSummaryPrompt(ctx);
    // refactor
    case 'refactor-brief': return refactorBriefPrompt(ctx);
    case 'existing-behavior-map': return existingBehaviorMapPrompt(ctx);
    case 'preserved-invariant-list': return preservedInvariantListPrompt(ctx);
    case 'compatibility-test-strategy': return compatibilityTestStrategyPrompt(ctx);
    case 'refactor-pseudocode-packet': return refactorPseudocodePacketPrompt(ctx);
    // harden
    case 'hardening-brief': return hardeningBriefPrompt(ctx);
    case 'assumption-report': return assumptionReportPrompt(ctx);
    case 'failure-mode-matrix': return failureModeMatrixPrompt(ctx);
    case 'guard-pseudocode-packet': return guardPseudocodePacketPrompt(ctx);
    case 'resilience-test-strategy': return resilienceTestStrategyPrompt(ctx);
    // extraction-specific
    case 'source-architecture-context': return sourceArchitectureContextPrompt(ctx);
    case 'source-workflow-map': return sourceWorkflowMapPrompt(ctx);
    case 'porting-map': return portingMapPrompt(ctx);
    case 'golden-behavior-contract': return goldenBehaviorContractPrompt(ctx);
    case 'target-architecture': return targetArchitecturePrompt(ctx);
    default:
      throw new Error(`No prompt generator for stage: "${stageName}"`);
  }
}

// Artifact files used as inputs for each correctable stage
const CORRECTION_STAGE_INPUTS: Record<string, string[]> = {
  'architecture-context': ['artifacts/request-brief.txt'],
  'behavior-model': [
    'artifacts/request-brief.txt',
    'artifacts/architecture-context-packet.txt',
  ],
  'pseudocode-packet': [
    'artifacts/request-brief.txt',
    'artifacts/architecture-context-packet.txt',
    'artifacts/behavior-model.txt',
  ],
  'test-strategy': [
    'artifacts/behavior-model.txt',
    'artifacts/pseudocode-packet.txt',
  ],
  'test-implementation': [
    'artifacts/behavior-model.txt',
    'artifacts/pseudocode-packet.txt',
    'artifacts/test-strategy-packet.txt',
  ],
  'implementation': [
    'artifacts/request-brief.txt',
    'artifacts/architecture-context-packet.txt',
    'artifacts/pseudocode-packet.txt',
  ],
  'verification': [
    'artifacts/implementation-report.txt',
    'artifacts/test-implementation-report.txt',
    'artifacts/test-strategy-packet.txt',
  ],
};

/**
 * Generates a bounded, stage-specific correction prompt.
 * The prompt instructs the coding agent to revise only the failed stage artifact
 * based on the judge report finding — without broadening scope, modifying code
 * automatically, or invoking any external runtime.
 */
export function generateCorrectionPrompt(
  meta: RunMetadata,
  correctionState: CorrectionRouteResult,
): string {
  const routedStage = correctionState.routedStage!;
  const verdict = correctionState.verdict ?? 'UNKNOWN';
  const runFolder = meta.runFolder;

  const priorInputs = CORRECTION_STAGE_INPUTS[routedStage] ?? [];
  const designMapPath = path.join(runFolder, 'artifacts', 'design-map.txt');
  const designMapExists = fs.existsSync(designMapPath);

  const inputLines: string[] = [
    `- ${runFolder}/artifacts/judge-report.txt`,
    ...priorInputs.map((f) => `- ${runFolder}/${f}`),
  ];
  if (designMapExists) {
    inputLines.push(`- ${runFolder}/artifacts/design-map.txt`);
  }

  const outputFile = path.join(runFolder, 'artifacts', stageToArtifactBasename(routedStage));

  const warningLines =
    correctionState.warnings.length > 0
      ? [`\nWarning from routing:\n${correctionState.warnings.map((w) => `  ${w}`).join('\n')}\n`]
      : [];

  return [
    `Stage: ${routedStage} (correction)`,
    `Workflow mode: ${meta.mode}`,
    `Run ID: ${meta.runId}`,
    `Project root: ${meta.projectRoot}`,
    `Run folder: ${runFolder}`,
    ``,
    `Correction context:`,
    `  Judge verdict: ${verdict}`,
    `  Routed correction stage: ${routedStage}`,
    ...(correctionState.recommendedStage
      ? [`  Judge recommended: ${correctionState.recommendedStage}`]
      : []),
    ...warningLines,
    ``,
    `Inputs:`,
    ...inputLines,
    ``,
    `Task:`,
    `Revise the ${routedStage} artifact to resolve the judge finding.`,
    `Read the judge-report.txt to understand what was found insufficient.`,
    `Read the prior artifacts listed above to understand the current design state.`,
    `Produce an updated artifact that addresses the judge finding.`,
    ``,
    `Required output artifact: ${artifactKindForStage(routedStage)}`,
    `Output file: ${outputFile}`,
    ``,
    `Stop conditions:`,
    `- revise only the artifact for this stage`,
    `- do not modify production code unless this stage is implementation`,
    `- do not write test files unless this stage is test-strategy or test-implementation`,
    `- do not broaden scope beyond what the judge finding requires`,
    `- do not route back further unless the prior artifact is also found insufficient`,
    `- do not run any external agent, LLM call, or automated tool`,
    `- do not claim the issue is resolved without updating the artifact`,
    ``,
    `Return format:`,
    `Produce the updated artifact as a plain-text file.`,
    `Update the Status: field to complete when the correction is done.`,
    ``,
  ].join('\n');
}

function stageToArtifactBasename(stageName: string): string {
  const map: Record<string, string> = {
    'architecture-context': 'architecture-context-packet.txt',
    'behavior-model': 'behavior-model.txt',
    'pseudocode-packet': 'pseudocode-packet.txt',
    'test-strategy': 'test-strategy-packet.txt',
    'test-implementation': 'test-implementation-report.txt',
    'implementation': 'implementation-report.txt',
    'verification': 'verification-report.txt',
  };
  return map[stageName] ?? `${stageName}.txt`;
}

function artifactKindForStage(stageName: string): string {
  const map: Record<string, string> = {
    'architecture-context': 'ArchitectureContextPacket',
    'behavior-model': 'BehaviorModel',
    'pseudocode-packet': 'PseudocodePacket',
    'test-strategy': 'TestStrategyPacket',
    'test-implementation': 'TestImplementationReport',
    'implementation': 'ImplementationReport',
    'verification': 'VerificationReport',
  };
  return map[stageName] ?? stageName;
}

export function writeStagePrompts(meta: RunMetadata): void {
  for (const stage of meta.stages) {
    const promptContent = generateStagePrompt(meta, stage.name);
    const promptPath = path.join(meta.runFolder, stage.promptFile);
    fs.writeFileSync(promptPath, promptContent, 'utf8');
  }
}
