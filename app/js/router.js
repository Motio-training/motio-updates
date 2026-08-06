/* Routeur par hash : GitHub Pages ne sait pas réécrire les URL,
   et un hash survit à un rechargement en profond. */

const routes = [];
let notFound = null;
let onBefore = null;

export function route(pattern, handler) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:([\w]+)/g, (_, k) => {
    keys.push(k);
    return '([^/]+)';
  }) + '$');
  routes.push({ rx, keys, handler });
}

export function setNotFound(fn) { notFound = fn; }
export function before(fn) { onBefore = fn; }

export function go(path) {
  if (location.hash.slice(1) === path) resolve();
  else location.hash = path;
}

export function currentPath() {
  return location.hash.slice(1) || '/';
}

export async function resolve() {
  const path = currentPath();
  if (onBefore) {
    const redirect = await onBefore(path);
    if (redirect && redirect !== path) { location.hash = redirect; return; }
  }
  for (const r of routes) {
    const m = path.match(r.rx);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return r.handler(params);
    }
  }
  if (notFound) notFound(path);
}

export function start() {
  window.addEventListener('hashchange', resolve);
  resolve();
}
