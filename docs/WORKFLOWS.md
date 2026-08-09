# Workflows

Use this guide for ordered workflow decisions. Consult [Commands](COMMANDS.md)
for exact CLI syntax and [Artifacts](ARTIFACTS.md) for detailed artifact
contracts.

`my-dev-kit-orchestrator` supports seven workflow modes. Use this guide to
choose a mode and follow its stages. See [Usage](USAGE.md) for complete command
syntax and [Artifacts](ARTIFACTS.md) for artifact contracts.

Each workflow uses a fixed ordered stage list. The CLI advances by checking whether the expected artifact file for a stage exists and its lifecycle state (v0.3.0+).

Choose a mode by the change's primary goal. `feature` changes behavior;
`repair` reconciles observed and intended behavior; `test` adds or improves
tests without a production implementation stage; `refactor` preserves
behavior while changing structure; `harden` strengthens failure handling;
`extraction` transfers bounded behavior between repositories; and `greenfield`
plans a new project before useful code exists. Every mode uses the shared
lifecycle, context-readiness, judge-correction, and final-report rules below.

## Content check layer (v0.4.0)

A separate content check layer is available via `my-dev-kit-orchestrator check`. Content checks are deterministic text-based checks that report whether artifact files contain the expected section headers. They run independently and do not block stage advancement.

```bash
my-dev-kit-orchestrator check          # check all artifacts and prompts
my-dev-kit-orchestrator check --strict # exit 1 on any warn
```

Content checks complement the lifecycle layer - lifecycle state tracks whether an artifact is ready to proceed; content checks report what quality issues exist inside it.

The common design-to-code flow is:

`request -> graph-guided architecture context -> ArchitectureContextPacket -> BehaviorModel -> PseudocodePacket -> TestStrategyPacket -> ImplementationReport -> TestImplementationReport -> VerificationReport -> JudgeReport -> FinalReport`

In this model, `my-dev-kit` is used during context acquisition and `my-dev-kit-orchestrator` manages the downstream workflow after the synthesized ArchitectureContextPacket is saved.

## Feature

Use `feature` for new behavior or intentional behavior changes.
Do not use it for a behavior-preserving structural change or a new project.

Command:

```bash
my-dev-kit-orchestrator start --mode feature "<request>"
```

Default form:

```bash
my-dev-kit-orchestrator start "<request>"
```

Stage order:

1. `request-brief`
2. `architecture-context`
3. `behavior-model`
4. `pseudocode-packet`
5. `test-strategy`
6. `implementation`
7. `test-implementation`
8. `verification`
9. `judge`
10. `final-report`

Completion requires verified implementation and tests, an accepted judge
`PASS`, no active correction, and an eligible `final-report`.

## Repair

Use `repair` when observed behavior diverges from intended behavior.
Do not use it for unfocused defect hunting without an observed/expected
behavior comparison.

Command:

```bash
my-dev-kit-orchestrator start --mode repair "<observed behavior>"
```

Stage order:

1. `observed-behavior-report`
2. `architecture-context`
3. `behavior-trace`
4. `divergence-report`
5. `correction-design`
6. `regression-test-strategy`
7. `implementation`
8. `test-implementation`
9. `verification`
10. `judge`
11. `final-report`

The correction design and regression strategy gate implementation. Completion
requires evidence that the first divergence was corrected without breaking the
intended behavior.

## Test

Use `test` for behavior-derived test planning or test implementation for existing behavior.
Do not use it when production behavior must change; use `feature` or `repair`.

Command:

```bash
my-dev-kit-orchestrator start --mode test "<test target>"
```

Stage order:

1. `test-target-brief`
2. `architecture-context`
3. `behavior-reconstruction`
4. `pseudocode-summary`
5. `test-strategy`
6. `test-implementation`
7. `verification`
8. `judge`
9. `final-report`

Completion requires verification and an accepted judge `PASS`; this mode has
no production `implementation` stage.

## Refactor

Use `refactor` for structure changes that must preserve behavior.
Do not use it when externally visible behavior is intended to change.

