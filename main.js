import { normalizeHexReference } from "./hex.js"

const ICONS_API = "/api/icon/"
const EMBEDDINGS_API = "/api/embeddings/"
const ICON_DETAIL_API = "/api/icon-detail/"
const DEFAULT_MODEL_ID = "siglip2"
const DEFAULT_NEIGHBOR_COUNT = 100
const FLIP_DURATION_MS = 1400
const FLIP_STAGGER_MAX_MS = 500

let currentIconId = null
let currentModelId = null
let manifest = null
let navigationGeneration = 0
const metaCache = new Map()

function createRequestError(message, details = {}) {
  const error = new Error(message)
  Object.assign(error, details)
  return error
}

function currentMeta() {
  return metaCache.get(currentModelId)
}

function idsForCurrentModel() {
  return currentMeta()?.image_ids ?? []
}

function setStatus(message) {
  const status = document.getElementById("status")
  if (status) {
    status.textContent = message ?? ""
  }
}

function formatIconHex(hexValue) {
  if (hexValue == null) {
    return "Unavailable"
  }

  const normalizedHex = String(hexValue)
  if (
    normalizedHex === "Unavailable" ||
    normalizedHex === "Loading..." ||
    normalizedHex === "----"
  ) {
    return normalizedHex
  }

  return normalizeHexReference(normalizedHex) ?? normalizedHex
}

function setIconDetail(hexValue, nameValue) {
  const hexElement = document.getElementById("icon-detail-hex")
  const nameElement = document.getElementById("icon-detail-name")
  if (hexElement) {
    hexElement.textContent = formatIconHex(hexValue)
  }
  if (nameElement) {
    nameElement.textContent = nameValue ?? "Unavailable"
  }
}

function gridSizeForNeighborCount(neighborCount) {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(0, neighborCount) + 1)))
}

function reservedGridSizeForModel(model) {
  return gridSizeForNeighborCount(
    Number.isFinite(model?.neighbor_count)
      ? model.neighbor_count
      : DEFAULT_NEIGHBOR_COUNT,
  )
}

function setGridSize(size) {
  const grid = document.getElementById("grid")
  if (grid) {
    grid.style.setProperty("--grid-size", String(size))
  }
}

function setModelPickerEnabled(enabled) {
  const select = document.getElementById("model-select")
  if (select) {
    select.disabled = !enabled
  }
}

function renderGridNotice(message) {
  const grid = document.getElementById("grid")
  if (!grid) {
    return
  }

  grid.innerHTML = ""
  grid.dataset.kind = "notice"
  delete grid.dataset.ready
  delete grid.dataset.size
  setGridSize(1)

  const notice = document.createElement("div")
  notice.className = "grid-notice"
  notice.textContent = message
  grid.appendChild(notice)
}

function fallbackLabel(iconId) {
  return String(iconId ?? "?").slice(-2).toUpperCase()
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function cellStateKey(data) {
  if (!data?.iconId) {
    return ""
  }
  return `${data.iconId}:${data.isFocus ? "focus" : "neighbor"}`
}

function appendCellVisual(container, cell, iconId, notifyMissingIcon) {
  const fallback = document.createElement("span")
  fallback.className = "cell-fallback"
  fallback.textContent = fallbackLabel(iconId)
  fallback.hidden = true

  const img = document.createElement("img")
  img.src = `${ICONS_API}${iconId}`
  img.alt = iconId
  img.addEventListener("error", () => {
    cell.classList.add("missing")
    img.remove()
    fallback.hidden = false
    notifyMissingIcon()
  })

  container.replaceChildren(fallback, img)
}

function cardFaces(card) {
  return {
    front: card.querySelector(".cell-card-face-front"),
    back: card.querySelector(".cell-card-face-back"),
  }
}

function createCell(row, col) {
  const cell = document.createElement("button")
  cell.className = "cell"
  cell.type = "button"
  cell.style.gridRow = row + 1
  cell.style.gridColumn = col + 1

  const card = document.createElement("div")
  card.className = "cell-card"
  const front = document.createElement("div")
  front.className = "cell-card-face cell-card-face-front"
  const back = document.createElement("div")
  back.className = "cell-card-face cell-card-face-back"
  card.append(front, back)
  cell.appendChild(card)

  return cell
}

function ensureGridCells(grid, size) {
  const expectedCellCount = size * size
  const canReuse =
    grid.dataset.kind === "cells" &&
    Number(grid.dataset.size) === size &&
    grid.children.length === expectedCellCount

  if (!canReuse) {
    grid.innerHTML = ""

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        grid.appendChild(createCell(row, col))
      }
    }

    grid.dataset.kind = "cells"
    grid.dataset.size = String(size)
    delete grid.dataset.ready

    return {
      cells: Array.from(grid.children),
      animate: false,
      intro: !prefersReducedMotion(),
    }
  }

  return {
    cells: Array.from(grid.children),
    animate: grid.dataset.ready === "true" && !prefersReducedMotion(),
    intro: false,
  }
}

