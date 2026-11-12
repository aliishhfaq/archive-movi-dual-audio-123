const API_BASE = "https://archive.org";

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

function corsHeaders(request, env) {
  const configured = env.ALLOWED_ORIGIN || "*";
  const origin = request.headers.get("Origin");
  return {
    "access-control-allow-origin": configured === "*" ? "*" : (origin === configured ? configured : configured),
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "Range, Content-Type",
    "access-control-expose-headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type",
    "access-control-max-age": "86400", "vary": "Origin"
  };
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid stream key");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function encodeStreamKey(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
export function decodeStreamKey(key) { return decodeBase64Url(key); }

function validIdentifier(value) { return typeof value === "string" && /^[A-Za-z0-9._-]{1,200}$/.test(value); }
function validFileName(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 1024 && !value.startsWith("/") && !value.split("/").some(part => part === ".." || part === "");
}
async function getMetadata(identifier) {
  const response = await fetch(`${API_BASE}/metadata/${encodeURIComponent(identifier)}`, { headers: { "user-agent": "ArchiveMoviDualAudio/1.0" } });
  if (!response.ok) throw new Error(`Archive.org metadata returned ${response.status}`);
  return response.json();
}
function playable(file) {
  const name = String(file.name || "").toLowerCase(), format = String(file.format || "").toLowerCase();
  return /\.(mp4|m4v|webm|ogv|mp3|m4a|ogg|oga|opus|wav|flac|aac)$/i.test(name) || /mpeg4|h\.264|webm|ogg video|mp3|aac|flac|wave|vorbis|opus/.test(format);
}
function safeContentType(file) {
  const name = String(file.name || "").toLowerCase();
  if (/\.mp3$/.test(name)) return "audio/mpeg";
  if (/\.(m4a|aac)$/.test(name)) return "audio/mp4";
  if (/\.(ogg|oga|opus)$/.test(name)) return "audio/ogg";
  if (/\.wav$/.test(name)) return "audio/wav";
  if (/\.flac$/.test(name)) return "audio/flac";
  if (/\.webm$/.test(name)) return "video/webm";
  if (/\.ogv$/.test(name)) return "video/ogg";
  if (/\.(m4v|mp4)$/.test(name)) return "video/mp4";
  return file.mimetype || "application/octet-stream";
}
async function handleMetadata(identifier, cors) {
  if (!validIdentifier(identifier)) return json({ error: "Invalid Archive.org identifier" }, 400, cors);
  try {
    const metadata = await getMetadata(identifier);
    const files = (metadata.files || []).filter(file => file.name && playable(file)).map(file => ({ name: file.name, format: file.format || "", size: file.size || null, length: file.length || null, source: file.source || "", track: file.track || "" }));
    return json({ identifier, title: metadata.metadata?.title || identifier, creator: metadata.metadata?.creator || "", year: metadata.metadata?.year || "", description: metadata.metadata?.description || "", files }, 200, { ...cors, "cache-control": "public, max-age=300" });
  } catch (error) { return json({ error: error.message || "Unable to load Archive.org metadata" }, 502, cors); }
}
async function handleStream(request, env, cors) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return json({ error: "Missing stream key" }, 400, cors);
  let payload;
  try { payload = decodeBase64Url(key); } catch { return json({ error: "Malformed stream key" }, 400, cors); }
  const { identifier, file } = payload || {};
  if (!validIdentifier(identifier) || !validFileName(file)) return json({ error: "Invalid stream key payload" }, 400, cors);
  try {
    const metadata = await getMetadata(identifier);
    const listed = (metadata.files || []).find(entry => entry.name === file && playable(entry));
    if (!listed) return json({ error: "File is not a playable file in this Archive.org item" }, 404, cors);
    const upstreamUrl = `${API_BASE}/download/${encodeURIComponent(identifier)}/${file.split("/").map(encodeURIComponent).join("/")}`;
    const headers = new Headers();
    const range = request.headers.get("Range");
    if (range) headers.set("Range", range);
    const upstream = await fetch(upstreamUrl, { method: request.method === "HEAD" ? "HEAD" : "GET", headers });
    if (![200, 206, 416].includes(upstream.status)) return json({ error: `Archive.org stream returned ${upstream.status}` }, upstream.status >= 400 ? upstream.status : 502, cors);
    const responseHeaders = new Headers(cors);
    for (const name of ["accept-ranges", "content-length", "content-range", "last-modified", "etag"]) {
      const value = upstream.headers.get(name); if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set("content-type", safeContentType(listed));
    responseHeaders.set("cache-control", "public, max-age=3600");
    return new Response(request.method === "HEAD" || upstream.status === 416 ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) { return json({ error: error.message || "Streaming failed" }, 502, cors); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!["GET", "HEAD"].includes(request.method)) return json({ error: "Method not allowed" }, 405, { ...cors, allow: "GET, HEAD, OPTIONS" });
    if (url.pathname === "/api/health") return json({ ok: true, service: "archive-movi-dual-audio" }, 200, cors);
    if (url.pathname.startsWith("/api/metadata/")) {
      let identifier;
      try { identifier = decodeURIComponent(url.pathname.slice("/api/metadata/".length)); } catch { return json({ error: "Invalid identifier encoding" }, 400, cors); }
      return handleMetadata(identifier, cors);
    }
    if (url.pathname === "/api/stream") return handleStream(request, env, cors);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404, headers: cors });
  }
};
