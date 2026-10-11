// deno-lint-ignore-file no-explicit-any
// A very small path router. Paths are matched WITHOUT the leading "/api" (that is the function name).
import type { Caller } from "./lib.ts";

export interface Ctx {
  req: Request;
  c: Caller;
  params: Record<string, string>;
  query: URLSearchParams;
}
export type Handler = (x: Ctx) => Promise<any>;

interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  handler: Handler;
  isPublic: boolean;
}
const routes: Route[] = [];

export function route(method: string, path: string, handler: Handler, opts: { public?: boolean } = {}) {
  const keys: string[] = [];
  const re = new RegExp(
    "^" + path.replace(/:([A-Za-z]+)/g, (_m, k) => { keys.push(k); return "([^/]+)"; }) + "/?$",
  );
  routes.push({ method, re, keys, handler, isPublic: !!opts.public });
}

export function match(method: string, path: string) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    return { route: r, params };
  }
  return null;
}
export function pathExists(path: string) {
  return routes.some((r) => r.re.test(path));
}
