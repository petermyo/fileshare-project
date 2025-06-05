// functions/s/[[slug]].ts (Short URL Redirect Function)
// This file should be directly inside the 'functions/s' directory.

import { Hono } from 'hono';

interface Env {
  // We might not need R2 or D1 bindings directly in this redirector,
  // but keeping Env interface for consistency if you expand its logic.
}

interface PagesFunctionContext<Env> {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  passThroughOnException: () => void;
}

const app = new Hono<{ Bindings: Env }>();

// This route catches requests like /s/SLUG
app.get('/s/:slug', async (c) => {
  console.log(`[Short URL Redirect] Request received for /s/${c.req.param('slug')}`);
  const slug = c.req.param('slug');
  const providedPasscode = c.req.query('passcode'); // Capture and pass through passcode if provided

  let redirectUrl = `/api/d/${slug}`;
  if (providedPasscode) {
    redirectUrl += `?passcode=${providedPasscode}`;
  }

  // Perform a temporary redirect (302 Found) to the actual download API endpoint
  console.log(`[Short URL Redirect] Redirecting to: ${redirectUrl}`);
  return c.redirect(redirectUrl, 302);
});

// Pages Function entry point for this short URL redirector
export const onRequest = async (context: PagesFunctionContext<Env>) => {
  return app.fetch(context.request, context.env);
};
