/*
 * PRIVACY: This package is the Wrapped backing service. Server-side code
 * receives contribution payloads in transit only. Job rows in Azure Tables
 * persist {installId, jobId, status, timestamps} — never contributions, never
 * tokens, never IPs. Result rows persist {jobId, sliceContent} for at most
 * WRAP_RESULT_TTL_HOURS and are deleted on first successful fetch.
 *
 * Functions are registered as side-effects of importing each module under
 * `src/functions/`. Importing this entrypoint loads them all.
 */
import './functions/authRegister';
import './functions/classify';
import './functions/wrapEnqueue';
import './functions/wrapGet';
import './functions/wrapWorker';
