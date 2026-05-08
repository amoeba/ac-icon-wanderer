import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vite"
import { normalizeHexReference } from "./hex.js"

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url))
const DATA_DIR = path.join(ROOT_DIR, "data")
const ICONS_DIR = path.join(DATA_DIR, "icons")
const EMBEDDINGS_DIR = path.join(DATA_DIR, "embeddings")
const ACEDB_BASE_URL = "https://acedb.treestats.net/ace_world_patches.json"

function isSafeSegment(value) {
  return /^[a-zA-Z0-9_-]+$/.test(value)
}

function isSafeModelId(value) {
  return /^[a-z0-9-]+$/.test(value)
}

function sendJson(res, body, statusCode = 200) {
  res.statusCode = statusCode
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(body))
}

function sendText(res, body, statusCode = 200) {
  res.statusCode = statusCode
  res.setHeader("Content-Type", "text/plain; charset=utf-8")
  res.end(body)
}

function iconDetailUrl(iconId) {
  const iconValue = parseInt(iconId, 16)
  const sql = `
    SELECT w.class_Id AS class_id, w.class_Name AS class_name, s.value AS name
    FROM weenie w
    LEFT JOIN weenie_properties_string s ON w.class_Id = s.object_Id AND s.type = 1
    LEFT JOIN weenie_properties_d_i_d icon ON w.class_Id = icon.object_Id AND icon.type = 8
    WHERE icon.value = ${iconValue}
    ORDER BY CASE WHEN s.value IS NULL THEN 1 ELSE 0 END, w.class_Id
    LIMIT 1
  `
  return `${ACEDB_BASE_URL}?sql=${encodeURIComponent(sql)}&_shape=array`
}

async function sendFile(res, filePath, contentType) {
  try {
    const body = await readFile(filePath)
    res.statusCode = 200
    res.setHeader("Content-Type", contentType)
    res.end(body)
  } catch (error) {
    if (error && error.code === "ENOENT") {
      sendText(res, "Not Found", 404)
      return
    }
    throw error
  }
}

function localApiPlugin() {
  return {
    name: "local-data-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost")
        const { pathname } = url

        if (!pathname.startsWith("/api/")) {
          next()
          return
        }

        try {
          if (pathname.startsWith("/api/icon/")) {
            const iconId = pathname.slice("/api/icon/".length)
            if (!isSafeSegment(iconId)) {
              sendText(res, "Invalid icon id", 400)
              return
            }
            await sendFile(res, path.join(ICONS_DIR, `${iconId}.png`), "image/png")
            return
          }

          if (pathname.startsWith("/api/icon-detail/")) {
            const iconId = pathname.slice("/api/icon-detail/".length)
            const iconHex = normalizeHexReference(iconId)
            if (!iconHex || !isSafeSegment(iconId)) {
              sendText(res, "Invalid icon id", 400)
              return
            }

            const response = await fetch(iconDetailUrl(iconHex))
            if (!response.ok) {
              sendText(res, "Icon detail lookup failed", 502)
              return
            }

            const rows = await response.json()
            if (!rows.length) {
              sendJson(res, { icon_hex: iconHex, name: null }, 404)
              return
            }

            sendJson(res, {
              icon_hex: iconHex,
              name: rows[0].name ?? rows[0].class_name ?? null,
              class_id: rows[0].class_id ?? null,
              class_name: rows[0].class_name ?? null,
            })
            return
          }

          if (pathname === "/api/embeddings/models") {
            await sendFile(res, path.join(EMBEDDINGS_DIR, "manifest.json"), "application/json")
            return
          }

          const modelMetaMatch = pathname.match(/^\/api\/embeddings\/([^/]+)\/meta$/)
          if (modelMetaMatch) {
            const modelId = decodeURIComponent(modelMetaMatch[1])
            if (!isSafeModelId(modelId)) {
              sendText(res, "Invalid model id", 400)
              return
            }
            await sendFile(
              res,
              path.join(EMBEDDINGS_DIR, modelId, "meta.json"),
              "application/json",
            )
            return
          }

          const nearestMatch = pathname.match(/^\/api\/embeddings\/([^/]+)\/nearest\/([^/]+)\.json$/)
          if (nearestMatch) {
            const modelId = decodeURIComponent(nearestMatch[1])
            const iconId = decodeURIComponent(nearestMatch[2])
            if (!isSafeModelId(modelId) || !isSafeSegment(iconId)) {
              sendText(res, "Invalid embedding path", 400)
              return
            }
            await sendFile(
              res,
              path.join(EMBEDDINGS_DIR, modelId, "nearest", `${iconId}.json`),
              "application/json",
            )
            return
          }

          sendJson(res, { error: "Not Found" }, 404)
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

export default defineConfig(() => ({
  plugins: [localApiPlugin()],
  publicDir: "public",
}))
