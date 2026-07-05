// Generates component/module doc targets from a GreenfieldBootstrapBundle.
//
// The v1.1.0 GreenfieldProjectBrief/NormalizedGreenfieldBrief (Batch 2) does
// not capture module/component hints (unlike my-dev-kit-alpha's
// candidateModuleHints). Rather than inventing component boundaries not
// present in the brief (section 9.4: "should not invent complex
// architecture... should mark uncertain component boundaries as
// unresolved"), this always returns an empty target list; the corresponding
// unresolved-decision entry is already recorded on the bundle itself (see
// buildBootstrapBundle.ts's `componentBoundaries` unresolved decision).

import { GreenfieldBootstrapBundle } from './bootstrapBundleTypes';
import { GreenfieldComponentDocTarget } from './projectDocBootstrapTypes';

export function populateComponentDocsFromBrief(
  _bundle: GreenfieldBootstrapBundle,
): GreenfieldComponentDocTarget[] {
  return [];
}
