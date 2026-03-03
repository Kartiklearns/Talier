import path from "node:path";

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC_ROOT = path.resolve(import.meta.dir, "../../public");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const server = Bun.serve({
  port: PORT,
  async fetch(request: Request): Promise<Response> {
    const requestedPath = getRequestPath(request);
    const safePath = toSafePath(requestedPath);
    if (!safePath) {
      return textResponse(403, "Forbidden");
    }

    const file = Bun.file(safePath);
    if (!(await file.exists())) {
      return textResponse(404, "Not Found");
    }

    const extension = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[extension] ?? file.type ?? "application/octet-stream";

    return new Response(file, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache"
      }
    });
  }
});

console.log(`TALIER running at ${server.url}`);

function getRequestPath(request: Request): string {
  const url = new URL(request.url);
  const pathname = safeDecodeURIComponent(url.pathname);
  return pathname === "/" ? "/index.html" : pathname;
}

function toSafePath(requestedPath: string): string | null {
  const relativePath = requestedPath.replace(/^\/+/, "");
  const resolved = path.resolve(PUBLIC_ROOT, relativePath);
  const relative = path.relative(PUBLIC_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "/";
  }
}

function textResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}
