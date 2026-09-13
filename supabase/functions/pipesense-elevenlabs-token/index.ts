const ELEVENLABS_API = "https://api.elevenlabs.io/v1";
const DEFAULT_ORIGINS = new Set([
  "http://127.0.0.1:8000",
  "http://localhost:8000",
]);

function allowedOrigins(): Set<string> {
  const configured = (Deno.env.get("PIPESENSE_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...configured]);
}

function cors(origin: string): HeadersInit {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "cache-control": "no-store",
    vary: "Origin",
  };
}

function json(status: number, body: Record<string, unknown>, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") ?? "";
  if (!allowedOrigins().has(origin)) {
    return json(403, { error: "origin_not_allowed" }, "null");
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  const agentId = Deno.env.get("ELEVENLABS_AGENT_ID");
  if (!apiKey || !agentId) return json(503, { error: "voice_not_configured" }, origin);

  const endpoint = new URL(`${ELEVENLABS_API}/convai/conversation/get-signed-url`);
  endpoint.searchParams.set("agent_id", agentId);
  try {
    const response = await fetch(endpoint, {
      headers: { "xi-api-key": apiKey, accept: "application/json" },
    });
    if (!response.ok) {
      console.error("ElevenLabs signed URL request failed", response.status);
      return json(502, { error: "voice_provider_unavailable", status: response.status }, origin);
    }
    const payload = await response.json() as { signed_url?: string };
    if (!payload.signed_url) return json(502, { error: "invalid_voice_provider_response" }, origin);
    return json(200, { signed_url: payload.signed_url, expires_in_seconds: 900 }, origin);
  } catch (error) {
    console.error("ElevenLabs signed URL request error", error instanceof Error ? error.name : "unknown");
    return json(502, { error: "voice_provider_unavailable" }, origin);
  }
});
