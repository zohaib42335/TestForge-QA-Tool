/** Maps primary app tabs to URL paths (react-router). */

/** @type {Record<string, string>} */
export const TAB_TO_PATH = {
  dashboard: '/dashboard',
  runs: '/test-runs',
  new: '/test-cases/new',
  templates: '/templates',
  all: '/test-cases',
  team: '/team',
  activity: '/activity',
  bugs: '/bugs',
  settings: '/settings',
}

/**
 * @param {string} pathname
 * @returns {keyof typeof TAB_TO_PATH | 'dashboard'}
 */
export function pathToTab(pathname) {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/test-cases/new') return 'new'
  if (p === '/test-cases') return 'all'
  const entry = Object.entries(TAB_TO_PATH).find(([, url]) => url.replace(/\/+$/, '') === p)
  return entry ? /** @type {keyof typeof TAB_TO_PATH} */ (entry[0]) : 'dashboard'
}
