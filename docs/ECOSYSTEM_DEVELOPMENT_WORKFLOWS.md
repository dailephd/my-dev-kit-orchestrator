# Ecosystem development workflows

## 1. Purpose

This guide is the operational entry point for taking a software project from
initial planning through implementation, validation, release, publication, and
continuation. It coordinates three packages:
`@dailephd/my-dev-kit`, `@dailephd/my-dev-kit-orchestrator`, and
`@dailephd/my-dev-kit-lab`.

It is not a product roadmap, release report, coding-agent prompt,
project-specific architecture document, or replacement for each package's
command reference. Follow the linked tool documentation when exact schemas or
all command flags are needed.

Canonical command references are the producer
[command guide](https://github.com/dailephd/my-dev-kit/blob/b2fb19b72f2148127cbec194ea2317d90ffbd27d/docs/COMMANDS.md),
the orchestrator [usage guide](USAGE.md), and the lab
[command guide](https://github.com/dailephd/my-dev-kit-lab/blob/dd715df1fe37d96b42c6ebcecf9a92f0e29a4151/docs/COMMANDS.md).

This guide uses four evidence classes:

- **Implemented:** current code or command help performs the behavior.
- **Project policy:** current repository documentation requires the behavior.
- **Manual:** ChatGPT, a user, or a coding agent must perform and record it.
- **Planned:** documentation describes the behavior, but the current command
  surface does not implement it.

Do not convert a manual or planned step into an automation claim.

## 2. Ecosystem overview

The inspected and published package versions are:

| Tool | Current package | Ownership | Important boundary |
| --- | --- | --- | --- |
| Producer | `@dailephd/my-dev-kit@1.12.1` | Read-only indexing, structural and semantic artifacts, classification, code and data-model graphs, search, lookup, bounded source retrieval, slices, views, context evidence, and graph diff | It never edits source, executes the application, or makes security verdicts. |
| Workflow controller | `@dailephd/my-dev-kit-orchestrator@1.3.0` | Stage order, profiles, prompts, run state, artifact lifecycle, integrity checks, correction routing, and portable handoffs | It does not run the producer, a coding agent, product tests, the lab, or a release. |
| Validation tool | `@dailephd/my-dev-kit-lab@0.4.5` | Self-validation, external-target and package validation, dependency and security checks, code-rot auditing, readiness evidence, and reports | It does not replace product tests or modify the target. |

The orchestrator consumes producer evidence supplied through run artifacts. It
does not invoke the producer. The lab can validate a producer, orchestrator,
package, or other external target, but remains an independent validation
companion. These dependencies are operational handoffs, not autonomous tool
chaining.

ChatGPT owns planning and architecture judgment: preserve the agreed plan,
choose direct or staged work, define version goals, group features, resolve
cross-repository order, write bounded coding-agent prompts, verify completion
reports, and prepare continuation handoffs. A coding agent owns only the
authorized execution packet: inspect bounded evidence, edit named scope, run
required checks, commit and push when authorized, and return evidence. The
coding agent must not choose its own workflow mode, add roadmap scope, publish,
or infer unresolved product decisions.

Git owns history, branches, commits, tags, and exact candidate identity.
GitHub owns pull-request review, continuous integration, merges, and releases.
The npm registry owns the published package state and distribution tags.
Neither repository creation nor publication is performed automatically by the
three tools.

The orchestrator's producer-adequacy contract was originally documented
against producer `1.10.4`. The inspected producer is `1.12.1` and retains the
schema-major-1 compatibility used by current orchestrator checks. Use current
command help and package versions, not the older validation baseline, for new
work.

Current gaps must remain explicit: there is no automatic two-text-file
ingestion, autonomous greenfield scaffold execution, automatic producer/lab
invocation, GitHub repository creation, multi-repository release controller,
or release publisher. Greenfield-to-feature handoff and additional starter
profiles are planned rather than implemented. The lab's combined `quality`,
`project`, and `all` audits and manual penetration-testing coverage are also
planned/manual, not current commands.

## 3. Starting inputs

Keep these two files as immutable planning sources:

```text
project-description.txt
project-milestones.txt
```

The ecosystem does not currently parse these filenames automatically. The
orchestrator `start` command accepts a request string; it exposes no
`--description`, `--milestones`, `--brief`, or `--profile` file flag. Its
programmatic greenfield brief loader can accept a JSON brief, an inline object,
or raw idea text, but that loader is not a public two-file CLI ingestion flow.
Conversion is therefore a manual planner-owned step.

### 3.1 `project-description.txt`

At minimum, describe the problem, intended users, product goal, and principal
capabilities. Useful optional detail includes non-goals, constraints, target
platforms, technologies already decided, external systems, quality
expectations, and release assumptions. These are recommendations, not a
required text-file schema.

The internal `GreenfieldProjectBrief` requires `rawIdea` and can additionally
represent `projectName`, `productGoal`, `usersOrAudience`, `coreWorkflow`,
`constraints`, `nonGoals`, `preferredStack`, `preferredProfile`,
`platformTarget`, `documentationPreferences`, and `testingExpectations`.
Those are tool-required fields only when directly using that programmatic type;
they do not make the original text file structured or CLI-ingestible.

### 3.2 `project-milestones.txt`

At minimum, give an ordered milestone list and the objective of each milestone.
Useful optional detail includes capabilities, dependencies, exclusions,
acceptance criteria, release boundaries, and sequencing constraints. The
current tools define no schema for this file. ChatGPT must preserve its order
and meaning while translating it into a roadmap and implementation plan.

Treat missing details as unresolved decisions. Do not manufacture required
fields, capabilities, milestones, or release commitments.

## 4. Greenfield workflow decision

Use this decision sequence before creating a run or repository:

1. **Is the project greenfield?** Use the orchestrator `greenfield` mode when
   the desired output is a new scaffold and first vertical slice. If a usable
   repository already exists, use the onboarding workflow in section 6.
2. **Is there a supported profile?** Current implemented profiles are
   `typescript-cli`, `nextjs-app`, and `android-compose`. Aliases include
   `android`, `kotlin-compose`, `jetpack-compose`, and `compose-android`.
   Generic “mobile” remains unresolved; iOS, Flutter, React Native, and a
   general mobile profile are not implemented.
3. **Are architecture and ownership resolved?** If no, use staged architecture
   work before authorizing scaffold implementation. A profile is a starting
   contract, not an architecture decision maker.
4. **Does the work require formal gates?** Use full staged orchestration for
   unresolved ownership, major cross-cutting work, prior context failures,
   workflow-integrity changes, or an explicit request for formal stages.
5. **Is this one repository or several?** Establish repository boundaries,
   upstream dependencies, release order, and cross-repository acceptance
   evidence before scaffolding any repository.
6. **Does code exist?** The producer is useful only after there are files to
   index. Before then, rely on original inputs, operational documents, profile
   contracts, and orchestrator artifacts.
7. **When should the first producer index run?** After the scaffold and first
   meaningful vertical slice exist, at the `initial-index` stage. Re-index
   after material structural changes.
8. **When should the lab first validate?** After the project has executable
   validation/package surfaces. Run it before release readiness and earlier
   after dependency, subprocess, network, boundary, or packaging changes.

Choose a direct manual repository bootstrap only when the work is small, the
profile is unsupported or unnecessary, ownership and architecture are already
resolved, and formal stage state adds no material control. Record the same
manual decisions and validation evidence even without an orchestrator run.

## 5. Complete workflow: starting a new project from two files

### Phase 1 — Preserve the original plan

1. Copy the two input files into a versioned planning location without editing
   their content, or record their exact hashes and protected external location.
2. Create a separate unresolved-decisions record. Put ambiguities and proposed
   alternatives there.
3. Mark each derived statement as agreed scope, interpretation, suggestion, or
   unresolved. Never silently reorganize milestones or infer capabilities.
4. Establish a source-of-truth order: explicit current user decisions, original
   planning files, accepted architecture decisions, current roadmap, then
   implementation evidence. Suggestions do not outrank agreed scope.

These are manual preservation conventions; no current command imports or
protects the two planning files.

### Phase 2 — Select the workflow mode

ChatGPT selects one planning policy value:

```text
DIRECT_IMPLEMENTATION
FULL_STAGE_CONTEXT
```

These are ecosystem planning labels, not orchestrator CLI `--mode` values.

Default to `DIRECT_IMPLEMENTATION` for a bounded continuation with known
ownership, established architecture, and clear acceptance criteria. Direct
work still requires producer retrieval before complete source or test reads,
bounded prompts, validation, reporting, and documentation reconciliation.

Use `FULL_STAGE_CONTEXT` when architecture ownership is unresolved, the work is
a major cross-cutting migration or extraction, earlier context failures require
formal gates, workflow lifecycle or integrity is itself being implemented, or
the user explicitly requests full orchestration. Select the matching CLI mode
(`greenfield`, `feature`, `repair`, `test`, `refactor`, `harden`, or
`extraction`) separately.

The coding agent does not choose or expand either mode.

### Phase 3 — Convert planning inputs into project-operational documents

ChatGPT manually reviews both source files and prepares the smallest useful
operational set before implementation:

- project overview: problem, users, goals, capabilities, constraints, and
  non-goals;
- roadmap: preserved milestones expressed as version goals, feature scope,
  sequencing, dependencies, exclusions, and high-level status;
- architecture: repository/module ownership, system boundaries, contracts,
  external systems, and unresolved decisions;
- development workflow and command guide;
- test strategy and quality expectations;
- security boundaries and threat assumptions;
- release process and release-channel assumptions;
- implementation plan and initial handoff.

For a greenfield run, the implemented `project-docs` stage requests a
`project-docs-report.txt`. The bootstrap bundle contains in-memory starter
documents named `product-boundary`, `stack-decision`,
`starter-profile-summary`, `development-workflow`, `testing-expectations`,
`validation-expectations`, `scaffold-planning-notes`,
`unresolved-decisions`, and `non-goals`. This is structured prompt material;
the CLI does not write finished repository documentation templates. Component
documents remain empty unless module/component hints are present.

The coding agent may draft files only from an authorized prompt. ChatGPT must
review scope, contradictions, ownership, and unsupported assumptions before
implementation begins.

### Phase 4 — Bootstrap the repository

The supported prompt-guided greenfield flow is:

```powershell
npx @dailephd/my-dev-kit-orchestrator init
npx @dailephd/my-dev-kit-orchestrator start --mode greenfield "<BOUNDED IDEA AND GOAL>"
npx @dailephd/my-dev-kit-orchestrator prompt
```

By default the run is stored under:

```text
.my-dev-kit-orchestrator/runs/<run-id>/
```

It contains `00-request.txt`, `run.json`, `prompts/`, `artifacts/`, `reports/`,
and `artifact-state.json`. Each prompt can also have an
`*.instruction-packet.json` sidecar. Avoid `start --output-dir` for a run that
must be resumed with the current CLI because other commands cannot rediscover
custom-output runs.

The 13 implemented greenfield stages and required outputs are:

1. `idea-brief` → `artifacts/idea-brief.json`
2. `product-boundary` → `artifacts/product-boundary.txt`
3. `stack-decision` → `artifacts/stack-decision.txt`
4. `starter-profile` → `artifacts/starter-profile.json`
5. `bootstrap-bundle` → `artifacts/bootstrap-bundle.json`
6. `project-docs` → `artifacts/project-docs-report.txt`
7. `scaffold-plan` → `artifacts/scaffold-plan.txt`
8. `scaffold-implementation` →
   `reports/scaffold-implementation-report.txt`
9. `first-vertical-slice` → `artifacts/first-vertical-slice.txt`
10. `verification` → `artifacts/verification-report.txt`
11. `initial-index` → `reports/initial-index-report.txt`
12. `judge` → `artifacts/judge-report.txt`
13. `final-report` → `artifacts/final-report.txt`

Use `prompt [stage]` to obtain the current bounded instruction, save the
requested artifact, and continue. Use `status`, `check --artifacts`,
`check --prompts`, `check --trace`, `check --design-map`, or `check --all` as
appropriate. Artifact lifecycle states are `missing`, `incomplete`, `blocked`,
`complete`, and `stale`; `mark` accepts only `incomplete`, `blocked`, or
`complete`. Structure or a manual `complete` mark cannot bypass canonical
readiness, an accepted judge `PASS`, or correction routing.

The profile resolver and bootstrap bundle are implemented. Application file
generation, package installation, compilation, Gradle/Android execution,
producer indexing, lab validation, and publishing are coding-agent or human
actions. A planned greenfield-to-feature handoff is not a current command.

### Phase 5 — Initialize version control

After the scaffold plan defines the intended repository boundary, initialize
Git manually if the chosen scaffold did not do so:

```powershell
git init
git branch -M main
git status --short --untracked-files=all
git add <EXPLICIT_INITIAL_FILES>
git commit -m "Initialize <PROJECT_NAME>"
```

Create appropriate ignore files before staging generated output, credentials,
local indexes, or run-state directories. Create and attach a remote through the
organization's approved process; no current ecosystem command creates a GitHub
repository. Push `main` only after checking the initial tree and validation
evidence.

Use one feature or version branch for related implementation batches. Do not
create a release branch until an exact candidate has passed readiness. Never
create a release branch merely to begin ordinary feature implementation.

### Phase 6 — First my-dev-kit index

Index once the scaffold contains enough source, configuration, and tests to
answer ownership and relationship questions:

```powershell
npx @dailephd/my-dev-kit index --root <REPOSITORY_PATH> --src <SOURCE_ROOT> --out <REPOSITORY_PATH>\.my-dev-kit --call-graph --json
```

Repeat `--src` for multiple source roots. `--call-graph` enables static
call-graph evidence where supported. The generated manifest is the authority
for artifact presence and metadata. Inspect with current commands:

```powershell
npx @dailephd/my-dev-kit search --index <INDEX_PATH> --query "<QUERY>" --json
npx @dailephd/my-dev-kit lookup --index <INDEX_PATH> --node "<NODE_ID>" --json
npx @dailephd/my-dev-kit slice --index <INDEX_PATH> --node "<NODE_ID>" --depth 2 --json
npx @dailephd/my-dev-kit source --index <INDEX_PATH> --node "<NODE_ID>" --json
npx @dailephd/my-dev-kit context --index <INDEX_PATH> --request <REQUEST_JSON_PATH> --out <CAPSULE_PATH> --audit-out <AUDIT_PATH> --json
npx @dailephd/my-dev-kit view --index <INDEX_PATH> --graph code --format dot --out <DOT_PATH> --json
npx @dailephd/my-dev-kit graph-diff --before <OLD_INDEX> --after <NEW_INDEX> --json
```

Consult the producer command reference for lookup kinds, source continuation
flags, graph choices, and context request schema.

The normal project index is the stable `.my-dev-kit` directory, refreshed in
place. A separate timestamped coding-agent evidence index is a manual audit
convention: use it only when a prompt requires an immutable snapshot or graph
comparison, and record its path and candidate commit. Do not confuse it with
the normal current index.

A full index rebuilds authority from current inputs. `--incremental` reuses
eligible cached work and falls back safely when reuse is invalid. Use a full
index for the first index, stale or corrupted evidence, source-root changes,
producer upgrades that change artifacts, or when equivalence is in doubt. Use
incremental indexing for ordinary supported refreshes, then verify the
manifest. `graph-diff` compares indexes without changing source.

### Phase 7 — Architecture context

For repository work, retrieve evidence in this order:

```text
search
-> lookup
-> slice
-> source
-> continuation
-> local imports/types/dependencies
-> bounded ranges
```

Use producer context role `architecture` to establish owners, extension
points, contracts, related tests, architecture adequacy, required-witness
coverage, provenance, freshness, conflicts, unresolved items, and capsule/audit
parity. The producer emits static evidence; ChatGPT makes the architecture
decision.

Architecture context is sufficient when required owner/extension, contract or
behavior, and test/gap witnesses are grounded; provenance and freshness meet
the request; no blocking conflict remains; and the context capsule agrees with
the retrieval audit. Optional truncation can yield “sufficient with
assumptions” when no required witness was lost.

It is insufficient when required evidence is missing or marked lost,
provenance is absent, required freshness cannot be proven, a material conflict
or ambiguity remains, or capsule/audit summaries disagree. Stop architecture
or implementation work, refresh the exact evidence target, and rerun the
readiness check. General truncation alone is not a blocker; loss of a required
condition witness is.

The orchestrator does not retrieve this evidence. For context-sensitive direct
stages, populate the fixed supplemental files:

```text
artifacts/implementation-context-packet.txt
reports/implementation-context-retrieval-report.txt
artifacts/test-context-packet.txt
reports/test-context-retrieval-report.txt
```

These files are not native lifecycle stages. Current context-sensitive stages
are implementation for `feature`, `repair`, `refactor`, `harden`, and
`extraction`, plus test implementation for `feature`, `repair`, `test`,
`refactor`, `harden`, and `extraction`.

### Phase 8 — Implementation planning

ChatGPT performs this manual decomposition:

```text
version goal
-> features
-> implementation steps
-> context-sharing batches
```

A batch serves one release goal, shares a product capability or workflow
surface, is tested and documented together, fits the intended release size,
and excludes unrelated roadmap items. Identify upstream package or repository
prerequisites before authorizing the first batch.

The roadmap stores version goals, feature scope, sequencing, dependencies,
exclusions, and high-level version status. It does not store per-batch logs,
file lists, test counts, or commit summaries. Keep those in implementation
reports, commits, and the handoff.

### Phase 9 — Coding-agent execution

For each batch, ChatGPT issues one bounded prompt containing authorization,
candidate identity, branch, scope and exclusions, required producer retrieval,
acceptance criteria, validation commands, documentation impact, commit/push
authority, stop conditions, and the completion-report schema.

Normally use one shared version branch across related implementation batches.
After each passing batch, commit and push that branch if authorized. Do not
create one pull request per batch, and do not bump the package version during
implementation.

Before reading a complete source or test file, the coding agent must attempt
the producer retrieval chain from Phase 7. If a complete read remains
necessary, its report must name the repository, path, line count, retrieval
commands and ranges, missing context, reason, conclusion, and effect. This rule
applies to direct implementation as well as staged work.

The completion report must identify files changed, evidence retrieved,
decisions, tests and results, generated files, limitations, commit and remote
state, and exact next action. ChatGPT verifies the report against the diff,
scope, evidence, and roadmap before issuing the next prompt. A failed or
unsupported report receives a correction prompt; it is not treated as
completion.

### Phase 10 — Documentation reconciliation

Run a separate post-implementation documentation workflow:

1. Inventory the final implementation and public surfaces.
2. Inventory tracked documentation and preservation requirements.
3. Compare implementation to documentation for missing behavior.
4. Compare documentation to implementation for stale or false claims.
5. Verify command help, flags, examples, artifact names, schemas, versions, and
   links against the exact candidate.
6. Audit contradictions across README, workflow, architecture, command,
   security, roadmap, release, and changelog documents.
7. Preserve roadmap history, ordering, future scope, and explicit exclusions.
8. Update the changelog only for actual candidate behavior.
9. Perform editorial review only after factual reconciliation.
10. Run the repository's documentation preservation checks.

This workflow changes documentation, not production behavior. If current
implementation and trustworthy historical documentation cannot be reconciled,
use forensic recovery: inspect tags, commits, release artifacts, command help,
and bounded source evidence; record the contradiction and its resolution; and
stop if authority remains ambiguous. Never delete or compress roadmap scope to
make a contradiction disappear.

### Phase 11 — Pre-release readiness

Pin the exact candidate branch and commit. Readiness is evidence gathering; it
does not bump the version, create a release, tag, or publish.

Run every repository-defined gate that exists, including:

- clean install, typecheck, build, tests, `verify`, benchmarks, and
  documentation checks;
- cross-platform continuous integration on Linux, macOS, and Windows and the
  repository's Node.js matrix;
- path-with-spaces coverage, JSON stdout versus diagnostics stderr separation,
  Graphviz-present and Graphviz-absent behavior where relevant, and
  deterministic repeated output;
- producer full/incremental equivalence and graph diff where indexing changed;
- dependency audit, package dry-run, exact tarball inspection, and a
  packed-consumer smoke test;
- lab security validation and required external-target/package profiles;
- code-rot, stale-test, and documentation-contradiction audits.

Use only scripts present in the candidate `package.json`. Local success is not
cross-platform continuous-integration evidence. Optional scanners that did not
run are “skipped” or “inconclusive,” never “passed.” Record exact commands,
environment, commit, outputs, and unresolved findings.

### Phase 12 — Standardized release

After readiness passes and release authorization is explicit, use this fixed
order:

1. Verify the exact candidate identity and clean state.
2. Create the release branch from that candidate.
3. Apply the package-version bump.
4. Reconcile final release documentation and changelog.
5. Run local validation again.
6. Inspect the package dry-run and exact packed contents.
7. Open the release pull request.
8. Require continuous integration on the exact release-branch commit.
9. Merge through GitHub without changing the candidate unexpectedly.
10. Require continuous integration on the exact merged `main` commit.
11. Create and push the annotated tag at that merged commit.
12. Require the tag workflow to pass.
13. Create the GitHub Release for the tag.
14. Verify GitHub Release, tag, commit, and intended release-channel parity.
15. Perform final package metadata and tarball parity checks.
16. Complete branch and workspace cleanup.
17. Run `npm publish --access public` as the final state-changing command.
18. Perform only read-only registry, tarball, tag, GitHub Release, and consumer
    checks after publication.

```text
npm publish --access public
```

must be the final state-changing command. Never tag before merged-main
continuous integration, never publish before the GitHub Release, and never
perform cleanup or another mutation after npm publication. Current ecosystem
tools guide or validate portions of this procedure; none autonomously performs
the complete release.

### Phase 13 — Handoff and continuation

Before changing chats or coding-agent sessions, write or export a handoff that
preserves:

- exact repository, branch, commit, package version, run ID, artifact states,
  and validation state;
- compact completed history and accepted decisions;
- the future-heavy roadmap without reordered milestones;
- reusable workflows, gates, source-of-truth hierarchy, and anti-drift rules;
- exact next action, required inputs, blockers, risks, and authorization limits.

Use this content balance as a manual project policy: 50 percent remaining
roadmap and future plan, 30 percent reusable workflows and gates, 10 percent
completed history, and 10 percent current state, risks, and next action.

For an orchestrator run, use `export` to create its portable run handoff after
integrity checks pass. The exported run state supplements, but does not replace,
the project-level continuation handoff. Resume the exact run and branch; do not
restart merely because the chat changed. A handoff must not infer, compress, or
reorganize the agreed plan.

## 6. Existing-project onboarding workflow

Use this sequence when source already exists:

1. **Verify repository state.** Fetch without changing files; record path,
   branch, `HEAD`, upstream/default-branch commit, tags, package metadata, and
   complete working-tree status. Stop if user work could be overwritten or
   mixed with the intended branch.
2. **Inventory documentation.** Read tracked README, `docs/`, examples,
   architecture, commands, workflow, development, security, release,
   continuous-integration, compatibility, artifact/schema, roadmap, and
   preservation-policy documents. Do not treat ignored planning notes as
   canonical unless the user promotes them.
3. **Create the first full producer index.** Select explicit source roots and a
   stable output directory; enable call-graph generation when useful. Record
   the manifest and candidate commit.
4. **Inspect artifacts and graphs.** Confirm classifications, symbols, owners,
   routes, tests, resources, data-model evidence, and relevant code/data views.
   Static absence is an evidence limit, not proof of runtime absence.
5. **Build architecture context.** Retrieve owner, extension, contract,
   test/gap, provenance, and freshness witnesses. Record conflicts and unknowns.
6. **Reconstruct the current roadmap.** Prefer explicit current plans and
   published history. Separate completed scope, in-progress scope, future
   scope, exclusions, and suggestions without rewriting the plan.
7. **Audit contradictions both ways.** Check undocumented implementation and
   unsupported documentation, including command help, versions, schemas, and
   release claims.
8. **Choose direct or staged work.** Use the Phase 2 policy. If staged, start
   the appropriate orchestrator mode with a bounded request; the CLI does not
   import the repository's roadmap automatically.
9. **Create the first bounded implementation prompt.** Include exact candidate,
   retrieved evidence, ownership, scope, exclusions, tests, documentation, and
   report requirements.
10. **Use the lab when risk warrants it.** Validate package, dependency,
    security, subprocess, network, boundary, or external-target surfaces before
    release and after material changes.

## 7. Feature-version workflow

1. Select one roadmap version goal and preserve its exclusions.
2. Group only the features necessary for that goal.
3. Check producer/orchestrator/lab or other repository prerequisites before
   implementation.
4. Create one feature/version branch from the verified base; reserve a release
   branch for the later release procedure.
5. Decompose features into context-sharing batches as defined in Phase 8.
6. For every batch, retrieve producer evidence first, execute a bounded prompt,
   run proportionate product tests, and return a structured report.
7. Commit and push each passing batch on the shared branch; do not open a pull
   request per batch or bump the version.
8. At the final implementation gate, verify scope, complete test coverage,
   clean diff, and candidate identity.
9. Run documentation reconciliation, readiness, standardized release, and
   handoff update in that order.

The orchestrator `feature` mode implements formal stage control when desired.
The feature grouping and batch strategy remain ChatGPT-owned planning.

## 8. Patch and hotfix workflow

1. Reproduce the defect against the exact published package, not merely the
   current checkout. Record registry version, tarball identity, platform, and
   invocation.
2. Establish the published annotated tag and peeled commit, for example with
   `git rev-parse "v<VERSION>^{}"`, and verify release and registry parity.
3. Create the patch branch from the published baseline. Do not mix unreleased
   enhancements into it.
4. Classify ownership before editing:
   - producer defect: indexing, static evidence, retrieval, graph, or producer
     command behavior;
   - orchestrator defect: stage, run state, artifact, prompt, integrity, or
     recovery behavior;
   - lab defect: validation, report, external target, package check, or severity
     behavior;
   - consumer documentation problem: correct behavior is misused or described
     incorrectly;
   - separate enhancement: behavior was never promised and is not a regression.
5. Retrieve bounded evidence, implement the smallest correct fix, and keep
   package metadata unchanged during implementation.
6. Add a permanent regression test that fails on the published defect and
   passes on the candidate.
7. Pack the candidate and reproduce the real consumer path against that exact
   tarball.
8. Reconcile only affected patch documentation without deleting later roadmap
   scope.
9. Run complete patch readiness and release it as a patch version through the
   standardized release workflow.

Use orchestrator `repair` mode when formal stages and correction routing are
valuable. A severity label alone does not authorize a hotfix or publication.

## 9. Multi-repository coordinated workflow

1. Begin from the latest local commit in each repository that passed its own
   readiness gates. Record every repository/commit pair.
2. Build a dependency map before implementation: API/schema changes,
   package-version ranges, artifact consumers, migration compatibility, and
   publication order. A consumer change must not assume an unpublished
   upstream contract without recording that prerequisite.
3. Implement bounded changes in every affected repository on separate branches,
   preserving each repository's ownership and validation rules.
4. Run individual readiness for every repository.
5. Run coordinated validation with exact local packs or candidate commits,
   including producer-to-orchestrator evidence compatibility and lab validation
   of the intended external targets.
6. Prepare releases separately; do not collapse histories or versioning.
7. Publish in dependency order, with each repository following its own
   standardized release sequence.
8. Reinstall exact published upstream versions in downstream consumers and
   rerun consumer validation before publishing the next dependent package.

If any cross-project prerequisite is unresolved, stop before implementation or
bound the work to compatibility preparation only. The ecosystem has no command
that automatically coordinates multi-repository release state.

## 10. Documentation-only workflow

For normal reconciliation, inventory implementation and documentation, compare
in both directions, verify commands and schemas, update only demonstrably stale
claims, run editorial review, and execute preservation checks. Do not change
production code merely to make existing prose true; raise the contradiction and
obtain separate implementation authorization.

Use forensic recovery when a document was removed, compressed, contradicted,
or its intended authority is unclear. Compare current and historical tracked
documents, tags, release notes, package evidence, command help, and bounded
source evidence. Restore meaning and traceability, not obsolete wording.

Roadmaps require special anti-drift treatment: preserve order, scope,
dependencies, exclusions, status history, and future detail. Do not silently
delete, combine, summarize away, or move milestones. Documentation-only work
must not alter package metadata, source, tests, release history, or generated
artifacts.

## 11. Security-validation workflow

### 11.1 Self-validation

Within the lab repository, use scripts that exist in the candidate:

```powershell
npm ci
npm test
npm run verify
npm run docs:check
npm run security:validate
```

`security:deps`, `security:package`, `security:codeql`, `security:semgrep`,
`test:security`, `test:fuzz:smoke`, and `audit` are also current package
scripts. Select them by the documented validation need; do not assume each
individual script has a conventional CLI `--help` surface.

### 11.2 External target validation

Run from a trusted lab checkout and point at an exact target:

```powershell
npm run security:validate -- --target <TARGET_PATH> --profile <PROFILE> --format text,json --out <REPORT_DIR> --report-prefix <PREFIX>
```

Implemented profiles are `node-cli-package`, `local-tool`, `npm-package`, and
`android`. Implemented check IDs are `deps`, `package`, `static`,
`cli-adversarial`, `fuzz`, `boundary`, `subprocess`, `secrets`, and `network`.
When neither profile nor checks is supplied, the default set is `deps`,
`package`, `static`, `cli-adversarial`, and `fuzz`. Explicit `--checks`
selection overrides profile defaults. Android profile/check allowlists are
closed; `android-compose` is an orchestrator profile, not a lab profile.

By default reports are written as:

```text
reports/security/<prefix>-security-validation.txt
reports/security/<prefix>-security-validation.json
```

The target must remain immutable: no source edits, package metadata changes,
or target-owned report output. Required check failures block according to the
chosen `--fail-on blocker|high|medium|low` threshold. Informational findings
and optional/manual checks remain visible; skipped or unavailable scanners are
not successes. Current verdicts distinguish ready, blocked, ready except
optional manual checks, and inconclusive audit environments.

Revalidate after runtime, dependency, CLI, package/export, subprocess, network,
boundary, secret-handling, or release-candidate changes. Lab validation does
not replace product unit, integration, end-to-end, or platform tests.

Producer risk labels are advisory static evidence. They are not security
findings, severity decisions, exploit proof, or lab verdicts.

## 12. Recovery workflow

Preserve the exact run, branch, commit, indexes, reports, failed command, and
diagnostics before recovery. Resume from the earliest invalidated gate; do not
restart unrelated completed work.

- **Insufficient context or missing evidence:** issue a context-refresh or
  correction prompt naming exact witnesses; rerun `search`, `lookup`, `slice`,
  and bounded `source`, then update the packet and retrieval report.
- **Required evidence lost:** rebuild or broaden only the evidence needed for
  the lost condition. Optional truncation does not justify a full restart.
- **Context conflict or ambiguity:** stop implementation, record both claims
  and provenance, and request an architecture decision from ChatGPT/user.
- **Capsule/audit mismatch:** regenerate both from the same candidate and raw
  evidence; do not manually declare the stage complete.
- **Stale index:** verify source roots and manifest, then run a full index when
  incremental freshness cannot be established.
- **Invalid candidate identity:** stop state-changing work, locate the exact
  branch/commit/tag/tarball, and invalidate evidence collected against another
  candidate.
- **Failed batch validation:** retain the branch and report, write a bounded
  correction prompt, rerun the failed test plus gates invalidated by the fix.
- **Failed continuous integration:** use the exact failing commit and logs;
  reproduce where possible, correct on the same authorized branch, and require
  the replacement exact-commit run.
- **Package-content defect:** stop release, rebuild and reinspect the pack from
  the corrected candidate, and repeat consumer smoke and invalidated gates.
- **Security blocker:** stop release/publication, preserve the lab report,
  remediate through a separately authorized prompt, and rerun the affected
  profile plus dependent readiness gates.
- **npm authentication pause:** preserve the fully prepared state and request
  human authentication/authorization. Authentication must not cause steps to
  be reordered.
- **Partial release state:** inventory branch, merge, tag, workflows, GitHub
  Release, registry version, and distribution tags. Continue only the next
  safe missing step; if npm publication already occurred, perform read-only
  checks and request authorization for any corrective release.

Use orchestrator `status`, `check`, `prompt`, correction routing, and `export`
to preserve and resume staged runs. Request user authorization whenever
recovery would expand scope, change product decisions, modify a protected
branch, alter a published release, publish, or perform another irreversible
external action.

## 13. Tool-selection decision guide

1. Use **my-dev-kit** to index a repository, locate code owners, search and
   retrieve bounded source, trace relationships, inspect static Android/Kotlin/
   Java/Compose/test/route/resource/data-flow evidence, build context evidence,
   or compare graphs.
2. Use **my-dev-kit-orchestrator** to guide a greenfield bootstrap, run staged
   architecture/implementation/documentation/verification work, maintain run
   state and artifact lifecycle, enforce formal gates, route corrections, or
   recover a blocked multi-stage run.
3. Use **my-dev-kit-lab** to validate its own controls, an external target or
   package, security and dependency boundaries, code rot, and release-risk
   evidence, and to generate validation reports.
4. Use **ChatGPT** to define version goals, translate the planning files,
   choose direct versus staged execution, resolve architecture and
   cross-project sequencing, compose prompts, verify completion reports,
   preserve the roadmap, and create handoffs.
5. Use the **coding agent** to execute a bounded authorized prompt, retrieve
   evidence, modify files, run checks, commit and push when authorized, and
   return a structured completion report.

No tool substitutes for another tool's owner. In particular, the orchestrator
does not replace producer indexing, and the lab does not replace product tests.

## 14. Artifacts and handoffs between tools

The end-to-end flow is:

```text
project-description.txt                         [manual source]
project-milestones.txt                          [manual source]
  -> project operational documents              [manual, planner-reviewed]
  -> orchestrator run/profile/bootstrap outputs [generated run artifacts]
  -> repository scaffold                        [coding-agent output]
  -> my-dev-kit index and manifest              [generated evidence]
  -> search/lookup/slice/source evidence         [generated query output]
  -> context capsule and retrieval audit        [generated + recorded evidence]
  -> architecture decisions                     [manual decision record]
  -> implementation prompts                     [orchestrator/manual]
  -> implementation reports and commits         [coding-agent evidence]
  -> documentation reconciliation report        [manual/agent evidence]
  -> readiness reports                          [repository/CI evidence]
  -> my-dev-kit-lab security reports            [generated validation evidence]
  -> release report                             [manual assembled evidence]
  -> project handoff                            [manual + orchestrator export]
```

For exact greenfield artifact names, use Phase 4. Producer generated artifacts
and their manifest are defined in its graph and command documentation. Lab
security reports use the paths in section 11. Conceptual documents such as the
roadmap, architecture decision, implementation plan, release report, and
project handoff are not created automatically merely by starting a run.

Every handoff records the artifact path, producing tool/person, candidate
commit, generation command or prompt, schema/version where applicable,
validation result, unresolved limitations, and consumer. A summary never
replaces the raw evidence needed for a required witness.

## 15. Common mistakes

- Asking the coding agent to choose direct versus staged workflow mode.
- Assuming the two planning files are automatically parsed.
- Skipping producer retrieval during direct implementation.
- Reading complete source trees before `search`, `lookup`, `slice`, and bounded
  `source` retrieval.
- Letting the orchestrator replace producer indexing or claim it ran commands.
- Creating a pull request per implementation batch.
- Putting batch logs, file lists, test counts, or commit summaries in ROADMAP.
- Treating local validation as cross-platform continuous integration.
- Letting the lab replace product tests.
- Treating producer advisory risk labels as security verdicts.
- Treating readiness as version bump, release, or publication.
- Creating a tag before exact merged-main continuous integration passes.
- Publishing npm before creating and verifying the GitHub Release.
- Performing cleanup or any other state-changing command after npm publication.
- Letting a continuation handoff reorganize, compress, or infer the plan.
- Calling a roadmap or proposal command “implemented” without current help.

## 16. Worked example

This generic example deliberately labels automation and manual work. Replace
all placeholders and consult current tool command references before execution.

### 16.1 Inputs and decision

```text
<REPOSITORY_PATH>/planning/project-description.txt
<REPOSITORY_PATH>/planning/project-milestones.txt
```

1. **Manual:** hash and preserve both files; extract agreed goal, users,
   capabilities, constraints, non-goals, milestone order, dependencies, and
   acceptance criteria into a review note. Put ambiguities in
   `unresolved-decisions` without editing the originals.
2. **Manual:** choose `FULL_STAGE_CONTEXT` because `<PROJECT_NAME>` is
   greenfield and architecture ownership is unresolved.
3. **Manual:** map explicit platform/stack facts to a supported profile. If the
   facts support `typescript-cli`, select it in the `starter-profile` stage. If
   they do not support any current profile, record a custom manual scaffold
   contract; do not invent a profile or CLI flag.

### 16.2 Run and bootstrap

```powershell
Set-Location <REPOSITORY_PATH>
npx @dailephd/my-dev-kit-orchestrator init
npx @dailephd/my-dev-kit-orchestrator start --mode greenfield "Create <PROJECT_NAME> for <GOAL>; preserve the supplied planning scope"
npx @dailephd/my-dev-kit-orchestrator prompt
```

**Implemented:** the orchestrator creates the run and emits each stage prompt.
**Manual/agent:** answer the prompts from the preserved inputs, review the
profile and bootstrap bundle, write initial project documents, implement the
approved scaffold plan, and produce the first vertical slice. After each
artifact, run `prompt` again and use `status`/`check` to verify lifecycle state.

### 16.3 Git and first index

**Manual:** initialize Git, add explicit project files, commit the verified
scaffold to `main`, create the approved remote, then create
`<FEATURE_BRANCH>` for `<VERSION>` implementation. No ecosystem command creates
the remote.

After source and tests exist:

```powershell
npx @dailephd/my-dev-kit index --root <REPOSITORY_PATH> --src src --out <REPOSITORY_PATH>\.my-dev-kit --call-graph --json
npx @dailephd/my-dev-kit search --index <REPOSITORY_PATH>\.my-dev-kit --query "<CORE_WORKFLOW>" --json
```

**Implemented:** the producer writes the index/manifest and returns bounded
evidence. **Manual:** record the command, commit, source roots, manifest, and
limitations in `reports/initial-index-report.txt`.

### 16.4 Architecture, version, and batches

**Manual:** build architecture context using search → lookup → slice → source,
then verify owner, extension, contract, tests/gaps, provenance, freshness, and
capsule/audit parity. Complete the architecture decision only when required
witnesses are sufficient.

Translate the first preserved milestone into:

```text
Version goal: <VERSION_GOAL>
Features: <FEATURE_A>, <FEATURE_B>
Batch 1: shared contract and vertical behavior
Batch 2: dependent interface and tests
Exclusions: <EXCLUDED_FUTURE_SCOPE>
```

This decomposition is manual. It must preserve milestone order and must not
pull features from later milestones.

### 16.5 Implementation and documentation

For each batch, ChatGPT sends the coding agent a bounded prompt naming
`<FEATURE_BRANCH>`, exact base commit, retrieved nodes/ranges, authorized files,
tests, exclusions, documentation impact, commit/push authority, and completion
report. The agent retrieves first, implements, tests, commits, pushes, and
reports. ChatGPT checks the diff and evidence before the next batch.

After the final batch, run the Phase 10 reconciliation. Verify real command
help, generated artifacts and schemas, roadmap preservation, and changelog
claims. Keep implementation logs out of the roadmap.

### 16.6 Readiness, security, and release

**Manual/CI:** pin the exact candidate, run all project checks, cross-platform
CI, deterministic and package/consumer checks, documentation preservation, and
the lab profile appropriate to the project:

```powershell
Set-Location <LAB_REPOSITORY_PATH>
npm run security:validate -- --target <REPOSITORY_PATH> --profile node-cli-package --format text,json --out <READINESS_REPORT_PATH> --report-prefix <PROJECT_NAME>-<VERSION>
```

Use another implemented lab profile only when it matches the target. Resolve
required failures and rerun invalidated gates. Then, with explicit release
authorization, follow all 18 Phase 12 steps. The only publication command is
run last:

```powershell
npm publish --access public
```

### 16.7 Handoff

**Manual plus implemented export:** after final-report eligibility, export the
orchestrator run and create a project handoff containing exact commits,
published version/tag/tarball, report paths, completed milestone summary,
preserved remaining milestones, reusable gates, risks, and the precise next
action. Maintain the 50/30/10/10 future/workflow/history/current balance. A new
chat resumes from that state; it does not reinterpret the original files.

## 17. Source map

The source map records the tracked documentation and command/implementation
areas used to ground this guide. “Command help” means the locally built current
CLI, not a roadmap proposal. No large source excerpts are reproduced.

### 17.1 Producer — `b2fb19b72f2148127cbec194ea2317d90ffbd27d`

- `README.md`, `docs/QUICKSTART.md`, `docs/COMMANDS.md`: package role,
  installation, current command and flag surface, stable index, and query flow.
- `docs/ARCHITECTURE.md`, `docs/GRAPH_SCHEMA.md`, `docs/PROJECT_OVERVIEW.md`:
  read-only boundaries, manifest/artifact authority, graphs, classification,
  language/framework evidence, and limitations.
- `docs/WORKFLOWS.md`, `docs/DEVELOPMENT.md`: retrieval-first workflow,
  context roles, adequacy, incremental/full behavior, testing, and contributor
  validation.
- `docs/SECURITY.md`, `docs/CI_CD.md`: advisory risk semantics, security
  boundary, cross-platform/Node matrix, JSON diagnostics, Graphviz, and
  deterministic evidence.
- `docs/RELEASE.md`, `CHANGELOG.md`, `docs/ROADMAP.md`,
  `docs/PROJECT_PROGRESS.md`: current release state, readiness/publication
  separation, fixed release ordering, implemented versus planned scope.
- `docs/DOCUMENTATION_PRESERVATION_POLICY.md` and
  `docs/documentation-preservation-manifest.json`: documentation anti-drift and
  preservation checks.
- `examples/README.md`, `examples/basic-data-model-ts/README.md`,
  `examples/basic-python/README.md`, `examples/basic-react-tsx/README.md`, and
  `examples/basic-ts/README.md`: supported example invocation patterns.
- `benchmarks/retrieval/v1.7/README.md`: maintainer-only retrieval regression
  workflow and its explicit separation from public commands and lab security
  validation.
- `LICENSE`: package license only; no workflow claim.
- Built command help verified: `index`, `search`, `lookup`, `source`, `slice`,
  `view`, `data-model`, `context`, and `graph-diff`; `--version` returned
  `1.12.1`.

### 17.2 Workflow controller — `cc5f54e7bcc25e9733ce1331f9a4dbb75efa9db2`

- `README.md`, `docs/USAGE.md`, `docs/WORKFLOWS.md`: eight-command surface,
  seven modes, greenfield stages/profiles, manual integrations, status,
  checks, and recovery.
- `docs/ARTIFACTS.md`, `docs/ARCHITECTURE.md`: run layout, exact artifact
  contracts, lifecycle, supplemental context, readiness, run integrity,
  instruction packets, and export.
- `docs/DEVELOPMENT.md`: build/test workflow and source ownership.
- `docs/RELEASE_CHECKLIST.md`, `CHANGELOG.md`, `docs/ROADMAP.md`: release and
  validation policy, published behavior, limitations, and planned work.
- `docs/DOCUMENTATION_PRESERVATION_POLICY.md` and
  `docs/documentation-preservation-manifest.json`: documentation preservation.
- `tests/fixtures/context-contracts/my-dev-kit-1.10.2/README.md` and the
  `tests/fixtures/v120-baseline`, `v121-compatibility`, and `v123-batch4`
  fixture READMEs: historical compatibility, frozen run-integrity evidence,
  fixture provenance, and immutability; they do not override current help.
- `LICENSE`: package license only; no workflow claim.
- Built command help verified: `init`, `start`, `status`, `prompt`, `list`,
  `mark`, `check`, and `export`; `--version` returned `1.3.0`.
- Bounded producer retrieval verified `src/greenfield/brief/loadProjectBrief.ts`,
  the `GreenfieldProjectBrief` data model, profile resolution, aliases,
  bootstrap document names, and absence of literal two-file ingestion. The
  complete 67-line brief-loader file was read only after search, lookup, slice,
  symbol source, continuation, and local dependency/import retrieval established
  the material CLI-versus-programmatic ambiguity.

### 17.3 Validation tool — checked-out `dd715df1fe37d96b42c6ebcecf9a92f0e29a4151`; `origin/main` `4dd7cb8ff0662ff6fd550dbf648eb0c4f13d5b23`

- `README.md`, `docs/COMMANDS.md`, `docs/WORKFLOWS.md`: package role, scripts,
  validation command/flags/profiles/checks, target immutability, report paths,
  readiness, code-rot, and publication boundaries.
- `docs/ARCHITECTURE.md`, `docs/PROJECT_OVERVIEW.md`,
  `docs/CURRENT_STATE.md`: architecture, external-target/package behavior,
  current package state, and limitations.
- `docs/security-validation-framework.md`: security stages, severity/report
  model, optional scanners, and manual-test boundary. Its closing `v0.4.4`
  statement is stale; package metadata, npm registry evidence, README,
  `CURRENT_STATE`, and roadmap consistently establish `0.4.5`.
- `docs/context-integrity-report-schema.md` and
  `docs/context-integrity-fixtures.md`: context-integrity report and fixture
  evidence; current support is programmatic/test-driven rather than a new
  public composite-score CLI.
- `docs/METRICS.md`, `docs/GALLERY.md`, `docs/TUTORIAL.md`: evidence quality,
  demonstrations, and operator examples.
- `docs/ROADMAP.md`, `CHANGELOG.md`: implemented profiles/checks, release
  history, code-rot status, and planned quality/project/all audits.
- `docs/DOCUMENTATION_PRESERVATION_POLICY.md` and
  `docs/documentation-preservation-manifest.json`: documentation preservation.
- `benchmarks/projects/README.md` and the six tracked benchmark-project
  READMEs: deterministic benchmark inventory and complexity intent, not
  production validation commands.
- `examples/demo-report-input.json`, `examples/lab-demo-cases.json`,
  `examples/real-agent-campaign-cases.json`, and
  `examples/token-savings-cases.json`: report/campaign fixture schemas and
  explicit limits on example claims.
- The six `tests/fixtures/audits/mixed-language/*/README.md` files: current
  mixed-language fixture intent, generated/vendor exclusions, and explicit
  planned-not-implemented audit claims.
- `LICENSE`: package license only; no workflow claim.
- Current `security:validate --help` and `audit --help` were verified. Package
  scripts were verified for self, dependency, package, static-scanner,
  adversarial, fuzz-smoke, audit, and report flows. The package bin is the
  final-demo runner rather than a unified lab CLI, so this guide documents npm
  scripts instead of inventing `dist/cli.js` subcommands.

### 17.4 Version and publication evidence

The three inspected `package.json` files and `npm view <package> version`
reported producer `1.12.1`, orchestrator `1.3.0`, and lab `0.4.5`. Latest local
tags were respectively `v1.12.1`, `v1.3.0`, and `v0.4.5`.
