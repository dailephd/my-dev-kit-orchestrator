// Types for the platform-neutral project-docs bootstrap runtime.
//
// Adapted in concept from my-dev-kit-alpha's projectDocBootstrapTypes.ts
// (populated/partial/skipped status) but the shape is orchestrator-native:
// docs are generated as structured in-memory sections, not by filling
// markdown template files loaded from disk (see artifacts/greenfield-do-not-
// port-list.txt, "duplicate old/new template layouts").

import { GreenfieldUnresolvedDecision } from './bootstrapBundleTypes';

export type GreenfieldDocStatus = 'generated' | 'partial' | 'skipped';

export interface GreenfieldDocSection {
  heading: string;
  content: string;
}

/** The nine required v1.1.0 project-doc categories (section 9.2). */
export type GreenfieldProjectDocName =
  | 'product-boundary'
  | 'stack-decision'
  | 'starter-profile-summary'
  | 'development-workflow'
  | 'testing-expectations'
  | 'validation-expectations'
  | 'scaffold-planning-notes'
  | 'unresolved-decisions'
  | 'non-goals';

export interface GreenfieldDocTarget {
  docName: GreenfieldProjectDocName;
  status: GreenfieldDocStatus;
  sections: GreenfieldDocSection[];
  unresolvedNotes: string[];
}

export interface GreenfieldComponentDocTarget {
  componentName: string;
  status: GreenfieldDocStatus;
  sections: GreenfieldDocSection[];
  unresolvedNotes: string[];
}

export interface GreenfieldProjectDocBootstrapResult {
  targets: GreenfieldDocTarget[];
  componentTargets: GreenfieldComponentDocTarget[];
  unresolvedDecisions: GreenfieldUnresolvedDecision[];
}
