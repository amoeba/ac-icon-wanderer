const ACEDB_BASE_URL = "https://acedb.treestats.net/ace_world_patches.json";

function embeddingPath(modelId: string, suffix: string): string {
  return `embeddings/${modelId}/${suffix}`;
}

async function getObject(env, path: string) {
  return env.R2.get(path);
}

function iconDetailUrl(iconId: string): string {
  const iconValue = parseInt(iconId, 16);
  const sql = `
    SELECT w.class_Id AS class_id, w.class_Name AS class_name, s.value AS name
    FROM weenie w
    LEFT JOIN weenie_properties_string s ON w.class_Id = s.object_Id AND s.type = 1
    LEFT JOIN weenie_properties_d_i_d icon ON w.class_Id = icon.object_Id AND icon.type = 8
    WHERE icon.value = ${iconValue}
    ORDER BY CASE WHEN s.value IS NULL THEN 1 ELSE 0 END, w.class_Id
    LIMIT 1
  `;
  return `${ACEDB_BASE_URL}?sql=${encodeURIComponent(sql)}&_shape=array`;
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

    if (url.pathname.startsWith("/api/icon-detail/")) {
      const iconId = url.pathname.split("/api/icon-detail/")[1];
      if (!iconId || iconId.includes(",") || iconId.includes(".")) {
        return new Response("Invalid icon id", { status: 400 });
      }

      const response = await fetch(iconDetailUrl(iconId));
      if (!response.ok) {
        return new Response("Icon detail lookup failed", { status: 502 });
      }

      const rows = await response.json<any[]>();
      if (!rows.length) {
        return new Response(
          JSON.stringify({ icon_hex: iconId, name: null }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          icon_hex: iconId,
          name: rows[0].name ?? rows[0].class_name ?? null,
          class_id: rows[0].class_id ?? null,
          class_name: rows[0].class_name ?? null,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
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
