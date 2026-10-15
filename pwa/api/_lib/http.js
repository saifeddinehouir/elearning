// Small helpers for the web-standard handlers (Request in, Response out).

export class HttpError extends Error {
  constructor(status, code, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const json = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export function bearerToken(request) {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  if (!m) throw new HttpError(401, "signed_out", "Sign in first.");
  return m[1];
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "bad_json", "Request body isn't JSON.");
  }
}

// Wraps a handler: method check, HttpError → JSON response, anything else →
// a logged 500 that doesn't leak details.
export function route(methods, fn) {
  return async (request) => {
    if (!methods.includes(request.method)) return json(405, { error: "method_not_allowed" });
    try {
      return await fn(request);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.code, message: err.message });
      console.error(err);
      return json(500, { error: "server_error", message: "Something went wrong on our side." });
    }
  };
}
