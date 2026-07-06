// Shared wrapper around `supabase.functions.invoke` that ALWAYS extracts the
// response body — even on non-2xx statuses. `supabase-js` throws a
// `FunctionsHttpError` for any non-2xx response with a generic
// "Edge Function returned a non-2xx status code" message and leaves `data`
// null, hiding the real payload the function returned (reason, message,
// validation errors, etc.).
//
// This helper reads the JSON (or text) body out of `error.context.response`
// so callers can surface the actual failure to the user.

import { supabase } from "@/integrations/supabase/client";

export interface InvokeResult<T = any> {
  /** Parsed JSON body when available, otherwise the raw text (or null). */
  data: T | null;
  /** HTTP status code from the edge function response, when known. */
  status: number | null;
  /** True when status is 2xx AND (if body has an `ok` flag) `ok !== false`. */
  ok: boolean;
  /** Raw body text — useful for non-JSON responses / debugging. */
  raw: string | null;
  /** Underlying FunctionsHttpError / network error, if any. */
  error: Error | null;
}

async function readResponseBody(response: Response | undefined | null): Promise<{ data: any; raw: string | null }> {
  if (!response) return { data: null, raw: null };
  let raw: string | null = null;
  try {
    raw = await response.clone().text();
  } catch {
    return { data: null, raw: null };
  }
  if (!raw) return { data: null, raw: "" };
  try {
    return { data: JSON.parse(raw), raw };
  } catch {
    return { data: raw, raw };
  }
}

/**
 * Invoke an edge function and always return the parsed body plus HTTP
 * status, regardless of whether the response was 2xx or not.
 */
export async function invokeEdgeFunction<T = any>(
  functionName: string,
  options?: Parameters<typeof supabase.functions.invoke>[1],
): Promise<InvokeResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, options);

    if (error) {
      // functions-js throws `new FunctionsHttpError(response)`, so `error.context`
      // IS the Response object. Older versions nested it under `context.response`.
      // Support both so non-2xx bodies (reason/message/validation) are never lost
      // and reported as a bogus network failure.
      const ctx: any = (error as any).context;
      const response: Response | undefined =
        ctx && typeof ctx.status === "number" && typeof ctx.text === "function"
          ? (ctx as Response)
          : ctx?.response;
      const { data: bodyData, raw } = await readResponseBody(response);
      return {
        data: (bodyData ?? null) as T | null,
        status: response?.status ?? null,
        ok: false,
        raw,
        error,
      };
    }

    const okBody = !(data && typeof data === "object" && (data as any).ok === false);
    return { data: (data ?? null) as T | null, status: 200, ok: okBody, raw: null, error: null };
  } catch (err) {
    // Network failure / CORS / thrown before response
    return { data: null, status: null, ok: false, raw: null, error: err as Error };
  }
}

/**
 * Best-effort human-readable message from an InvokeResult. Prefers
 * `message` / `error` / `reason` on the JSON body, falls back to raw text,
 * HTTP status, or the underlying error message.
 */
export function extractInvokeErrorMessage(result: InvokeResult, fallback = "Request failed"): string {
  const body = result.data as any;
  if (body && typeof body === "object") {
    if (typeof body.message === "string" && body.message) return body.message;
    if (typeof body.error === "string" && body.error) return body.error;
    if (typeof body.reason === "string" && body.reason) return body.reason;
  }
  if (typeof result.raw === "string" && result.raw.trim()) return result.raw.slice(0, 500);
  if (result.status) return `${fallback} (HTTP ${result.status})`;
  if (result.error?.message) return result.error.message;
  return fallback;
}
