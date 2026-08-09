// Orchestrates the platform-neutral project-docs bootstrap runtime.
//
// Adapted in concept from my-dev-kit-alpha's bootstrapProjectDocs.ts, but
// operates entirely on an in-memory GreenfieldBootstrapBundle: no template
// files are read from disk, no files are written, and no README.md or other
// current-repository doc is touched (section 9.1).

import { GreenfieldBootstrapBundle } from './bootstrapBundleTypes';
import { GreenfieldProjectDocBootstrapResult } from './projectDocBootstrapTypes';
import { populateProjectDocsFromBrief } from './populateProjectDocsFromBrief';
import { populateComponentDocsFromBrief } from './populateComponentDocsFromBrief';
import { populateCanonicalProjectDocumentsFromBrief } from './populateCanonicalProjectDocumentsFromBrief';

export function bootstrapProjectDocs(
  bundle: GreenfieldBootstrapBundle,
): GreenfieldProjectDocBootstrapResult {
  const targets = populateProjectDocsFromBrief(bundle);
  const componentTargets = populateComponentDocsFromBrief(bundle);
  // v1.3.1 Batch 2: the standardized common canonical document baseline,
  // additive to the legacy `targets` above (see projectDocBootstrapTypes.ts).
  const canonicalDocuments = populateCanonicalProjectDocumentsFromBrief(bundle);

  return {
    targets,
    componentTargets,
    canonicalDocuments,
    unresolvedDecisions: bundle.unresolvedDecisions,
  };
}
