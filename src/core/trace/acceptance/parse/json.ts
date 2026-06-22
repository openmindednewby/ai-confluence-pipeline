/**
 * JSON spec-file front-end: parse a `.acp.json` file into one or more `AcceptanceSpec`s. The file is
 * either a single spec object `{ req, cases }` or an array of them. All shapes funnel through
 * `normalizeSpec`, so the typed model is identical regardless of authoring format.
 */
import { AcceptanceParseError, normalizeSpec, type AcceptanceSpec } from '../model.js';

export function parseJsonSpec(text: string, source: string): AcceptanceSpec[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new AcceptanceParseError(`${source}: not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((entry, i) => normalizeSpec(entry, list.length > 1 ? `${source}[${i}]` : source));
}
