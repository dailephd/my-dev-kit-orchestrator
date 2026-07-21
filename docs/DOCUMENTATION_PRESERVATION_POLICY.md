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
context, and record the move in a relocation ledger.

## Reconciliation and stop threshold

Documentation reconciliation may correct current status, commands,
architecture descriptions, artifact contracts, and release state. It must not
derive future plans from implementation or remove unimplemented plans.

Before commit, stop when protected structure disappears, a deletion lacks
authorization, or a planning document loses more than 15 percent of its
nonblank lines without a documented relocation. Review before-and-after
inventories and the complete diff before staging documentation changes.
