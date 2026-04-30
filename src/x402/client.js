"use strict";

function withDefault(value, fallback) {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function toError(code, message, extras = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extras);
  return error;
}

async function parseResponseBody(response) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch (_error) {
      return null;
    }
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text };
  }
}

function extractPaymentRef(payload) {
  return (
    payload?.payment_ref ||
    payload?.paymentRef ||
    payload?.receipt?.id ||
    payload?.receipt?.payment_ref ||
    payload?.data?.payment_ref ||
    payload?.data?.id ||
    payload?.id ||
    null
  );
}

function createX402Client({ apiBase, apiKey, authPath, timeoutMs, enabled }) {
  const baseUrl = String(apiBase || "").trim().replace(/\/+$/, "");
  const paymentAuthPath = withDefault(authPath, "/payments/authorize");
  const requestTimeoutMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : 12000;
  const isEnabled = Boolean(enabled && baseUrl);

  function getBaseUrl() {
    return baseUrl;
  }

  function isConfigured() {
    return isEnabled;
  }

  async function authorizePayment({ amountMinor, memo, intent, sessionHint, metadata }) {
    if (!isEnabled) {
      throw toError(
        "x402_not_configured",
        "AIsa x402 is not configured. Set AISA_X402_ENABLED and AISA_X402_API_BASE.",
        { status: 503 }
      );
    }

    const url = `${baseUrl}${paymentAuthPath.startsWith("/") ? paymentAuthPath : `/${paymentAuthPath}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          amount_minor: Number(amountMinor || 0),
          memo: String(memo || ""),
          intent: String(intent || ""),
          session_hint: String(sessionHint || ""),
          metadata: metadata || {}
        }),
        signal: controller.signal
      });

      const payload = await parseResponseBody(response);
      if (response.status === 402) {
        throw toError("x402_payment_required", "AIsa x402 returned payment required challenge.", {
          status: 402,
          challenge: payload
        });
      }
      if (!response.ok) {
        throw toError("x402_upstream_error", `AIsa x402 failed with status ${response.status}.`, {
          status: response.status,
          details: payload
        });
      }

      const paymentRef = extractPaymentRef(payload);
      if (!paymentRef) {
        throw toError("x402_invalid_response", "AIsa x402 response did not include a payment reference.", {
          status: 502,
          details: payload
        });
      }

      return {
        ok: true,
        payment_ref: String(paymentRef),
        receipt: payload,
        provider: "aisa"
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        throw toError("x402_timeout", `AIsa x402 request timed out after ${requestTimeoutMs}ms.`, { status: 504 });
      }
      if (error?.code) {
        throw error;
      }
      throw toError("x402_request_failed", error?.message || "AIsa x402 request failed.", { status: 502 });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    isEnabled: isConfigured,
    getBaseUrl,
    authorizePayment
  };
}

module.exports = {
  createX402Client
};
