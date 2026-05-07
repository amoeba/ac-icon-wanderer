function embeddingPath(modelId: string, suffix: string): string {
  return `embeddings/${modelId}/${suffix}`;
}

function defaultEmbeddingPath(suffix: string): string {
  return `embeddings/${suffix}`;
}

async function getObject(env, path: string) {
  return env.R2.get(path);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname.startsWith("/api/icon/")) {
      const iconId = url.pathname.split("/api/icon/")[1];
      if (!iconId || iconId.includes(",") || iconId.includes(".")) {
        return new Response("Invalid icon id", { status: 400 });
      }

      const obj = await getObject(env, `icons/${iconId}.png`);
      if (obj) {
        return new Response(obj.body, {
          headers: { "Content-Type": "image/png" },
        });
      }
      return new Response("Icon not found", { status: 404 });
    }

    if (url.pathname.startsWith("/api/embeddings/")) {
      if (url.pathname === "/api/embeddings/models") {
        const obj = await getObject(env, "embeddings/manifest.json");
        if (obj) {
          return new Response(obj.body, {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Manifest not found", { status: 404 });
      }

      if (url.pathname === "/api/embeddings/meta") {
        const obj = await getObject(env, defaultEmbeddingPath("meta.json"));
        if (obj) {
          return new Response(obj.body, {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Meta not found", { status: 404 });
      }

      if (url.pathname.startsWith("/api/embeddings/nearest/")) {
        const iconId = url.pathname
          .split("/api/embeddings/nearest/")[1]
          .replace(/\.json$/, "");
        const obj = await getObject(
          env,
          defaultEmbeddingPath(`nearest/${iconId}.json`),
        );
        if (obj) {
          return new Response(obj.body, {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Nearest not found", { status: 404 });
      }

      const match = url.pathname.match(
        /^\/api\/embeddings\/([^/]+)\/(meta|nearest\/[^/]+\.json)$/,
      );
      if (match) {
        const modelId = decodeURIComponent(match[1]);
        const suffix = match[2];
        const obj = await getObject(env, embeddingPath(modelId, suffix));
        if (obj) {
          return new Response(obj.body, {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Embedding payload not found", { status: 404 });
      }

      return new Response("Not Found", { status: 404 });
    }

    if (url.pathname === "/api/assets") {
      if (request.method === "GET") {
        const objects = await env.R2.list();
        return new Response(JSON.stringify(objects), {
          headers: { "Content-Type": "application/json" },
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
  },
};
