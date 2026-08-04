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

export function bootstrapProjectDocs(
  bundle: GreenfieldBootstrapBundle,
): GreenfieldProjectDocBootstrapResult {
  const targets = populateProjectDocsFromBrief(bundle);
  const componentTargets = populateComponentDocsFromBrief(bundle);

  return {
    targets,
    componentTargets,
    unresolvedDecisions: bundle.unresolvedDecisions,
  };
}
