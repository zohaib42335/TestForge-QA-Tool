/**
 * @fileoverview Google Sheets REST sync and OAuth2 (implicit) helpers for browser apps.
 */

import axios from 'axios'

/**
 * Spreadsheet column order and headers (must match export / app fields).
 * @type {ReadonlyArray<{ key: string, header: string }>}
 */
const COLUMN_DEFS = [
  { key: 'testCaseId', header: 'Test Case ID' },
  { key: 'module', header: 'Module/Suite' },
  { key: 'title', header: 'Title' },
  { key: 'description', header: 'Description' },
  { key: 'preconditions', header: 'Preconditions' },
  { key: 'testSteps', header: 'Test Steps' },
  { key: 'expectedResult', header: 'Expected Result' },
  { key: 'actualResult', header: 'Actual Result' },
  { key: 'status', header: 'Status' },
  { key: 'priority', header: 'Priority' },
  { key: 'severity', header: 'Severity' },
  { key: 'testType', header: 'Test Type' },
  { key: 'environment', header: 'Environment' },
  { key: 'assignedTo', header: 'Assigned To' },
  { key: 'createdBy', header: 'Created By' },
  { key: 'createdDate', header: 'Created Date' },
  { key: 'executionDate', header: 'Execution Date' },
  { key: 'comments', header: 'Comments' },
  { key: 'automationStatus', header: 'Automation Status' },
  { key: 'bugId', header: 'Bug ID' },
]

/**
 * @param {unknown} value
 * @returns {string}
 */
function cellValue(value) {
  if (value == null) return ''
  return String(value)
}

/**
 * Converts 0-based column index to Excel-style column letter(s).
 * @param {number} index
 * @returns {string}
 */
function columnIndexToLetters(index) {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/**
 * Builds header row and data rows for the Sheets API `values` body.
 * @param {Array<object>} testCases
 * @returns {{ values: string[][], range: string }}
 */
function buildValuesPayload(testCases) {
  const headers = COLUMN_DEFS.map((c) => c.header)
  const rows = (Array.isArray(testCases) ? testCases : []).map((tc) =>
    COLUMN_DEFS.map((c) => cellValue(tc && typeof tc === 'object' ? tc[c.key] : '')),
  )
  const values = [headers, ...rows]
  const rowCount = values.length
  const colCount = COLUMN_DEFS.length
  const endCol = columnIndexToLetters(colCount - 1)
  const range = `Sheet1!A1:${endCol}${rowCount}`
  return { values, range }
}

/**
 * Maps an axios / HTTP error to a user-facing message.
 * @param {unknown} err
 * @returns {string}
 */
function describeError(err) {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const data = err.response?.data
    const apiMsg =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      data.error &&
      typeof data.error === 'object' &&
      'message' in data.error
        ? String(data.error.message)
        : null
    if (status === 401) {
      return apiMsg
        ? `Authentication failed (401): ${apiMsg}`
        : 'Authentication failed (401). Check your OAuth token or API key.'
    }
    if (status === 403) {
      return apiMsg
        ? `Permission denied (403): ${apiMsg}`
        : 'Permission denied (403). The sheet may not allow this operation or the OAuth scope is insufficient.'
    }
    if (status === 404) {
      return apiMsg
        ? `Not found (404): ${apiMsg}`
        : 'Spreadsheet not found (404). Verify VITE_GOOGLE_SHEET_ID and that the sheet exists.'
    }
    if (status != null) {
      return apiMsg
        ? `Request failed (${status}): ${apiMsg}`
        : `Request failed with status ${status}.`
    }
    if (err.code === 'ECONNABORTED') {
      return 'Network timeout. Check your connection and try again.'
    }
    if (err.message) {
      return `Network error: ${err.message}`
    }
  }
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message
  }
  return 'An unexpected error occurred while syncing to Google Sheets.'
}

