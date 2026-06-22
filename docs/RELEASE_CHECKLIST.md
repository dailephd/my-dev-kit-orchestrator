# Release Checklist

## v0.2.1 checklist

### Runtime implementation verification

- [ ] `start --mode extraction --source <path> --target <path> "<request>"` creates a run
- [ ] extraction without `--source` fails with a clear error message
- [ ] extraction without `--target` fails with a clear error message
- [ ] non-extraction modes do not require `--source` or `--target`
- [ ] source and target paths are stored in `run.json`
- [ ] source repository remains read-only evidence during run creation
- [ ] extraction run artifacts are created under the target repo (`<target>/.my-dev-kit-orchestrator/runs/<run-id>/`)
- [ ] `status` shows source and target repo paths for extraction runs
- [ ] extraction mode stage order matches the 14-stage spec
- [ ] `porting-map` stage requires both `source-to-target-porting-map.txt` and `do-not-port-list.txt`
- [ ] `golden-behavior-contract` is required before `pseudocode-packet` can be the next stage
- [ ] implementation cannot be the next stage until all 6 pre-implementation artifacts exist
- [ ] all extraction prompt stages have required sections: Stage, Workflow mode, Task, Required output artifact, Output file, Stop conditions, Return format

### Documentation verification

- [ ] verify extraction docs clearly distinguish source repository (evidence) from target repository (implementation destination)
- [ ] verify source repository is documented as read-only evidence by default
- [ ] verify target repository is documented as the implementation destination
- [ ] verify source and target `.my-dev-kit` directories are documented as separate
- [ ] verify extraction artifacts are documented with paths and responsibilities
- [ ] verify `GoldenBehaviorContract` is documented as mandatory before pseudocode and test strategy
- [ ] verify docs do not recommend copying files directly from source to target
- [ ] verify docs do not recommend recreating the full source architecture in the target
- [ ] verify docs do not use the forbidden legacy term in public-facing descriptions
- [ ] verify ROADMAP.md marks v0.2.1 as implemented
- [ ] verify CHANGELOG.md lists runtime extraction and cross-platform validation additions

### Forbidden wording check

Run a case-insensitive search for the forbidden legacy term across public docs and code-facing text.

Expected: no matches in public documentation files and no literal usage in tests or generated prompt text.

### Extraction terminology consistency check

Run:

```bash
rg -n "extraction|SourceWorkflowMap|SourceToTargetPortingMap|DoNotPortList|GoldenBehaviorContract|TargetArchitectureProposal" README.md docs/ARCHITECTURE.md docs/ROADMAP.md CHANGELOG.md docs/WORKFLOWS.md docs/ARTIFACTS.md docs/USAGE.md
```

Expected: consistent extraction terminology across all updated files.

### Dangerous wording check

Run:

```bash
rg -n "copy files|clone the old system|inherit the full source architecture|read whole source files first" README.md docs
```

Expected: no matches, or matches only in warnings against those behaviors.

### Cross-platform CI verification

- [ ] GitHub Actions OS matrix passes on:
  - [ ] `ubuntu-latest`
  - [ ] `windows-latest`
  - [ ] `macos-latest`
- [ ] typecheck passes on all three OSes
- [ ] `npm test` passes on all three OSes
- [ ] `npm run build` passes on all three OSes
- [ ] `npm run lint` passes on all three OSes
- [ ] CLI smoke passes on all three OSes
- [ ] extraction CLI smoke passes on all three OSes
- [ ] extraction mode tested with OS-native absolute paths
- [ ] extraction mode tested with paths containing spaces
- [ ] extraction mode tested with relative `--source` and `--target` paths normalized to absolute
- [ ] package dry run remains clean

### Validation commands

```bash
npx tsc --noEmit
npm run build
npm test
npm run lint
```

### Package dry-run and forbidden file check

- [ ] `npm pack --dry-run` does not include `node_modules/`
- [ ] `npm pack --dry-run` does not include `.my-dev-kit-orchestrator/`
- [ ] `npm pack --dry-run` does not include `.my-dev-kit/`
- [ ] `npm pack --dry-run` does not include `agents.txt` or `claude.txt`
- [ ] `npm pack --dry-run` does not include `.env` files, logs, temp files, or local tarballs

### File staging check

Stage only:

```bash
git add README.md CHANGELOG.md docs/ARCHITECTURE.md docs/ROADMAP.md docs/WORKFLOWS.md docs/ARTIFACTS.md docs/USAGE.md docs/DEVELOPMENT.md docs/RELEASE_CHECKLIST.md package.json
```

Do not stage:

- `agents.txt`
- `claude.txt`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/*.txt`
- `.idea/`
- `.my-dev-kit-orchestrator/`
- `.my-dev-kit`
- `.env`
- logs
- temporary files
- npm tarballs
