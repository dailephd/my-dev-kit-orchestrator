# Workflows

This guide owns Orchestrator's native modes, stage order, lifecycle, and completion rules. Consult [Commands](COMMANDS.md) for exact CLI syntax and [Artifacts](ARTIFACTS.md) for artifact contracts.

Cross-repository recipes have one home: [Ecosystem development workflows in my-dev-kit](https://github.com/dailephd/my-dev-kit/blob/main/docs/ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md). The [command-surface compatibility map](https://github.com/dailephd/my-dev-kit/blob/main/docs/ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md#915-command-surface-compatibility-map) adds combinations found by matching the actual four-tool command inputs/outputs rather than only the named workflows. That guide combines my-dev-kit, Orchestrator, Lab, Observer, and project test commands. This repository does not maintain a second copy.

`my-dev-kit-orchestrator` supports seven workflow modes. Use this guide to choose a mode and follow its stages. [Usage](USAGE.md) retains detailed usage compatibility guidance.

Each workflow uses a fixed ordered stage list. Advancement consults effective artifact lifecycle and the applicable readiness/integrity gates, not file presence alone.

Choose a mode by the change's primary goal. `feature` changes behavior; `repair` reconciles observed and intended behavior; `test` adds or improves tests without a production implementation stage; `refactor` preserves behavior while changing structure; `harden` strengthens failure handling; `extraction` transfers bounded behavior between repositories; and `greenfield` plans a new project before useful code exists. Every mode uses the shared lifecycle, context-readiness, judge-correction, and final-report rules below.

Proof-only is not an eighth mode. It is an explicit run capability for a verification task with a declared proof responsibility. Ordinary runs retain changed-surface expectations. Proof-only runs require exact proof evidence and remain subject to lifecycle, readiness, integrity, judge, and final-report gates. Repository evidence becomes blocking only at its owning stage. Future-stage evidence does not block an earlier phase.

A coding agent may continue through authorized native stages within one session. A continuous full-stack task does not authorize skipping `test-implementation`, bypassing readiness, or declaring success after backend-only work. The cross-repository guide defines the outer user-flow acceptance and feedback record without adding native modes or stages here.

## Content check layer (v0.4.0)

A separate content check layer is available via `my-dev-kit-orchestrator check`. Content checks are deterministic and artifact-format aware. Text artifacts are checked for expected section headers. Registered structured JSON artifacts are parsed and checked against their required structured fields. These checks are distinct from lifecycle advancement.

```bash
my-dev-kit-orchestrator check
my-dev-kit-orchestrator check --strict
```

`--strict` exits nonzero on warnings. Content checks complement lifecycle and integrity checks. A structurally valid report does not prove that implementation or tests ran.

The common design-to-code flow is:

`request -> graph-guided architecture context -> ArchitectureContextPacket -> BehaviorModel -> PseudocodePacket -> TestStrategyPacket -> ImplementationReport -> TestImplementationReport -> VerificationReport -> JudgeReport -> FinalReport`

The coding agent uses `my-dev-kit` during context acquisition. Orchestrator manages the downstream native workflow after the synthesized ArchitectureContextPacket is saved.

## Feature

Use `feature` for new behavior or intentional behavior changes. Do not use it for a behavior-preserving structural change or a new project.

```bash
my-dev-kit-orchestrator start --mode feature "<request>"
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

Completion requires verified implementation and tests, an accepted judge `PASS`, no active correction, and an eligible `final-report`. For a full-stack feature, the implementation responsibility includes all required layers and their real wiring, not just backend files.

## Repair

Use `repair` when observed behavior diverges from intended behavior. Do not use it for unfocused defect hunting without an observed/expected comparison.

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

The correction design and regression strategy gate implementation. Completion requires evidence that the first divergence was corrected without breaking intended behavior. Observer runtime evidence can inform the external diagnosis, but the native stage and artifact contracts remain unchanged.

## Test

Use `test` for behavior-derived test planning or test implementation for existing behavior. When production behavior must change, use `feature` or `repair`.

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

Completion requires verification and an accepted judge `PASS`. This mode has no production `implementation` stage.

## Refactor

Use `refactor` for structure changes that must preserve behavior. Do not use it when externally visible behavior intentionally changes.

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

The preserved-invariant list and compatibility strategy gate implementation. Completion requires verification that declared behavior remained intact. Shared frontend consumers can be protected through the external Observer contract workflow without adding a native refactor stage.

## Harden

Use `harden` for validation, resilience, and failure-handling improvements. Do not hide an architectural defect behind silent fallback behavior.

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

The failure-mode matrix, guard design, and resilience strategy gate implementation. Completion requires verification of the intended failure handling and an accepted judge `PASS`.

## Extraction

Use `extraction` to transfer a bounded feature, workflow, subsystem, or behavior from an existing source repository into a new or separate target repository. It is not normal feature implementation or permission to copy an entire architecture. Extraction shipped in v0.2.1.

### Purpose

- Source repository: read-only inspection and evidence by default.
- Target repository: implementation, tests, verification, and reports.
- Port only the behavior and dependencies explicitly in scope.

### Command

```bash
npx @dailephd/my-dev-kit-orchestrator start --mode extraction \
  --source "<source-repo-root>" \
  --target "<target-repo-root>" \
  "<extraction request>"
```

PowerShell equivalent:

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

`request-brief` captures source/target paths, extracted workflow, scope, exclusions, critical preserved behavior, and deliverables.

`source-architecture-context` inspects only the source identity and writes `artifacts/source-architecture-context-packet.txt`. Select actual source roots explicitly:

```bash
npx @dailephd/my-dev-kit index --root "<source-repo-root>" --src "<source-root-relative-to-project>" --out .my-dev-kit --json
```

`source-workflow-map` writes `artifacts/source-workflow-map.txt`, describing current source behavior without deciding what to port.

`porting-map` writes both `artifacts/source-to-target-porting-map.txt` and `artifacts/do-not-port-list.txt`. Classify source subsystems as reusable, refactorable, rewritable, discardable, or postponed.

`golden-behavior-contract` writes `artifacts/golden-behavior-contract.txt`, defining the exact target behavior. A visual reference may supplement this contract but cannot substitute for functional behavior.

`target-architecture` writes `artifacts/target-architecture-proposal.txt`. Inspect an existing target separately, or define its structure/contracts before scaffolding. Do not mix source and target index identities.

`behavior-model` derives target behavior from the golden contract. `pseudocode-packet` maps that behavior to the target architecture rather than blindly following source structure.

`test-strategy` assigns applicable contract, backend, frontend, state, integration, end-to-end, and golden-behavior regression tests before test implementation. Do not require unrelated test families merely to fill a list.

`implementation` changes the target only unless source edits are separately authorized. `test-implementation` adds or updates target tests. `verification` runs actual target commands and records outcomes.

`judge` compares the request, source workflow, porting map, do-not-port list, golden behavior, target architecture, behavior model, pseudocode, test strategy, and verification. `final-report` records the extracted workflow, source inspected, target modified, reused/rewritten/discarded components, tests, validation, judge result, and risks.

### Source and target responsibilities

Keep a separate index under each repository. The run workspace belongs to the target at `.my-dev-kit-orchestrator/runs/<run-id>/`. Source evidence informs porting analysis. Target artifacts, implementation, tests, verification, and reports record the result. Do not modify the source to make target validation easier.

### Extraction guardrails

- The source repository is evidence, not a required architecture.
- Do not port authentication, persistence, workspaces, database schema, background jobs, or downstream workflows unless explicitly included.
- Do not preserve obsolete UI labels when they contradict the requested target behavior.
- Five pre-implementation analysis stages produce six extraction gate files: `source-architecture-context`, `source-workflow-map`, `porting-map` with its two files, `golden-behavior-contract`, and `target-architecture`. All six files must be complete before implementation.
- Judge acceptance must establish the golden behavior contract. A local implementation summary is not enough.
- The source-to-target runtime-reference composition is documented in the canonical ecosystem guide. Incompatible application URLs must not be disguised as comparable before/after observations.

## Greenfield

Use `greenfield` to start a new project before useful code exists. Use `feature` for an established codebase.

```bash
my-dev-kit-orchestrator start --mode greenfield "<project idea>"
```

The platform-neutral foundation supports four starter profiles: `typescript-cli`, `nextjs-app`, `android-compose`, and `python-cli`. Ordinary greenfield bootstrap excludes security validation, release, and publishing workflows.

`start` stores the request but does not resolve a profile at the CLI layer. The coding agent resolves it during `starter-profile` from normalized profile/platform/stack/project-type/framework evidence. Explicit `python-cli`, the exact `python` alias, and clear Python-plus-CLI intent resolve to that profile. Bare Python and Python web/API/server intent remain unresolved or unsupported. No separate CLI Android/mobile/Python mode is inferred.

Android Compose is planning/scaffold guidance. The orchestrator does not run Gradle, does not require the Android SDK, and does not check for an emulator or device. `./gradlew connectedAndroidTest` is optional generated-project validation when its runtime prerequisites exist. Generic mobile intent remains unresolved. iOS, Flutter, and React Native are unsupported profiles.

The 13 stages are:

1. `idea-brief`: normalize the idea.
2. `product-boundary`: goals, users, constraints, and non-goals.
3. `stack-decision`: platform-neutral stack decision.
4. `starter-profile`: profile resolution and validation requirements.
5. `bootstrap-bundle`: brief/profile/template/document/scaffold/validation inputs.
6. `project-docs`: structured in-memory documentation content.
7. `scaffold-plan`: bounded files, commands, and acceptance.
8. `scaffold-implementation`: coding-agent scaffold execution.
9. `first-vertical-slice`: smallest meaningful runnable behavior.
10. `verification`: actual implementation evidence.
11. `initial-index`: first my-dev-kit index after source exists.
12. `judge`: compare evidence with the plan.
13. `final-report`: outcome, risks, and next action.

The CLI generates bounded stage prompts. The agent creates project files and runs commands outside the orchestrator. Bootstrap assembly is deterministic without disk I/O or timestamps. Project-document bootstrap supplies in-memory content. Component documentation remains empty when the brief supplies no component/module hints.

Greenfield readiness applies the selected profile's exact targets/commands, scaffold-plan validation, generated-file evidence, verification-command evidence, documentation findings, and first-slice completeness. `status` and `check`/`check --all` expose the result. A legacy scaffold report without a `Profile:` section receives compatibility treatment, not retroactive failure for evidence it could not supply. See [Artifacts](ARTIFACTS.md#greenfield-mode-artifacts).

### Common project instructions and Python CLI

Every profile receives the common exact targets `agents.txt`, `claude.txt`, `AGENTS.md`, and `CLAUDE.md`. Lower-case manuals derive from one normalized instruction model. Upper-case files are small adapters. These are generated-project instructions, separate from the 15 public project documents and native run artifacts.

The effective targets compose common targets, profile targets, and an optional compatible capability. The same set drives scaffold planning, persisted-plan validation, generated-file evidence, optional filesystem corroboration, and readiness. For `python-cli`, profile targets are `pyproject.toml`, `src/main.py`, `tests/test_main.py`, and `README.md`. Entry-point selection uses profile-owned metadata, not a generic extension list. Initial indexing remains the same generic handoff.

### Standardized documents and full-stack composition

The v1.3.1 capability is retained in the current release. It does not change the 13-stage sequence:

1. `idea-brief` and `stack-decision` can carry `projectType: fullstack-web` and `webFramework: nextjs`, independently of profile selection.
2. `starter-profile` resolves the existing `nextjs-app` profile plus the bounded PostgreSQL/Prisma/Docker capability when intent is compatible. There is no `nextjs-fullstack` profile or CLI `--profile`, `--project-type`, or `--framework` flag.
3. `bootstrap-bundle` carries the capability beside the profile.
4. `project-docs` uses the standardized 15-file baseline: README, CHANGELOG, and 13 `docs/*.md` files. Full-stack content is additive only when selected, not imposed on other profiles or ordinary frontend Next.js requests.
5. `scaffold-plan` composes base and capability targets/commands, including Dockerfile, Compose files, Prisma/schema/migrations, environment templates, readiness scripts, and the database-backed `app/api/health/route.ts` first slice.
6. Implementation, first slice, and verification record actual selected evidence. Full-stack proof crosses Next.js through the canonical Prisma client into PostgreSQL and observes a result. A static page or file does not satisfy that responsibility.
7. `initial-index` and `judge` preserve their roles. Final-report eligibility consults canonical greenfield readiness for every profile, not only full-stack runs.

The orchestrator never executes Docker, PostgreSQL, Prisma, or other project commands. It generates instructions and validates supplied evidence. The ecosystem guide owns the manual transition into the next complete feature, not a new built-in handoff capability.

## Instruction packets and context-sensitive behavior

The seven workflows contain 79 native stages. All have stable instruction-catalog identities and deterministic `WorkflowInstructionPacket` sidecars. Seventy-seven stages use the generalized renderer. `scaffold-plan` and `scaffold-implementation` retain the specialized scaffold renderer and still receive catalog entries and sidecars.

### Context-sensitive direct stages

Repository evidence attaches to the existing 11-stage matrix:

| Context | Modes | Native stage |
| --- | --- | --- |
| Implementation | `feature`, `repair`, `refactor`, `harden`, `extraction` | `implementation` |
| Test | `feature`, `repair`, `test`, `refactor`, `harden`, `extraction` | `test-implementation` |

There are five implementation-context stages and six test-context stages. Greenfield requires neither supplemental kind. No native context stage is added.

New context-sensitive runs include templates. A direct-stage prompt may be refresh-only until its required repository evidence is ready. It then prohibits normal editing and requests exact evidence recovery. Printing `prompt` reevaluates readiness but does not write sidecars, generate templates, or mutate run files.

For an unfamiliar existing repository, complete the manual [Architecture Assimilation gate in my-dev-kit](https://github.com/dailephd/my-dev-kit/blob/main/docs/ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md#6-existing-project-onboarding-workflow) first. The CLI does not itself create or enforce that onboarding report. Task-level producer readiness and project-wide understanding remain distinct.

A refresh-required result identifies one deterministic primary blocker with primary reason, corrective action, evidence target, and ordered blocking/supporting issue codes. `prompt`, `status`, `check`, verification, judge routing, and `export` consume the same summary.

`RunIntegrityGate` controls stage detection, explicit prompt selection, lifecycle resolution, mark/check/export, and final eligibility. A context-blocked implementation/test artifact is effectively blocked despite file presence or a manual complete record. A safe manual source read may inform a corrected request but cannot overwrite generated readiness.

### Verification, judge, and correction flow

Verification/judge review implementation and test context in feature, repair, refactor, harden, and extraction. Test mode reviews test context only. Greenfield uses its own readiness rather than these supplemental repository-context pairs.

A blocked context judge uses the supported `NEED_CONTEXT` verdict and an exact `Recommended next stage`:

- `implementation` first when implementation context is blocked.
- `test-implementation` when only test context is blocked, including test mode.

The canonical readiness recommendation overrides a conflicting prose route. No correction-specific packet or context file is created.

An authored `Verdict: PASS` cannot override a required `NEED_CONTEXT`. It is rejected rather than accepted and then hidden by a final report. Other supported verdicts retain their correction behavior. `SCOPE_VIOLATION` and `BLOCKED` remain terminal. A normal final report requires accepted PASS, no active correction, and no remaining readiness blocker.

## Shared stage gates and completion rules

- `start` generates the run's stage prompts and applicable sidecars.
- `prompt` without a stage selects the first stage whose effective state is not complete.
- Explicit stage selection still checks predecessor and current integrity requirements.
- Implementation and test implementation consume the same design rather than reinterpret the request independently.
- `my-dev-kit-orchestrator` does not execute a coding agent or `my-dev-kit` automatically.
- A context-blocked stage or ineligible final report cannot advance through file presence or a manual completion mark.
- External runtime/test/assurance results must describe the final candidate. The ecosystem guide's PASS labels do not expand the native judge vocabulary.

## Lifecycle-aware progression (v0.3.0)

Effective states are `missing`, `incomplete`, `blocked`, `stale`, and `complete`. Missing means no artifact. Incomplete means unfinished. Blocked means an unmet gate. Stale means upstream evidence changed. Complete permits advancement only under current integrity rules.

### Setting lifecycle states

```bash
my-dev-kit-orchestrator mark request-brief.txt --state blocked --reason "Required product decision missing"
my-dev-kit-orchestrator mark behavior-model.txt --state incomplete --reason "Edge cases missing"
my-dev-kit-orchestrator mark request-brief.txt --state complete
```

Only incomplete, blocked, and complete are manually settable. Missing and stale are computed. Manual completion is not a bypass.

### Stale artifact recovery

Inspect `status` for the upstream cause, retrieve the stage's current prompt, reconcile its artifact with new evidence, and complete it only when its gates permit. Repeat downstream stages whose evidence was invalidated.

### Blocked artifact handling

Preserve the exact blocker and completed evidence. Resolve the required input or correction, regenerate relevant artifacts, and re-run readiness before marking the artifact complete. Do not rewrite a failing generated verdict.

### Backward compatibility

Runs predating lifecycle metadata retain legacy file-present/file-missing behavior where applicable. Current readiness and final-report rules still govern supported current evidence. Do not rewrite old runs merely to produce a new-looking state file.

## Practical architecture-context flow

For a bounded architecture-context stage:

1. Run a verified my-dev-kit CLI against the correct current repository/index.
2. Save `reports/architecture-context-retrieval-report.txt` in the run.
3. Save the synthesized `artifacts/architecture-context-packet.txt`.
4. Continue the generated native stage sequence.

For an unfamiliar existing project, first obtain `ARCHITECTURE_ASSIMILATION_PASS` under the canonical ecosystem guide. Establish the existing owner, extension point, analogous implementation, canonical contracts/state, dependencies, excluded layers, tests to extend, and architecture that must not be duplicated. One task query is not automatically a complete onboarding report.

Carry only relevant conclusions into each subsequent bounded prompt and refresh current task evidence. Preserve existing owners, registries, state representations, persistence paths, analyzers, command paths, and service layers unless an explicit replacement is in scope. Re-assimilate only the domains invalidated by a material architecture change.