Command:

```bash
my-dev-kit-orchestrator start --mode refactor "<refactor goal>"
```

Stage order:

1. `refactor-brief`
2. `architecture-context`
3. `existing-behavior-map`
4. `preserved-invariant-list`
5. `compatibility-test-strategy`
6. `refactor-pseudocode-packet`
7. `implementation`
8. `test-implementation`
9. `verification`
10. `judge`
11. `final-report`

The preserved-invariant list and compatibility strategy gate implementation.
Completion requires verification that the declared behavior remained intact.

## Harden

Use `harden` for validation, resilience, and failure-handling improvements.
Do not use it to hide an architectural defect behind silent fallback behavior.

Command:

```bash
my-dev-kit-orchestrator start --mode harden "<hardening goal>"
```

Stage order:

1. `hardening-brief`
2. `architecture-context`
3. `assumption-report`
4. `failure-mode-matrix`
5. `guard-pseudocode-packet`
6. `resilience-test-strategy`
7. `implementation`
8. `test-implementation`
9. `verification`
10. `judge`
11. `final-report`

The failure-mode matrix, guard design, and resilience strategy gate
implementation. Completion requires verification of the intended failure
handling and an accepted judge `PASS`.

## Extraction

Use `extraction` when you want to transfer a bounded feature, workflow, subsystem, or behavior from an existing source repository into a new or separate target repository.

This mode is not for normal feature implementation. It is for inspecting an existing source project, identifying the useful behavior, discarding unrelated architecture, preserving critical behavior, and implementing a cleaner version in the target project.

**Implemented in v0.2.1.**

### Purpose

- source repository: used for inspection and evidence only; treated as read-only by default
- target repository: where the extracted workflow is implemented, tested, verified, and reported
- the orchestrator must not assume the target should reproduce the full source architecture

### Command

```bash
npx @dailephd/my-dev-kit-orchestrator start --mode extraction \
  --source "<source-repo-root>" \
  --target "<target-repo-root>" \
  "<extraction request>"
```

Windows example:

```powershell
npx @dailephd/my-dev-kit-orchestrator start --mode extraction `
  --source "C:\source-repository" `
  --target "C:\target-repository" `
  "Extract a bounded workflow into the target repository."
