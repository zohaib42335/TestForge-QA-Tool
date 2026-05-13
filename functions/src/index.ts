/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import * as logger from "firebase-functions/logger";

// AI Functions
import {generateTestCases, generateAndSave} from "./ai/generateTestCases.js";
import {saveGeneratedCases} from "./ai/saveGeneratedCases.js";

// Bug Tracker Functions
import {autoCreateBug} from "./bugs/autoCreateBug.js";
import {createJiraIssue, syncBugStatusFromJira, testJiraConnection} from "./integrations/jira.js";
import {sendInviteEmail} from "./invites/sendInviteEmail.js";
import {generateInviteLink} from "./invites/generateInviteLink.js";
import {acceptInvite} from "./invites/acceptInvite.js";

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options.
// NOTE: setGlobalOptions does not apply to functions using the v1 API.
setGlobalOptions({maxInstances: 10});

// Suppress unused import warning — logger is kept for future use
void logger;

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {generateTestCases, saveGeneratedCases, generateAndSave};
export {autoCreateBug};
export {createJiraIssue, syncBugStatusFromJira, testJiraConnection};
export {sendInviteEmail};
export {generateInviteLink, acceptInvite};
