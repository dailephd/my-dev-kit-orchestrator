# Release Checklist

## v0.2.1 checklist

### Documentation verification

- [ ] verify docs do not claim `--mode extraction` runtime support unless source code proves it is implemented
- [ ] verify extraction docs clearly distinguish source repository (evidence) from target repository (implementation destination)
- [ ] verify source repository is documented as read-only evidence by default
- [ ] verify target repository is documented as the implementation destination
- [ ] verify all five extraction artifacts are documented with paths, required sections, and templates:
  - [ ] `SourceWorkflowMap` at `artifacts/source-workflow-map.txt`
  - [ ] `SourceToTargetPortingMap` at `artifacts/source-to-target-porting-map.txt`
  - [ ] `DoNotPortList` at `artifacts/do-not-port-list.txt`
  - [ ] `GoldenBehaviorContract` at `artifacts/golden-behavior-contract.txt`
  - [ ] `TargetArchitectureProposal` at `artifacts/target-architecture-proposal.txt`
- [ ] verify `GoldenBehaviorContract` is documented as mandatory before pseudocode and test strategy
- [ ] verify source and target `.my-dev-kit` artifact directories are documented as separate
- [ ] verify docs do not recommend copying files directly from source to target
- [ ] verify docs do not describe extraction mode as "cloning the source architecture"
- [ ] verify docs do not use the word "bridge" in public-facing descriptions
- [ ] verify ROADMAP.md marks v0.2.1 as planned (not implemented) for extraction mode runtime
- [ ] verify CHANGELOG.md entry correctly lists documentation additions, not runtime implementation

### Forbidden wording check

Run:

```bash
rg -n "\bbridge\b|Bridge|BRIDGE" README.md ARCHITECTURE.md ROADMAP.md CHANGELOG.md docs
```

Expected: no matches in public documentation files.

### Extraction terminology consistency check

Run:

```bash
rg -n "extraction|SourceWorkflowMap|SourceToTargetPortingMap|DoNotPortList|GoldenBehaviorContract|TargetArchitectureProposal" README.md docs/ARCHITECTURE.md docs/ROADMAP.md CHANGELOG.md docs/WORKFLOWS.md docs/ARTIFACTS.md docs/USAGE.md
```

Expected: consistent use of extraction terminology across all updated files.

### Dangerous wording check

Run:

```bash
rg -n "copy files|clone the old system|inherit the full source architecture" README.md docs
```

Expected: no matches, or matches only in warnings against those behaviors.

### Validation commands

```bash
npx tsc --noEmit
npm test
npm run build
npm run lint
```

### File staging check

Stage only:

```bash
git add README.md CHANGELOG.md docs/ARCHITECTURE.md docs/ROADMAP.md docs/WORKFLOWS.md docs/ARTIFACTS.md docs/USAGE.md docs/RELEASE_CHECKLIST.md
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

---

## v0.2.0 checklist (reference)

- [x] architecture-context stage prompt updated with graph-guided retrieval sequence
- [x] retrieval evidence report template included in generated prompt
- [x] explicit output paths in generated prompt
- [x] synthesis instruction added to architecture-context prompt
- [x] fallback guidance for missing `my-dev-kit`
- [x] supporting report visibility in `status` output
- [x] `getSupportingReportStatuses` function added
- [x] tests updated for new stage detector behavior
- [x] documentation updated for graph-guided architecture context

---

## v0.1.0 checklist (reference)

- [x] CLI commands: `init`, `start`, `status`, `prompt`, `list`
- [x] workflow modes: `feature`, `repair`, `test`, `refactor`, `harden`
- [x] local workspace initialization
- [x] run creation with required metadata files
- [x] generated stage prompt files
- [x] plain-text artifact naming and file-existence stage tracking
- [x] Jest test coverage
- [x] documentation for all modes, commands, artifacts, and workflows
