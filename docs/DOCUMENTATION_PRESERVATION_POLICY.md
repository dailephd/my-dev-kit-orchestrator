# Documentation preservation policy

## Classes and authority

Planning documents preserve agreed version-by-version scope. Current-state
documents follow implementation, package metadata, CLI output, and tests.
Historical documents follow tags, releases, registries, and Git history. Mixed
documents apply the relevant authority to each section.

Later explicit decisions override older conflicting plans. Implementation may
update a plan's status, but must not erase future scope.

## Preservation rules

Documentation work is append-preserving by default. It must not remove or
compress roadmap versions, planned features, release entries, command
families, workflow stages, artifact lifecycle invariants, architecture domains,
validation categories, project pillars, or canonical links.

Every documentation prompt that proposes removal must include
`ALLOWED_DOCUMENT_REMOVALS`; its default value is `none`. Roadmap removals,
future-version removals, release-history removals, and compression are also
`none` unless explicitly authorized.

Do not merge versions into ranges, reorder versions, move a feature between
versions, or replace a detailed plan with a deferred-work summary without
explicit evidence and authorization. A superseded assignment must record its
former location, replacement/deferred location, and evidence.

## Reconciliation and stop thresholds

Reconciliation may correct current commands, statuses, architecture facts, and
artifact contracts. It must not infer future scope from implementation or
rewrite a multi-domain document as a latest-feature summary.

Before commit, stop when an unapproved required structure disappears, a
planning document loses more than 15% of nonblank lines, or a document becomes
a materially shorter summary. Capture before/after inventories and report each
authorized removal, source evidence, and unresolved ambiguity.
