# my-dev-kit 1.10.2 role-context fixtures

These normalized fixtures exercise the `architecture`, `implementation`, and `test-implementation` repository-context contracts against the isolated orchestrator v1.2.0 baseline at commit `983a476da2d483f76f92fef73a0b324c9ed77ea7`.

The producing CLI was built from the clean `@dailephd/my-dev-kit` 1.10.2 repository at commit `1496ff426f1d4dbc662a2257fcf43d3754c4407d`. The published package named `@dailephd/my-dev-kit@1.10.2` was not used because its installed CLI reported 1.0.0 and did not expose the verified role-aware `context` command. This fallback and limitation are intentional provenance.

The implementation fixture is pre-implementation evidence: it does not assert that v1.2.1 source changes exist. The test-implementation request uses controlled synthetic changed inputs for `src/workflows.ts`, `src/promptGenerator.ts`, `getAllWorkflows`, and `generateStagePrompt`. They are fixture inputs, not Git changes.

`test-strategy-sample.txt` owns criticality on the orchestrator side. The current my-dev-kit request accepts only responsibility ID strings, normalizes them as noncritical, and therefore does not preserve that criticality in responsibility mappings. All four mappings are honestly retained as `partially-mapped`.

Normalization replaces timestamps and machine-specific worktree, index, request, output, audit, and temporary-root paths. It recursively sorts object keys while preserving deterministic array order and all evidence, adequacy, freshness, budget, truncation, warning, fallback, mapping, and provenance fields. Independent normalized runs compared byte-for-byte for every capsule and audit.

Known fixture limitations are the CLI's Vitest-only configuration discovery (this repository uses Jest), deferred `upstreamArtifactRefs` behavior, unknown freshness without before/after index identity, and role-adequacy warnings where required evidence groups are absent or truncated. These are contract evidence and must not be normalized away.

The requests use `index` without `root`. The verified request normalizer rejects an external index when `root` is also present unless the index is exactly `<root>/.my-dev-kit`; Batch 0 was required to keep indexes outside every repository. The capsule's index manifest still records the normalized project root.