/**
 * Syncs all test cases to Google Sheets via REST API.
 * Uses VITE_GOOGLE_SHEETS_API_KEY and VITE_GOOGLE_SHEET_ID from env.
 * Requires the sheet to be publicly editable OR uses OAuth token.
 * @param {Array} testCases
 * @param {string|null} accessToken - OAuth2 access token (null for API key only)
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function syncToGoogleSheets(testCases, accessToken = null) {
  const sheetId = import.meta.env.VITE_GOOGLE_SHEET_ID
  const apiKey = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY

  if (!sheetId || String(sheetId).trim() === '') {
    return {
      success: false,
      message: 'Missing VITE_GOOGLE_SHEET_ID. Add it to your .env file.',
    }
  }

  const token =
    accessToken != null && String(accessToken).trim() !== ''
      ? String(accessToken).trim()
      : null
  const key = apiKey != null && String(apiKey).trim() !== '' ? String(apiKey).trim() : null

  if (!token && !key) {
    return {
      success: false,
      message:
        'No credentials available. Provide an OAuth access token (after sign-in) or VITE_GOOGLE_SHEETS_API_KEY in .env.',
    }
  }

  const { values, range } = buildValuesPayload(testCases)
  const encodedRange = encodeURIComponent(range)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedRange}`

  try {
    /** @type {import('axios').AxiosRequestConfig} */
    const config = {
      params: {
        valueInputOption: 'RAW',
      },
      headers: {},
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    } else if (key) {
      config.params.key = key
    }

    await axios.put(url, { values }, config)

    return {
      success: true,
      message: `Synced ${Math.max(0, values.length - 1)} test case(s) to Google Sheets.`,
    }
  } catch (err) {
    console.error('[qa-test-case-manager] syncToGoogleSheets failed:', err)
    return {
      success: false,
      message: describeError(err),
    }
  }
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function looksLikeGoogleOAuthClientId(id) {
  const s = String(id).trim()
  return /\.apps\.googleusercontent\.com$/i.test(s) && s.length > 30
}

/**
 * Redirect URI for Google OAuth (implicit flow). Must match **exactly** one entry under
 * Google Cloud Console → Credentials → OAuth client → Authorized redirect URIs.
 *
 * Set `VITE_GOOGLE_OAUTH_REDIRECT_URI` in production (e.g. https://yourapp.web.app/) if
 * the auto value is wrong. When unset, uses the site origin with a trailing slash.
 *
 * @returns {string}
 */
export function getGoogleOAuthRedirectUri() {
  if (typeof window === 'undefined') return ''
  const fromEnv = import.meta.env.VITE_GOOGLE_OAUTH_REDIRECT_URI
  if (fromEnv != null && String(fromEnv).trim() !== '') {
    return String(fromEnv).trim()
  }
  const origin = window.location.origin
  return `${origin}/`
}

/**
 * Initiates Google OAuth2 sign-in (implicit flow). Uses `VITE_GOOGLE_CLIENT_ID` and
 * `getGoogleOAuthRedirectUri()` for `redirect_uri`.
 * @returns {void}
 */
export function initiateGoogleSignIn() {
  const raw = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const clientId = raw == null ? '' : String(raw).trim()

  if (!clientId) {
    window.alert(
      'VITE_GOOGLE_CLIENT_ID is missing.\n\n' +
        'Add your OAuth 2.0 Web Client ID to the .env file, then restart the dev server (npm run dev).',
    )
    return
  }

  if (!looksLikeGoogleOAuthClientId(clientId)) {
    window.alert(
      'Your Google OAuth Client ID in .env is still a placeholder or invalid.\n\n' +
        'Fix:\n' +
        '1. Open Google Cloud Console → APIs & Services → Credentials.\n' +
        '2. Create OAuth client ID → Application type: Web application.\n' +
        '3. Authorized JavaScript origins: http://localhost:5173 (and production URL if deployed)\n' +
        '4. Authorized redirect URIs: must match EXACTLY what the app sends (see .env.example).\n' +
        '   For local dev add BOTH:\n' +
        '   • http://localhost:5173/\n' +
        '   • http://127.0.0.1:5173/\n' +
        '5. Copy the Client ID (ends with .apps.googleusercontent.com) into VITE_GOOGLE_CLIENT_ID in .env\n' +
        '6. Restart npm run dev.\n\n' +
        'Error 401 invalid_client means Google does not recognize the client_id value.\n' +
        'Error 400 redirect_uri_mismatch means the redirect URI in Console does not match the app URL.',
    )
    return
  }

  if (typeof window === 'undefined') return

  const redirectUri = getGoogleOAuthRedirectUri()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    include_granted_scopes: 'true',
  })

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/**
 * Extracts OAuth2 access token from URL hash after redirect.
 * @returns {string|null}
 */
export function extractTokenFromUrl() {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  if (!hash || hash.length <= 1) return null
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const token = params.get('access_token')
  return token && token.trim() !== '' ? token.trim() : null
}
