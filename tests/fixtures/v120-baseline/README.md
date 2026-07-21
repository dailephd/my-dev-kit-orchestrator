# v1.2.0 compatibility baseline

This fixture records the public and internal compatibility surface of the verified committed v1.2.0 implementation baseline. Later v1.2.1 batches may use it to detect accidental changes to modes, stage order, artifact and prompt paths, lifecycle behavior, correction routing, CLI commands, greenfield profiles, and validation scripts.

`contract-inventory.json` is test evidence, not runtime configuration. It was generated from commit `983a476da2d483f76f92fef73a0b324c9ed77ea7`; the separate uncommitted editorial overlay in the original preservation-only worktree was deliberately excluded.

Update this fixture only as the result of an intentional compatibility decision. Documentation reconciliation for the external editorial overlay remains a release-preparation task and must not be inferred from this fixture.
