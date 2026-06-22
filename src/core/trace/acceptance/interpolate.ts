/**
 * `{{…}}` interpolation for acceptance steps. References resolve against captured variables (dotted
 * paths into earlier-captured JSON) and, with an `env.` prefix, against environment variables — the
 * only place secrets enter (they are never stored in specs). When a whole string is exactly one
 * `{{expr}}`, the resolved value keeps its type (so a captured number/object survives into a JSON body);
 * otherwise the value is stringified into the surrounding text.
 */
export type Vars = Record<string, unknown>;

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function resolve(expr: string, vars: Vars, env: NodeJS.ProcessEnv): unknown {
  const t = expr.trim();
  if (t.startsWith('env.')) return env[t.slice(4)];
  return getPath(vars, t);
}

const WHOLE = /^\{\{([^}]+)\}\}$/;
const ALL = /\{\{([^}]+)\}\}/g;

/** Interpolate into a single string; missing references become ''. */
export function interpolateString(s: string, vars: Vars, env: NodeJS.ProcessEnv = process.env): string {
  return s.replace(ALL, (_m, expr) => {
    const v = resolve(expr, vars, env);
    return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}

/** Deep-interpolate a value (string/array/object); a whole-string `{{expr}}` keeps the resolved type. */
export function interpolateValue(value: unknown, vars: Vars, env: NodeJS.ProcessEnv = process.env): unknown {
  if (typeof value === 'string') {
    const whole = WHOLE.exec(value);
    if (whole) return resolve(whole[1], vars, env);
    return interpolateString(value, vars, env);
  }
  if (Array.isArray(value)) return value.map((v) => interpolateValue(v, vars, env));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = interpolateValue(v, vars, env);
    return out;
  }
  return value;
}

/** Interpolate every value in a string→string map (headers). */
export function interpolateHeaders(
  headers: Record<string, string> | undefined,
  vars: Vars,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) out[k] = interpolateString(v, vars, env);
  return out;
}
