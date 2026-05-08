import { normalizeHexReference } from "./hex.js"
import {
  filterHistoryEntries,
  historyEntryKey,
  ICON_HISTORY_STORAGE_KEY,
  recordHistoryEntry,
  removeHistoryEntry,
  sanitizeHistoryEntries,
} from "./history.js"

const ICONS_API = "/api/icon/"
const EMBEDDINGS_API = "/api/embeddings/"
const ICON_DETAIL_API = "/api/icon-detail/"
const DEFAULT_MODEL_ID = "siglip2"
const DEFAULT_NEIGHBOR_COUNT = 100
const FLIP_DURATION_MS = 1400
const FLIP_STAGGER_MAX_MS = 500
const HISTORY_VISIBLE_SLOT_COUNT = 8
const TOOLTIP_OFFSET_PX = 10

let currentIconId = null
let currentModelId = null
let manifest = null
let navigationGeneration = 0
let iconHistory = []
let iconHistoryLoaded = false
let iconHistoryError = null
const metaCache = new Map()
const iconDetailCache = new Map()
let activeTooltipTarget = null
let tooltipRequestId = 0

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

function modelLabel(modelId) {
  return manifest?.models?.find((model) => model.id === modelId)?.label ?? modelId
}

function historyEntriesEqual(leftEntries, rightEntries) {
  if (leftEntries.length !== rightEntries.length) {
    return false
  }

  return leftEntries.every(
    (entry, index) => historyEntryKey(entry) === historyEntryKey(rightEntries[index]),
  )
}

function createHistoryPlaceholder(state) {
  const slot = document.createElement("div")
  slot.className = "history-slot history-slot-placeholder"
  slot.dataset.state = state
  slot.setAttribute("aria-hidden", "true")
  return slot
}

function appendIconVisual(container, target, iconId, onMissing = () => {}) {
  const fallback = document.createElement("span")
  fallback.className = "cell-fallback"
  fallback.textContent = fallbackLabel(iconId)
  fallback.hidden = true

  const img = document.createElement("img")
  img.src = `${ICONS_API}${iconId}`
  img.alt = iconId
  img.addEventListener("error", () => {
    target.classList.add("missing")
    img.remove()
    fallback.hidden = false
    onMissing()
  })

  container.replaceChildren(fallback, img)
}

function tooltipElements() {
  return {
    root: document.getElementById("icon-tooltip"),
    hex: document.getElementById("icon-tooltip-hex"),
    name: document.getElementById("icon-tooltip-name"),
  }
}

function positionTooltip(target) {
  const { root } = tooltipElements()
  if (!root || root.hidden) {
    return
  }

  const rect = target.getBoundingClientRect()
  const tooltipRect = root.getBoundingClientRect()
  const maxLeft = Math.max(window.innerWidth - tooltipRect.width - 8, 8)
  const centeredLeft = rect.left + ((rect.width - tooltipRect.width) / 2)
  const left = Math.min(Math.max(8, centeredLeft), maxLeft)
  const preferredTop = rect.top - tooltipRect.height - TOOLTIP_OFFSET_PX
  const top = preferredTop >= 8
    ? preferredTop
    : Math.min(
        rect.bottom + TOOLTIP_OFFSET_PX,
        window.innerHeight - tooltipRect.height - 8,
      )

  root.style.left = `${left}px`
  root.style.top = `${top}px`
}

function showTooltip(target, hexValue, nameValue) {
  const { root, hex, name } = tooltipElements()
  if (!root || !hex || !name) {
    return
  }

  activeTooltipTarget = target
  hex.textContent = formatIconHex(hexValue)
  name.textContent = nameValue ?? "Unavailable"
  root.hidden = false
  positionTooltip(target)
}

function hideTooltip(target = activeTooltipTarget) {
  if (target && activeTooltipTarget !== target) {
    return
  }

  const { root } = tooltipElements()
  if (!root) {
    return
  }

  activeTooltipTarget = null
  root.hidden = true
}

async function populateTooltip(target, iconId) {
  const requestId = tooltipRequestId + 1
  tooltipRequestId = requestId
  showTooltip(target, iconId, "Loading...")

  const detail = await loadIconDetail(iconId)
  if (activeTooltipTarget !== target || requestId !== tooltipRequestId) {
    return
  }

  showTooltip(
    target,
    detail.icon_hex ?? iconId,
    detail.name ?? "Unavailable",
  )
}

function clearTooltipBindings(target) {
  target.onmouseenter = null
  target.onmouseleave = null
  target.onfocus = null
  target.onblur = null
  if (activeTooltipTarget === target) {
    hideTooltip(target)
  }
}