function applyCellState(cell, data, notifyMissingIcon) {
  const card = cell.querySelector(".cell-card")
  if (!card) {
    return
  }

  const { front, back } = cardFaces(card)
  if (!front || !back) {
    return
  }

  card.classList.remove("is-flipping")
  card.classList.remove("is-resetting")
  cell.classList.remove("missing")
  cell.classList.toggle("focus", Boolean(data?.isFocus))
  cell.onclick = null

  if (!data?.iconId) {
    front.replaceChildren()
    back.replaceChildren()
    cell.disabled = true
    cell.style.visibility = "hidden"
    cell.dataset.stateKey = ""
    return
  }

  cell.style.visibility = "visible"
  cell.disabled = Boolean(data.isFocus)

  if (!data.isFocus) {
    cell.onclick = () => showIcon(data.iconId)
  }

  appendCellVisual(front, cell, data.iconId, notifyMissingIcon)
  back.replaceChildren()
  cell.dataset.stateKey = cellStateKey(data)
}

function resetFlippedCard(card) {
  card.classList.add("is-resetting")
  card.classList.remove("is-flipping")
  card.style.removeProperty("--flip-delay")
  void card.offsetWidth
  card.classList.remove("is-resetting")
}

function finalizeFlippedCell(cell, data, notifyMissingIcon) {
  const card = cell.querySelector(".cell-card")
  if (!card) {
    applyCellState(cell, data, notifyMissingIcon)
    return
  }

  const { front, back } = cardFaces(card)
  if (!front || !back) {
    applyCellState(cell, data, notifyMissingIcon)
    return
  }

  cell.classList.remove("missing")
  cell.classList.toggle("focus", Boolean(data?.isFocus))
  cell.onclick = null

  if (!data?.iconId) {
    front.replaceChildren()
    resetFlippedCard(card)
    back.replaceChildren()
    cell.disabled = true
    cell.style.visibility = "hidden"
    cell.dataset.stateKey = ""
    return
  }

  cell.style.visibility = "visible"
  cell.disabled = Boolean(data.isFocus)

  if (!data.isFocus) {
    cell.onclick = () => showIcon(data.iconId)
  }

  appendCellVisual(front, cell, data.iconId, notifyMissingIcon)
  resetFlippedCard(card)
  back.replaceChildren()
  cell.dataset.stateKey = cellStateKey(data)
}

function wait(duration) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration)
  })
}

async function waitForTransition(element, duration) {
  await new Promise((resolve) => {
    let finished = false
    const complete = () => {
      if (finished) {
        return
      }
      finished = true
      element.removeEventListener("transitionend", onTransitionEnd)
      clearTimeout(timeoutId)
      resolve()
    }

    const onTransitionEnd = (event) => {
      if (event.target === element && event.propertyName === "transform") {
        complete()
      }
    }

    const timeoutId = window.setTimeout(complete, duration + 80)
    element.addEventListener("transitionend", onTransitionEnd)
  })
}

async function flipCell(cell, data, notifyMissingIcon, isCurrentRender) {
  const card = cell.querySelector(".cell-card")
  if (!card) {
    applyCellState(cell, data, notifyMissingIcon)
    return
  }

  const { back } = cardFaces(card)
  if (!back) {
    applyCellState(cell, data, notifyMissingIcon)
    return
  }

  cell.disabled = true
  cell.style.visibility = "visible"
  back.replaceChildren()
  if (data?.iconId) {
    appendCellVisual(back, cell, data.iconId, notifyMissingIcon)
  }

  // Force layout so the browser treats the class toggle as a transition.
  void card.offsetWidth
  card.classList.add("is-flipping")

  await waitForTransition(card, FLIP_DURATION_MS)

  if (!isCurrentRender()) {
    return
  }

  applyCellState(cell, data, notifyMissingIcon)
  resetFlippedCard(card)
}

