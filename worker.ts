const INDEX_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Icon Navigator</title>
  <style>
    body { background: #0f0f0f; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .grid { display: grid; gap: 2px; padding: 10px; }
    .cell { width: 40px; height: 40px; position: relative; cursor: pointer; border: 1px solid #333; perspective: 800px; }
    .cell:hover { border-color: #666; }
    .card { width: 100%; height: 100%; position: relative; transform-style: preserve-3d; }
    .card.flip { animation: flipCard 0.8s ease-out forwards; }
    .face { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; backface-visibility: hidden; }
    .front { background: #1a1a1a; transform: rotateY(0deg); }
    .front img { width: 100%; height: 100%; object-fit: contain; }
    .back { background: #111; transform: rotateY(180deg); }
    @keyframes flipCard { from { transform: rotateY(0deg); } to { transform: rotateY(180deg); } }
  </style>
  <script type="module" src="/main.js"></script>
</head>
<body>
  <div id="grid" class="grid"></div>
</body>
</html>`;

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

    const path = url.pathname.slice(1);

    if (!path || path === "index.html") {
      return new Response(INDEX_HTML, {
        headers: { "Content-Type": "text/html" }
      });
    }

    const obj = await env.R2.get(path);
    if (obj) {
      return new Response(obj.body, {
        headers: { "Content-Type": getContentType(path) }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};