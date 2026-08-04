// Bounded loader for greenfield project brief inputs.
//
// Adapted from my-dev-kit-alpha's src/newProject/loadProjectBrief.ts
// (PORT_FROM_MY_DEV_KIT, see artifacts/greenfield-porting-map.txt). The
// original's ts-node CLI entry-point routing is intentionally not ported
// (artifacts/greenfield-do-not-port-list.txt: "duplicate old commands when
// current orchestrator mode can expose the behavior cleanly") -- this module
// only loads and validates brief content; it does not parse argv and does not
// write any files.

import * as fs from 'fs';
import { GreenfieldProjectBrief } from './briefTypes';
import { validateGreenfieldProjectBrief } from './briefSchema';

export interface LoadGreenfieldBriefOptions {
  /** Path to a JSON file matching the GreenfieldProjectBrief shape. */
  briefFile?: string;
  /** An already-parsed brief object (e.g. supplied programmatically). */
  brief?: GreenfieldProjectBrief;
  /** Inline free-text project idea, used when no structured brief is available. */
  rawIdeaText?: string;
}

/**
 * Loads a GreenfieldProjectBrief from the provided options.
 *
 * Priority: briefFile (JSON) -> brief (inline object) -> rawIdeaText (inline string).
 * Throws a descriptive error if none are provided or if the loaded content is invalid.
 */
export function loadProjectBrief(
  options: LoadGreenfieldBriefOptions,
): GreenfieldProjectBrief {
  if (options.briefFile) {
    return loadBriefJson(options.briefFile);
  }

  if (options.brief !== undefined) {
    return validateGreenfieldProjectBrief(options.brief, 'inline brief object');
  }

  if (typeof options.rawIdeaText === 'string' && options.rawIdeaText.trim() !== '') {
    return { rawIdea: options.rawIdeaText.trim() };
  }

  throw new Error(
    'loadProjectBrief: a project idea is required. ' +
      'Provide one of: briefFile (JSON), brief (inline object), or rawIdeaText (inline string).',
  );
}

/**
 * Loads and validates a GreenfieldProjectBrief from a JSON file.
 * Throws with a descriptive error if the file cannot be read, is not valid
 * JSON, or does not satisfy the required brief shape.
 */
export function loadBriefJson(filePath: string): GreenfieldProjectBrief {
  let raw: unknown;
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `loadProjectBrief: failed to load brief from "${filePath}": ${(err as Error).message}`,
    );
  }
  return validateGreenfieldProjectBrief(raw, filePath);
}