async function renderGridCells(grid, cells, notifyMissingIcon, isCurrentRender) {
  const size = cells.length
  const { cells: cellElements, animate, intro } = ensureGridCells(grid, size)
  const flipTargets = []

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const index = row * size + col
      const cell = cellElements[index]
      const data = cells[row][col]
      const previousStateKey = cell.dataset.stateKey ?? ""
      const nextStateKey = cellStateKey(data)
      const shouldFlip =
        (animate && previousStateKey && nextStateKey) ||
        (intro && nextStateKey)

      if (shouldFlip) {
        const card = cell.querySelector(".cell-card")
        const { front, back } = card ? cardFaces(card) : { front: null, back: null }

        cell.disabled = true
        cell.style.visibility = "visible"
        if (front) {
          front.replaceChildren()
        }
        if (back) {
          back.replaceChildren()
          if (data?.iconId) {
            appendCellVisual(back, cell, data.iconId, notifyMissingIcon)
          }
        }

        flipTargets.push({ cell, data, card })
      } else {
        applyCellState(cell, data, notifyMissingIcon)
      }
    }
  }

  if (flipTargets.length) {
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    let maxDelay = 0

    for (const target of flipTargets) {
      if (!target.card) {
        continue
      }
      const delay = Math.floor(Math.random() * (FLIP_STAGGER_MAX_MS + 1))
      maxDelay = Math.max(maxDelay, delay)
      target.card.style.setProperty("--flip-delay", `${delay}ms`)
      void target.card.offsetWidth
      target.card.classList.add("is-flipping")
    }

    await wait(FLIP_DURATION_MS + maxDelay + 60)
  }

  if (!isCurrentRender()) {
    return
  }

  for (const target of flipTargets) {
    finalizeFlippedCell(target.cell, target.data, notifyMissingIcon)
  }

  grid.dataset.kind = "cells"
  grid.dataset.size = String(size)
  grid.dataset.ready = "true"
}

async function fetchJson(path) {
  let response
  try {
    response = await fetch(path)
  } catch {
    throw createRequestError("API unavailable", { code: "network" })
  }

  if (!response.ok) {
    throw createRequestError(
      response.status === 404 ? "Data unavailable" : "API unavailable",
      { status: response.status },
    )
  }

  return response.json()
}

async function loadManifest() {
  manifest = await fetchJson(`${EMBEDDINGS_API}models`)
  if (!Array.isArray(manifest?.models)) {
    throw createRequestError("Data unavailable", { code: "invalid-manifest" })
  }
  return manifest
}

function initialModelId(models, manifestDefaultModel) {
  if (models.some((model) => model.id === DEFAULT_MODEL_ID)) {
    return DEFAULT_MODEL_ID
  }
  if (
    manifestDefaultModel &&
    models.some((model) => model.id === manifestDefaultModel)
  ) {
    return manifestDefaultModel
  }
  return models[0]?.id ?? null
}

async function loadMeta(modelId) {
  if (!metaCache.has(modelId)) {
    const meta = await fetchJson(
      `${EMBEDDINGS_API}${encodeURIComponent(modelId)}/meta`,
    )
    if (!Array.isArray(meta?.image_ids)) {
      throw createRequestError("Model unavailable", { code: "invalid-meta" })
    }
    metaCache.set(modelId, meta)
  }
  return metaCache.get(modelId)
}

async function loadNearest(modelId, iconId) {
  return fetchJson(
    `${EMBEDDINGS_API}${encodeURIComponent(modelId)}/nearest/${iconId}.json`,
  )
}

async function loadIconDetail(iconId) {
  const iconHex = normalizeHexReference(iconId) ?? String(iconId)
  let response
  try {
    response = await fetch(`${ICON_DETAIL_API}${encodeURIComponent(iconHex)}`)
  } catch {
    return {
      icon_hex: iconHex,
      name: "Unavailable",
    }
  }

  if (response.status === 404) {
    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.includes("application/json")) {
      return {
        icon_hex: iconHex,
        name: "Unavailable",
      }
    }

    try {
      const detail = await response.json()
      return {
        icon_hex: detail.icon_hex ?? iconHex,
        name: detail.name ?? "No database match",
      }
    } catch {
      return {
        icon_hex: iconHex,
        name: "Unavailable",
      }
    }
  }

  if (!response.ok) {
    return {
      icon_hex: iconHex,
      name: "Unavailable",
    }
  }

  return response.json()
}

function buildModelPicker() {
  const select = document.getElementById("model-select")
  select.innerHTML = ""

  for (const model of manifest.models) {
    const option = document.createElement("option")
    option.value = model.id
    option.textContent = model.label
    select.appendChild(option)
  }

  select.value = currentModelId
  select.onchange = async (event) => {
    await switchModel(event.target.value)
  }
}

