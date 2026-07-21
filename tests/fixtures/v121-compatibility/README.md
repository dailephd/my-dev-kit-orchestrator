# v1.2.1 compatibility manifest (Batch 6)

`compatibility-manifest.json` is a release-candidate test fixture, not
runtime configuration and not packaged. It is derived programmatically from
the actual runtime workflow, CLI, and schema owners (`src/workflows.ts`,
`src/program.ts`, `src/judgeParser.ts`, `src/artifactLifecycle.ts`, and the
`src/instructions/**` schema constants) by
`tests/compatibilityManifestLib.ts` -- never hand-authored -- so it cannot
silently drift from the implementation it describes.

Regenerate with:

```
GENERATE_COMPATIBILITY_MANIFEST=1 npx jest tests/generateCompatibilityManifest.generate.test.ts --runInBand
```

The generator itself proves determinism (builds the manifest twice per run
and requires byte-identical JSON) before writing the file. The manifest
contains no timestamps or random identifiers.

Validated by `tests/v121CompatibilityManifest.test.ts`, which additionally
cross-checks it against `tests/fixtures/v120-baseline/contract-inventory.json`
for every field that must remain unchanged from v1.2.0 (mode names, stage
order, prompt/artifact filenames, lifecycle states, judge verdicts,
correction route statuses, greenfield profiles, CLI command surface).
