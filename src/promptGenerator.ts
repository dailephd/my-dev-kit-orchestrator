import * as fs from 'fs';
import * as path from 'path';
import { WorkflowMode } from './types';
import { RunMetadata } from './run';

interface PromptContext {
  stage: string;
  mode: WorkflowMode;
  runId: string;
  projectRoot: string;
  runFolder: string;
  stageNumber: number;
  totalStages: number;
}

function header(ctx: PromptContext): string {
  return [
    `Stage: ${ctx.stage}`,
    `Workflow mode: ${ctx.mode}`,
    `Run ID: ${ctx.runId}`,
    `Project root: ${ctx.projectRoot}`,
    `Run folder: ${ctx.runFolder}`,
    '',
  ].join('\n');
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
  };

  switch (stageName) {
    // shared
    case 'architecture-context': return architectureContextPrompt(ctx);
    case 'behavior-model': return behaviorModelPrompt(ctx);
    case 'pseudocode-packet': return pseudocodePacketPrompt(ctx);
    case 'test-strategy': return testStrategyPrompt(ctx);
    case 'implementation': return implementationPrompt(ctx);
    case 'test-implementation': return testImplementationPrompt(ctx);
    case 'verification': return verificationPrompt(ctx);
    case 'judge': return judgePrompt(ctx);
    case 'final-report': return finalReportPrompt(ctx);
    // feature
    case 'request-brief': return requestBriefPrompt(ctx);
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
    default:
      throw new Error(`No prompt generator for stage: "${stageName}"`);
  }
}

export function writeStagePrompts(meta: RunMetadata): void {
  for (const stage of meta.stages) {
    const promptContent = generateStagePrompt(meta, stage.name);
    const promptPath = path.join(meta.runFolder, stage.promptFile);
    fs.writeFileSync(promptPath, promptContent, 'utf8');
  }
}