function randomIconId(ids) {
  return ids[Math.floor(Math.random() * ids.length)]
}

async function switchModel(modelId) {
  const previousModelId = currentModelId
  currentModelId = modelId
  const model = manifest.models.find((candidate) => candidate.id === modelId)
  setGridSize(reservedGridSizeForModel(model))

  let meta
  try {
    meta = await loadMeta(modelId)
  } catch (error) {
    currentModelId = previousModelId
    document.getElementById("model-select").value = previousModelId ?? ""
    setStatus(error.message)
    return
  }

  const ids = meta.image_ids
  if (!ids.length) {
    currentModelId = previousModelId
    document.getElementById("model-select").value = previousModelId ?? ""
    setStatus("No icons available")
    return
  }

  if (!ids.includes(currentIconId)) {
    currentIconId = randomIconId(ids)
  }

  document.getElementById("model-select").value = currentModelId
  await showIcon(currentIconId)
}

async function showIcon(iconId) {
  currentIconId = iconId
  const generation = navigationGeneration + 1
  navigationGeneration = generation

  const grid = document.getElementById("grid")
  const ids = idsForCurrentModel()
  const focusIndex = ids.indexOf(iconId)

  if (focusIndex === -1) {
    renderGridNotice("Icon unavailable")
    setStatus("Icon unavailable")
    setIconDetail(iconId, "Unavailable")
    return
  }

  const isCurrentRender = () => generation === navigationGeneration

  setStatus("")
  setIconDetail(iconId, "Loading...")
  const [similarResult, detailResult] = await Promise.allSettled([
    loadNearest(currentModelId, iconId),
    loadIconDetail(iconId),
  ])

  if (!isCurrentRender()) {
    return
  }

  const similarValue = similarResult.status === "fulfilled"
    ? similarResult.value
    : null
  const similar = Array.isArray(similarValue) ? similarValue : []
  const iconHex = normalizeHexReference(iconId) ?? String(iconId)
  const detail = detailResult.status === "fulfilled"
    ? detailResult.value
    : { icon_hex: iconHex, name: "Unavailable" }

  const size = gridSizeForNeighborCount(similar.length)
  const center = Math.floor(size / 2)
  setGridSize(size)

  let missingIconsNotified = false
  const notifyMissingIcon = () => {
    if (!isCurrentRender() || missingIconsNotified) {
      return
    }
    missingIconsNotified = true
    setStatus("Some icons unavailable")
  }

  const cells = Array.from({ length: size }, () => Array(size).fill(null))
  cells[center][center] = { iconId, isFocus: true }

  const positions = []
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (row === center && col === center) continue
      positions.push([row, col])
    }
  }
  positions.sort(
    (a, b) =>
      Math.abs(a[0] - center) +
      Math.abs(a[1] - center) -
      (Math.abs(b[0] - center) + Math.abs(b[1] - center)),
  )

  for (
    let index = 0;
    index < Math.min(similar.length, positions.length);
    index += 1
  ) {
    const [row, col] = positions[index]
    const neighborId = ids[similar[index]]
    if (!neighborId) {
      continue
    }
    cells[row][col] = { iconId: neighborId, isFocus: false }
  }

  await renderGridCells(grid, cells, notifyMissingIcon, isCurrentRender)

  if (!isCurrentRender()) {
    return
  }

  if (similarResult.status === "rejected") {
    setStatus("Related icons unavailable")
  } else if (!missingIconsNotified) {
    setStatus("")
  }
  setIconDetail(detail.icon_hex ?? iconId, detail.name ?? "Unnamed")
}

async function main() {
  setStatus("")
  setModelPickerEnabled(false)

  const manifestData = await loadManifest()
  currentModelId = initialModelId(
    manifestData.models,
    manifestData.default_model,
  )
  if (!currentModelId) {
    throw new Error("No models available")
  }

  const initialModel = manifestData.models.find(
    (model) => model.id === currentModelId,
  )
  setGridSize(reservedGridSizeForModel(initialModel))

  const meta = await loadMeta(currentModelId)
  if (!meta.image_ids.length) {
    throw new Error("No icons available")
  }

  buildModelPicker()
  setModelPickerEnabled(true)
  currentIconId = randomIconId(idsForCurrentModel())
  await showIcon(currentIconId)
}

main().catch((error) => {
  console.error(error)
  setStatus(error.message)
  setModelPickerEnabled(false)
  renderGridNotice(error.message)
  setIconDetail(null, "Unavailable")
})
