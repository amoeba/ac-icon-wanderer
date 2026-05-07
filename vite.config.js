import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vite"

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url))
const DATA_DIR = path.join(ROOT_DIR, "data")
const ICONS_DIR = path.join(DATA_DIR, "icons")
const EMBEDDINGS_DIR = path.join(DATA_DIR, "embeddings")

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

          if (pathname === "/api/embeddings/models") {
            await sendFile(res, path.join(EMBEDDINGS_DIR, "manifest.json"), "application/json")
            return
          }

          if (pathname === "/api/embeddings/meta") {
            await sendFile(res, path.join(EMBEDDINGS_DIR, "meta.json"), "application/json")
            return
          }

          if (pathname.startsWith("/api/embeddings/nearest/")) {
            const iconId = pathname
              .slice("/api/embeddings/nearest/".length)
              .replace(/\.json$/, "")
            if (!isSafeSegment(iconId)) {
              sendText(res, "Invalid icon id", 400)
              return
            }
            await sendFile(
              res,
              path.join(EMBEDDINGS_DIR, "nearest", `${iconId}.json`),
              "application/json",
            )
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

export default defineConfig({
  plugins: [localApiPlugin()],
})