function bindTooltip(target, iconId) {
  clearTooltipBindings(target)
  target.onmouseenter = () => {
    void populateTooltip(target, iconId)
  }
  target.onmouseleave = () => {
    hideTooltip(target)
  }
  target.onfocus = () => {
    void populateTooltip(target, iconId)
  }
  target.onblur = () => {
    hideTooltip(target)
  }
}

async function navigateToHistoryEntry(entry) {
  if (!manifest?.models || !entry?.iconId || !entry?.modelId) {
    return
  }

  if (entry.modelId !== currentModelId) {
    await switchModel(entry.modelId, {
      preferredIconId: entry.iconId,
      recordHistory: true,
    })
    return
  }

  await showIcon(entry.iconId, { recordHistory: true })
}

function createHistoryButton(entry) {
  const button = document.createElement("button")
  const appReady = Boolean(manifest?.models)

  button.className = "history-slot history-entry"
  button.type = "button"
  button.role = "listitem"
  button.disabled = !appReady
  button.title = `${entry.iconId} (${modelLabel(entry.modelId)})`
  button.setAttribute(
    "aria-label",
    `Show ${entry.iconId} from ${modelLabel(entry.modelId)}`,
  )
  button.onclick = async () => {
    await navigateToHistoryEntry(entry)
  }
  bindTooltip(button, entry.iconId)

  appendIconVisual(button, button, entry.iconId)
  return button
}

function renderIconHistory() {
  const section = document.getElementById("icon-history")
  const strip = document.getElementById("icon-history-strip")
  if (!section || !strip) {
    return
  }

  const historyState = iconHistoryLoaded
    ? iconHistoryError
      ? iconHistoryError
      : iconHistory.length
        ? `${iconHistory.length} saved`
        : "No saved icons yet"
    : "Loading..."
  section.dataset.loaded = String(iconHistoryLoaded)
  section.dataset.empty = String(iconHistory.length === 0)
  section.dataset.error = String(Boolean(iconHistoryError))
  section.setAttribute("title", historyState)

  const slots = [...iconHistory]
    .reverse()
    .map((entry) => createHistoryButton(entry))
  const placeholderCount = Math.max(HISTORY_VISIBLE_SLOT_COUNT - slots.length, 0)
  const placeholderState = iconHistoryLoaded ? "empty" : "loading"
  const placeholders = []
  for (let index = 0; index < placeholderCount; index += 1) {
    placeholders.push(createHistoryPlaceholder(placeholderState))
  }

  strip.replaceChildren(...placeholders, ...slots)
  window.requestAnimationFrame(() => {
    strip.scrollLeft = strip.scrollWidth
  })
}

function saveIconHistory() {
  const serializedHistory = JSON.stringify(iconHistory)

  try {
    window.localStorage.setItem(ICON_HISTORY_STORAGE_KEY, serializedHistory)
    iconHistoryError = null
  } catch (error) {
    console.error("Failed to save icon history", error)
    iconHistoryError = "History unavailable"
  }

  renderIconHistory()
}

function loadSavedHistory() {
  renderIconHistory()

  try {
    const savedHistory = window.localStorage.getItem(ICON_HISTORY_STORAGE_KEY)
    const parsedHistory = savedHistory == null ? [] : JSON.parse(savedHistory)
    iconHistory = sanitizeHistoryEntries(parsedHistory)
    iconHistoryError = null
  } catch (error) {
    console.error("Failed to load icon history", error)
    iconHistory = []
    iconHistoryError = "History unavailable"
  }

  iconHistoryLoaded = true
  renderIconHistory()
}

function syncHistoryWithManifest() {
  if (!manifest?.models) {
    return
  }

  const filteredHistory = filterHistoryEntries(
    iconHistory,
    new Set(manifest.models.map((model) => model.id)),
  )

  if (!historyEntriesEqual(iconHistory, filteredHistory)) {
    iconHistory = filteredHistory
    saveIconHistory()
    return
  }

  renderIconHistory()
}

