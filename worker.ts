const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function getContentType(path: string): string {
  const ext = path.slice(path.lastIndexOf("."));
  return MIME_TYPES[ext] || "application/octet-stream";
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      if (url.pathname.startsWith("/api/icon/")) {
        const iconId = url.pathname.split("/api/icon/")[1];
        if (!iconId || iconId.includes(",") || iconId.includes(".")) {
          return new Response("Invalid icon id", { status: 400 });
        }

        const fileName = iconId.includes(".png") ? iconId : iconId + ".png";

        const obj = await env.R2.get(fileName);
        if (obj) {
          return new Response(obj.body, {
            headers: { "Content-Type": "image/png" }
          });
        }
        return new Response("Icon not found", { status: 404 });
      }

      if (url.pathname === "/api/assets") {
        if (request.method === "GET") {
          const objects = await env.R2.list();
          return new Response(JSON.stringify(objects), {
            headers: { "Content-Type": "application/json" }
          });
        }

        if (request.method === "POST") {
          const formData = await request.formData();
          const file = formData.get("file");
          if (!file) {
            return new Response("No file provided", { status: 400 });
          }
          await env.R2.put(file.name, file.stream());
          return new Response(`Uploaded: ${file.name}`);
        }
      }
      return new Response("Not Found", { status: 404 });
    }

    const path = url.pathname.slice(1) || "index.html";

    const obj = await env.R2.get(path);
    if (obj) {
      return new Response(obj.body, {
        headers: { "Content-Type": getContentType(path) }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};