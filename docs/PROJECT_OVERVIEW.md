# Project overview

## Product thesis

`my-dev-kit-orchestrator` is a CLI-first workflow coordinator for design-first software work performed with coding agents. It turns a development request into a deterministic sequence of bounded prompts, persists the resulting artifacts, and keeps implementation, testing, verification, judge review, correction routing, and final handoff tied to the same run.

The package is `@dailephd/my-dev-kit-orchestrator`; the executable is `my-dev-kit-orchestrator`. It is intended for maintainers and coding-agent users who need an inspectable workflow instead of a single unbounded implementation prompt.

## Problems solved

- Preserves design intent across implementation and test stages.
- Makes stage progress, blockers, lifecycle state, and correction routing inspectable.
- Gives each stage an exact workflow-instruction packet and artifact contract.
- Accepts bounded repository evidence without pretending to own retrieval.
- Guides greenfield projects from a brief through scaffold implementation, verification, a first vertical slice, and an initial indexing handoff.
- Exports a portable run record for review or continuation.

## Capability areas

The current implementation supports seven modes: `feature`, `repair`, `test`, `refactor`, `harden`, `extraction`, and `greenfield`. Across them it owns run creation and discovery, prompt rendering, artifact/lifecycle checks, context-readiness evaluation, run-integrity enforcement, judge verdict acceptance, correction routing, status, and export.

Greenfield supports the `typescript-cli`, `nextjs-app`, and `android-compose` starter profiles. Profiles shape planning, scaffold targets, documentation, and verification expectations; the orchestrator itself does not generate or execute the project.

## Ecosystem relationship

- `my-dev-kit` owns repository indexing, bounded retrieval, and static source evidence.
- `my-dev-kit-orchestrator` owns staged workflows, prompts, artifacts, readiness, lifecycle policy, and handoff.
- `my-dev-kit-lab` owns experiments, audits, security validation, evidence reporting, and release-readiness support.

The integrations are explicit. The orchestrator does not automatically execute either companion tool.

## Evidence and output model

A run lives beneath `.my-dev-kit-orchestrator/runs/` by default and contains request metadata, prompts, stage artifacts, lifecycle state, deterministic check output, and final/export material. Supplemental repository-context packets are inputs to readiness; they are not native lifecycle artifacts. See [ARTIFACTS.md](ARTIFACTS.md) for exact file and schema contracts.

## Non-goals and long-term boundary

The product is not an autonomous coding agent, package publisher, security scanner, repository indexer, or proof of runtime correctness. It does not run Gradle, require an Android SDK, or claim store readiness. Its durable boundary is workflow coordination and bounded evidence policy; companion tools retain their own execution and evidence authority.

See [CURRENT_STATE.md](CURRENT_STATE.md) for the operational baseline, [ARCHITECTURE.md](ARCHITECTURE.md) for implementation ownership, and [ROADMAP.md](ROADMAP.md) for future versions.