```

### Stage order

1. `request-brief`
2. `source-architecture-context`
3. `source-workflow-map`
4. `porting-map`
5. `golden-behavior-contract`
6. `target-architecture`
7. `behavior-model`
8. `pseudocode-packet`
9. `test-strategy`
10. `implementation`
11. `test-implementation`
12. `verification`
13. `judge`
14. `final-report`

### Stage behavior

#### `request-brief`

Capture the source repository path, target repository path, workflow to extract, desired target scope, features excluded from the extraction, critical behaviors to preserve, and expected deliverables.

#### `source-architecture-context`

Use `my-dev-kit` on the source repository. Index the source repository into its own `.my-dev-kit` directory:

```bash
npx @dailephd/my-dev-kit index --root <source-repo-root> --out <source-repo-root>/.my-dev-kit
```

Do not use target repository indexing to infer source behavior. Source and target indices must stay separate.
Write the synthesized result to
`artifacts/source-architecture-context-packet.txt`.

#### `source-workflow-map`

Write `artifacts/source-workflow-map.txt`. This stage describes what exists in the source repository. It does not decide what to port yet.

#### `porting-map`

Write `artifacts/source-to-target-porting-map.txt` and `artifacts/do-not-port-list.txt`. Classify each source subsystem as reusable, refactorable, rewritable, discardable, or postponed. Explicitly list systems that must not be ported.

#### `golden-behavior-contract`

Write `artifacts/golden-behavior-contract.txt`. Define the exact behavior the target implementation must satisfy. No production implementation should begin before this artifact exists.

#### `target-architecture`

Write `artifacts/target-architecture-proposal.txt`. If the target repository already exists, use `my-dev-kit` to inspect it. If the target repository does not exist yet, define the planned structure and contracts before scaffolding.

#### `behavior-model`

Write a behavior model for the target system using the golden behavior contract as the primary source of truth.

#### `pseudocode-packet`

Write pseudocode for the target implementation. The pseudocode must map to the target architecture, not the source architecture.

#### `test-strategy`

Write the test strategy before any test implementation begins. Include:

- contract tests
- backend unit tests
- frontend component tests
- state behavior tests
- integration tests
- E2E tests for the full extracted workflow
- regression tests for every golden behavior item

#### `implementation`

Implement the extracted workflow in the target repository only. Do not modify the source repository unless the user explicitly permits it.

#### `test-implementation`

Add or update tests in the target repository.

#### `verification`

Run actual target project validation commands. Record results.

#### `judge`

Compare the target implementation against:

- request brief
- source workflow map
- source-to-target porting map
- do-not-port list
- golden behavior contract
- target architecture proposal
- behavior model
- pseudocode packet
- test strategy
- verification report

#### `final-report`

Summarize:

- extracted workflow
- source repository inspected
- target repository modified
- source components reused
- source components rewritten
- source components discarded
- tests added
- validation results
- judge result
- remaining risks

### Source and target repository responsibilities

| Responsibility | Source repository | Target repository |
|---|---|---|
| Graph-guided inspection | ✓ | - |
| Index artifacts | `<source>/.my-dev-kit` | `<target>/.my-dev-kit` |
| Orchestrator run workspace | - | `<target>/.my-dev-kit-orchestrator/runs/<run-id>/` |
| Porting analysis | input | output |
| Implementation | read-only evidence | ✓ implementation happens here |
| Testing | - | ✓ |
| Verification | - | ✓ |
| Reports | - | ✓ |

### Extraction guardrails

- The source repository is evidence, not destiny. Do not port code just because it exists.
- Do not recreate the old architecture wholesale inside the target project.
- Do not port authentication, persistence, workspaces, database schema, background jobs, or downstream workflows unless explicitly in scope.
- Do not preserve old UI labels if they conflict with the new workflow.
- Five pre-implementation analysis stages produce six extraction gate files:
  `source-architecture-context`, `source-workflow-map`, `porting-map` (which
  produces both the porting map and `do-not-port-list.txt`),
  `golden-behavior-contract`, and `target-architecture`. Do not implement until
  all six files are complete.
- Do not mark the run as passed unless the judge report confirms that the target implementation satisfies the golden behavior contract.
- Modify only the target repository unless the user explicitly permits source repository changes.

---

## Greenfield

Use `greenfield` to start a new project before useful code exists. Do not use
it to add behavior to an established codebase; use `feature` for that work.

```bash
my-dev-kit-orchestrator start --mode greenfield "<project idea>"
```

The greenfield foundation is platform-neutral. It supports three starter
profiles: `typescript-cli`, `nextjs-app`, and `android-compose`. It also
excludes security validation, release, and publishing workflows.

`start` stores the request but does not resolve a profile at the CLI layer.
Profile resolution
(`src/greenfield/profiles/resolveGreenfieldProfile.ts`) happens when a coding
agent executes the `starter-profile` stage prompt, using the
`preferredProfile`/`platformTarget` fields from the normalized brief. `prompt`
itself renders static, mode-and-stage-keyed template text; profile-specific
correctness is carried through that static wording and the artifacts a coding
agent produces, not through a separate CLI Android/mobile mode.

Android Compose is profile-guided planning support, not an Android build
runner: the orchestrator does not run Gradle, does not require the Android
SDK, and does not check for a connected device or emulator.
`./gradlew connectedAndroidTest` is optional validation guidance, dependent on
a device or emulator being available where the generated project is actually
built -- not something the orchestrator itself runs or verifies. A generic
"mobile" or "mobile app" request does not silently resolve to
`android-compose`; it is reported as `unresolved`. iOS, Flutter, and React
Native remain unsupported profiles.

The 13 stages are:

1. `idea-brief` - capture and normalize the project idea.
2. `product-boundary` - define goals, users, constraints, and non-goals.
3. `stack-decision` - record the platform-neutral stack decision.
4. `starter-profile` - resolve a supported profile and its validation rules.
5. `bootstrap-bundle` - assemble deterministic brief, profile, template,
   documentation, scaffold, and validation inputs.
6. `project-docs` - prepare and validate structured in-memory project
   documentation content.
7. `scaffold-plan` - define bounded files, commands, and acceptance criteria.
8. `scaffold-implementation` - guide a coding agent through the approved
   scaffold plan.
9. `first-vertical-slice` - guide the smallest useful runnable behavior.
10. `verification` - record actual implementation-level evidence.
11. `initial-index` - hand the now-existing codebase to `my-dev-kit` for its
    first index and context retrieval.
12. `judge` - compare implementation and evidence with the greenfield plan.
13. `final-report` - summarize the run, verdict, risks, and next action.

Scaffold planning and implementation are prompt-guided. The CLI generates a
bounded prompt for one stage; the user gives that prompt to a coding agent and
saves the returned artifact. It does not invoke an LLM or autonomously write a
project.

The bootstrap runtime is deterministic and has no disk I/O or timestamps.
Project-doc bootstrap returns structured in-memory content rather than writing
template files. Component documentation remains empty until the brief schema
has module or component hints.

Greenfield readiness checking applies to all three current profiles. The
scaffold plan, scaffold implementation report, verification report, and
first vertical slice are validated against the selected profile's exact
contract: required targets, required and optional commands, generated-file
evidence, and first-slice completeness. `status` and `check`/`check --all`
surface the result. A run created before this validation existed (no
`Profile:` section in its scaffold implementation report) is treated as
legacy: it is not retroactively failed for evidence it could not have
produced. See [docs/ARTIFACTS.md](ARTIFACTS.md#greenfield-mode-artifacts)
for the exact structured sections each artifact carries.

### v1.3.1: standardized documents and full-stack composition

`v1.3.1` (the current published release; see
[CURRENT_STATE.md](CURRENT_STATE.md) and
[ARCHITECTURE.md](ARCHITECTURE.md#v131-standardized-documents-and-full-stack-capability))
does not add, remove, reorder, or rename any of the 13 stages above; it
carries additional resolved information through the same stages:

1. `idea-brief`/`stack-decision` may capture optional `projectType`
   (`fullstack-web`) and `webFramework` (`nextjs`) intent, orthogonal to
   starter-profile selection.
2. `starter-profile` still resolves one of the three existing profiles
   (`typescript-cli`, `nextjs-app`, `android-compose`); when the resolved
   profile is `nextjs-app` with `fullstack-web`/`nextjs` intent, the single
   supported full-stack capability (PostgreSQL, Prisma, Docker) also
   resolves.
3. `bootstrap-bundle` carries the resolved capability alongside the resolved
   profile.
4. `project-docs` populates the standardized 15-file canonical document
   baseline (README.md, CHANGELOG.md, and 13 `docs/*.md` files) for every
   profile, with full-stack-specific content layered additively into those
   common documents only when the capability is selected; `typescript-cli`
   and `android-compose` runs, and ordinary `nextjs-app` runs without the
   capability, never receive full-stack content.
5. `scaffold-plan` composes the base profile's targets/commands with the
   capability's targets/commands (Dockerfile, Compose files, Prisma schema,
   environment templates, readiness scripts, and the database-backed
   `app/api/health/route.ts` first-slice entry point) into one plan.
6. `scaffold-implementation`, `first-vertical-slice`, and `verification`
   record the same evidence contract as before, extended with the
   capability's required targets and commands where selected; a
   full-stack first vertical slice must cross Next.js through the canonical
   Prisma database client to PostgreSQL and observe a result -- a static
   page or file's existence cannot satisfy it.
7. `initial-index` and `judge` are unchanged in shape; `judge` still reviews
   the same evidence, now inclusive of full-stack evidence when present.
8. `final-report` eligibility for every greenfield run (not only full-stack
   runs) now consults the same canonical greenfield readiness `status` and
   `check` already surface; an authored judge `PASS` cannot make a run
   eligible while that readiness is incomplete.

No new CLI flag, workflow mode, or native stage was added. The orchestrator
still never executes Docker, PostgreSQL, Prisma, or any other project
command itself; it generates prompts and validates evidence a coding agent
supplies.

## Instruction packets and context-sensitive behavior

The seven workflow definitions contain 79 native stages in total. The stage
orders documented above are the exact `getAllWorkflows()` order and are
unchanged by the implemented instruction and context integration.

All 79 stages have stable catalog identities and deterministic
instruction-packet sidecars. Seventy-seven stages use the generalized
packet-backed prompt rendering path. The greenfield `scaffold-plan` and
`scaffold-implementation` stages retain their specialized scaffold renderer;
both exceptions still have catalog entries and sidecars, and their stage
names, prompt filenames, artifacts, and lifecycle behavior are unchanged.

### Context-sensitive direct stages

Repository evidence is attached only to this exact 11-stage matrix:

| Context kind | Workflow mode | Native stage |
| --- | --- | --- |
| Implementation context | `feature` | `implementation` |
| Implementation context | `repair` | `implementation` |
| Implementation context | `refactor` | `implementation` |
| Implementation context | `harden` | `implementation` |
| Implementation context | `extraction` | `implementation` |
| Test context | `feature` | `test-implementation` |
| Test context | `repair` | `test-implementation` |
| Test context | `test` | `test-implementation` |
| Test context | `refactor` | `test-implementation` |
| Test context | `harden` | `test-implementation` |
| Test context | `extraction` | `test-implementation` |

There are five implementation-context stages and six test-context stages.
Greenfield requires neither context kind and no native context stage exists.

New context-sensitive runs start with templates, so a direct
`implementation` or `test-implementation` prompt may initially be a
refresh-only prompt. It prohibits normal production or test work and directs
the user to refresh the required evidence. Printing a prompt reevaluates
readiness but does not write sidecars, generate templates, or mutate run files.
Normal work resumes after readiness passes.

Producer readiness for a bounded implementation or test request is not the
same as project-wide Architecture Assimilation. For an unfamiliar existing
project, the planner must first complete the manual onboarding gate in
[ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md](ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md#65-architecture-assimilation-gate).
The current CLI does not create or enforce that onboarding result; it continues
to enforce only its implemented run and repository-evidence contracts.

A refresh-required decision always carries an actionable issue. One
deterministic primary blocker supplies the primary reason, corrective action,
and evidence target; blocking and supporting issue codes retain canonical
order. Direct prompts, `status`, `check`, verification, judge, correction
routing, and `export` consume that same summary rather than selecting their
own blocker.

`v1.2.3` makes this one canonical run-integrity
decision, not just a shared summary: automatic stage detection, explicit
prompt selection, lifecycle resolution, `mark`, `status`, `check`, and
`export` all evaluate it once and cannot disagree. A refresh-required
`implementation`/`test-implementation` artifact is forced to `blocked` for
lifecycle purposes regardless of file presence or a manual `complete`
record, so it cannot advance the run while required context is not ready.

### Verification, judge, and correction flow

Verification and judge in `feature`, `repair`, `refactor`, `harden`, and
`extraction` review implementation and test context. In `test`, they review
test context only. Greenfield performs no repository-context review.

Blocked judge prompts use the existing `NEED_CONTEXT` verdict; no new verdict
was added. They require a valid exact `Recommended next stage`:

- recommend `implementation` first when implementation context is blocked;
- recommend `test-implementation` when only test context is blocked;
- recommend `test-implementation` for test mode.

The recommendation overrides the older default table through existing
correction routing. There is no correction-specific instruction-packet
sidecar and no correction-specific context file.

`v1.2.3` rejects an authored `Verdict: PASS`
whenever the canonical expected verdict is still `NEED_CONTEXT`, routing back
to the recommended stage above rather than clearing correction state. An
accepted `NEED_CONTEXT` always uses that same canonical recommendation, even
when the judge report's own `Recommended next stage:` names a different
stage. Every other supported verdict -- including `SCOPE_VIOLATION` and
`BLOCKED`, which remain terminal -- keeps its existing routing unchanged. A
normal `final-report` requires the accepted verdict to be `PASS` with no
active correction route and no remaining readiness blocker; artifact
presence and a manual `complete` mark cannot substitute for that.

## Shared stage gates and completion rules

- The CLI generates one prompt file per stage when a run starts.
- `prompt` without a stage selects the first stage whose effective artifact state is not `complete`.
- `prompt <stage>` requires prior stage artifacts to exist (file-existence check).
- The implementation and test-implementation stages are meant to consume the same design context rather than reinterpret the request independently.
- `my-dev-kit-orchestrator` does not execute a coding agent or `my-dev-kit` automatically.
- (`v1.2.3`) a context-blocked implementation/
  test-implementation stage, or a final-report stage that is not eligible,
  is never treated as `complete` for advancement purposes by the canonical
  run-integrity decision, even when its artifact file exists or carries a
  manual `complete` record.

## Lifecycle-aware progression (v0.3.0)

Stage progression now respects artifact lifecycle states:

- **`missing`**: artifact file does not exist - stage remains current
- **`incomplete`**: artifact exists but is marked unfinished - stage remains current
- **`blocked`**: cannot proceed due to a blocker - stage remains current
- **`stale`**: an upstream artifact changed after this one was completed - stage returns here
- **`complete`**: artifact is ready - stage advances to the next

### Setting lifecycle states

Use the `mark` command to set manual states:

```bash
my-dev-kit-orchestrator mark request-brief.txt --state blocked --reason "Waiting for PM"
my-dev-kit-orchestrator mark behavior-model.txt --state incomplete --reason "Edge cases missing"
my-dev-kit-orchestrator mark request-brief.txt --state complete
```

`missing` and `stale` are computed automatically and cannot be set manually.

### Stale artifact recovery

An artifact becomes stale when an upstream artifact is updated after it was completed.

Recovery flow:

1. `status` shows the stale artifact and which upstream caused it
2. `prompt` returns to the stale artifact's stage and shows a reconciliation context block
3. Update the artifact to reflect the newer upstream content
4. Mark it complete to advance again

### Blocked artifact handling

When an artifact is blocked:

1. Mark it blocked with a reason: `mark <artifact> --state blocked --reason "<blocker>"`
2. `prompt` shows a blocked context block explaining the situation
3. When unblocked, write the artifact file and mark it complete

### Backward compatibility

Existing runs without `artifact-state.json` continue to work:

- file present -> `complete`
- file missing -> `missing`

No migration is needed for runs created before v0.3.0.

## Practical architecture-context flow

For an architecture-context stage, a task-specific coding-agent prompt can combine both tools in a bounded sequence:

1. run `my-dev-kit` retrieval commands to gather project context
2. write `reports/architecture-context-retrieval-report.txt`
3. write `artifacts/architecture-context-packet.txt`
4. continue the orchestrator workflow with the synthesized architecture context

This is intentionally prompt-driven rather than rigid. ChatGPT can tailor the architecture-context prompt to the project, change request, and available retrieval evidence without changing the orchestrator command surface.

For an unfamiliar existing project, do not start this implementation workflow
or choose direct versus staged execution until the ecosystem Architecture
Assimilation Report has produced `ARCHITECTURE_ASSIMILATION_PASS`. The report
must establish the relevant owner, extension point, analogous implementation,
canonical contracts/state, dependencies, excluded owning layers, tests to
extend, and architecture that must not be duplicated. One feature-specific
architecture-context request is insufficient unless its evidence genuinely
covers all important onboarding domains.

After the pass, prompt assembly carries only those conclusions relevant to the
bounded task and still performs current task-specific retrieval. It must tell
the agent to build on the established architecture and prohibit a parallel
owner, registry, state representation, persistence path, analyzer, command
path, service layer, or other competing architecture unless an approved
replacement is explicitly in scope. Refresh or partially re-assimilate after a
material architecture change; do not reuse a stale result indefinitely.