function updateIconHistory(
  nextIconId,
  nextModelId,
  { recordPrevious = false, previousSelection = null } = {},
) {
  let nextHistory = removeHistoryEntry(iconHistory, {
    iconId: nextIconId,
    modelId: nextModelId,
  })

  if (
    recordPrevious &&
    previousSelection?.iconId &&
    previousSelection?.modelId &&
    (
      previousSelection.iconId !== nextIconId ||
      previousSelection.modelId !== nextModelId
    )
  ) {
    nextHistory = recordHistoryEntry(nextHistory, previousSelection)
  }

  if (historyEntriesEqual(iconHistory, nextHistory)) {
    renderIconHistory()
    return
  }

  iconHistory = nextHistory
  saveIconHistory()
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
    clearTooltipBindings(cell)
    front.replaceChildren()
    back.replaceChildren()
    cell.disabled = true
    cell.style.visibility = "hidden"
    cell.dataset.stateKey = ""
    return
  }

  cell.style.visibility = "visible"
  cell.disabled = false
  bindTooltip(cell, data.iconId)

  if (!data.isFocus) {
    cell.onclick = () => showIcon(data.iconId, { recordHistory: true })
  }

  appendIconVisual(front, cell, data.iconId, notifyMissingIcon)
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
    clearTooltipBindings(cell)
    front.replaceChildren()
    resetFlippedCard(card)
    back.replaceChildren()
    cell.disabled = true
    cell.style.visibility = "hidden"
    cell.dataset.stateKey = ""
    return
  }

  cell.style.visibility = "visible"
  cell.disabled = false
  bindTooltip(cell, data.iconId)

  if (!data.isFocus) {
    cell.onclick = () => showIcon(data.iconId, { recordHistory: true })
  }

  appendIconVisual(front, cell, data.iconId, notifyMissingIcon)
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
    appendIconVisual(back, cell, data.iconId, notifyMissingIcon)
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
            appendIconVisual(back, cell, data.iconId, notifyMissingIcon)
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
  if (!iconDetailCache.has(iconHex)) {
    iconDetailCache.set(iconHex, (async () => {
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
    })())
  }

  return iconDetailCache.get(iconHex)
}

function handleViewportChange() {
  if (!activeTooltipTarget) {
    return
  }

  if (!document.body.contains(activeTooltipTarget)) {
    hideTooltip()
    return
  }

  positionTooltip(activeTooltipTarget)
}

window.addEventListener("scroll", handleViewportChange, { passive: true })
window.addEventListener("resize", handleViewportChange)

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

async function switchModel(
  modelId,
  { preferredIconId = null, recordHistory = false } = {},
) {
  const previousSelection = {
    iconId: currentIconId,
    modelId: currentModelId,
  }
  const previousModelId = currentModelId
  currentModelId = modelId
  const model = manifest.models.find((candidate) => candidate.id === modelId)
  setGridSize(reservedGridSizeForModel(model))
  renderIconHistory()

  let meta
  try {
    meta = await loadMeta(modelId)
  } catch (error) {
    currentModelId = previousModelId
    document.getElementById("model-select").value = previousModelId ?? ""
    setStatus(error.message)
    renderIconHistory()
    return
  }

  const ids = meta.image_ids
  if (!ids.length) {
    currentModelId = previousModelId
    document.getElementById("model-select").value = previousModelId ?? ""
    setStatus("No icons available")
    renderIconHistory()
    return
  }

  if (preferredIconId != null) {
    currentIconId = preferredIconId
  } else if (!ids.includes(currentIconId)) {
    currentIconId = randomIconId(ids)
  }

  document.getElementById("model-select").value = currentModelId
  await showIcon(currentIconId, {
    recordHistory,
    previousSelection,
  })
}

async function showIcon(
  iconId,
  {
    recordHistory = false,
    previousSelection = {
      iconId: currentIconId,
      modelId: currentModelId,
    },
  } = {},
) {
  const generation = navigationGeneration + 1
  navigationGeneration = generation

  const grid = document.getElementById("grid")
  const ids = idsForCurrentModel()
  const focusIndex = ids.indexOf(iconId)

  if (focusIndex === -1) {
    renderIconHistory()
    renderGridNotice("Icon unavailable")
    setStatus("Icon unavailable")
    return
  }

  updateIconHistory(iconId, currentModelId, {
    recordPrevious: recordHistory,
    previousSelection,
  })
  currentIconId = iconId

  const isCurrentRender = () => generation === navigationGeneration

  setStatus("")
  const [similarResult, detailResult] = await Promise.allSettled([
    loadNearest(currentModelId, iconId),
  ])

  if (!isCurrentRender()) {
    return
  }

  const similarValue = similarResult.status === "fulfilled"
    ? similarResult.value
    : null
  const similar = Array.isArray(similarValue) ? similarValue : []

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
  syncHistoryWithManifest()

  const meta = await loadMeta(currentModelId)
  if (!meta.image_ids.length) {
    throw new Error("No icons available")
  }

  buildModelPicker()
  setModelPickerEnabled(true)
  currentIconId = randomIconId(idsForCurrentModel())
  await showIcon(currentIconId)
}

loadSavedHistory()

main().catch((error) => {
  console.error(error)
  setStatus(error.message)
  setModelPickerEnabled(false)
  renderGridNotice(error.message)
  hideTooltip()
  renderIconHistory()
})
