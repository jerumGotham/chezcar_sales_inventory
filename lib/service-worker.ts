/**
 * The development server registers the worker under a "?dev=1" query so it can
 * skip caching build chunks. Production chunk URLs carry a content hash and are
 * safe to serve cache-first; development reuses a URL with new contents, so a
 * cached copy would pin removed code until the worker is unregistered by hand.
 */
export const SERVICE_WORKER_URL = process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev=1";
