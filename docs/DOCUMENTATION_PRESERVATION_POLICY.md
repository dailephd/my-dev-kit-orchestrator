# Documentation preservation policy

This policy protects the repository's public documentation from accidental
deletion, compression, and status drift.

## Document classes and authority

- Planning documents preserve agreed version-by-version scope. Later explicit
  planning decisions override older conflicting assignments.
- Current-state documents follow package metadata, implementation, CLI help,
  and tests.
- Historical documents follow Git tags, GitHub Releases, npm publication
  records, and Git history.
- Mixed documents apply the relevant authority to each section.

Implementation may change a planned version's status. It must not erase future
scope or unrelated plans.

Committed technical documentation describes the current repository: public
usage, implemented architecture, workflow behavior, file contracts,
contributor guidance, release history, and current limitations. The committed
roadmap owns version goals, feature assignments, dependencies, exclusions,
acceptance criteria, and deferred or version-TBD work. Per-batch implementation
tracking, command transcripts, changed-file lists, temporary branch state, and
publication tracking belong in a local untracked plain-text plan.

The local plan is not canonical documentation, is not linked from public
documents, is not required in ordinary clones, and is not included in package
output. Its content never overrides implementation, tests, package metadata,
or compatibility fixtures.

## Protected structure

Documentation work must preserve:

- roadmap versions, goals, feature assignments, exclusions, and deferred work;
- changelog releases and historical limitations;
- command families, workflow modes, stage order, and stage gates;
- artifact contracts, filenames, states, and lifecycle invariants;
- architecture domains and companion-tool boundaries;
- contributor validation categories;
- project pillars, limitations, and canonical documentation links.

Every documentation prompt that authorizes removal must include
`ALLOWED_DOCUMENT_REMOVALS`. The default is `none`. Roadmap removals,
future-version removals, release-history removals, and document compression
also default to `none` unless the prompt explicitly authorizes exact items.

## Reorganization and relocation

Do not merge versions into ranges, reorder versions, move features between
versions, or replace detailed plans with a generic deferred-work list without
explicit evidence and authorization.

Content may move to its canonical document when the destination preserves its
complete meaning. Keep a summary and link at the source when readers still need
context, and record the move in a relocation ledger. The preservation manifest
is the permanent ledger for canonical document ownership, protected facts,
required structure, and duplication boundaries; run-specific forensic notes
belong in the run reports.

## Reconciliation and stop threshold

Documentation reconciliation may correct current status, commands,
architecture descriptions, artifact contracts, and release state. It must not
derive future plans from implementation or remove unimplemented plans.

Before commit, stop when protected structure disappears, a deletion lacks
authorization, or a planning document loses more than 15 percent of its
nonblank lines without a documented relocation. Review before-and-after
inventories and the complete diff before staging documentation changes.

Run `npm run docs:check` after reconciliation. The checker must derive stable
public facts from implementation owners where practical, compare them with the
preservation manifest and canonical documents, and emit actionable stable
issue codes for contradictions. It complements review; it does not make
existing prose authoritative over current implementation.

Each canonical document also has a structural contract covering purpose,
temporal lens, planning policy, required and forbidden headings, forbidden
content, major heading order, version-status policy, source owners, and
duplication boundaries. The documentation gate validates required claims and
the absence of contradictory or structurally invalid planning material.

When a public contract is represented by a stable source interface, the
checker should derive its field inventory from that owner and compare it with
the manifest. Documentation must not claim workflow, stage, or run identity
validation unless an implementation owner enforces that identity.
