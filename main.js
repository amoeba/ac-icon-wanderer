const ICONS_API = "/api/icon/";
const EMBEDDINGS_API = "/api/embeddings/";
const ICON_DETAIL_API = "/api/icon-detail/";
const DEFAULT_MODEL_ID = "siglip2";
const DEFAULT_NEIGHBOR_COUNT = 100;

let currentIconId = null;
let currentModelId = null;
let manifest = null;
const metaCache = new Map();

function createRequestError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

function currentMeta() {
  return metaCache.get(currentModelId);
}

function idsForCurrentModel() {
  return currentMeta()?.image_ids ?? [];
}

function setStatus(message) {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = message ?? "";
  }
}

function formatIconHex(hexValue) {
  if (hexValue == null) {
    return "Unavailable";
  }

  const normalizedHex = String(hexValue);
  if (
    normalizedHex === "Unavailable" ||
    normalizedHex === "Loading..." ||
    normalizedHex === "----"
  ) {
    return normalizedHex;
  }

  return normalizedHex.startsWith("0x")
    ? normalizedHex
    : `0x${normalizedHex}`;
}

function setIconDetail(hexValue, nameValue) {
  const hexElement = document.getElementById("icon-detail-hex");
  const nameElement = document.getElementById("icon-detail-name");
  if (hexElement) {
    hexElement.textContent = formatIconHex(hexValue);
  }
  if (nameElement) {
    nameElement.textContent = nameValue ?? "Unavailable";
  }
}

function gridSizeForNeighborCount(neighborCount) {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(0, neighborCount) + 1)));
}

function reservedGridSizeForModel(model) {
  return gridSizeForNeighborCount(
    Number.isFinite(model?.neighbor_count)
      ? model.neighbor_count
      : DEFAULT_NEIGHBOR_COUNT,
  );
}

function setGridSize(size) {
  const grid = document.getElementById("grid");
  if (grid) {
    grid.style.setProperty("--grid-size", String(size));
  }
}

function setModelPickerEnabled(enabled) {
  const select = document.getElementById("model-select");
  if (select) {
    select.disabled = !enabled;
  }
}

function renderGridNotice(message) {
  const grid = document.getElementById("grid");
  if (!grid) {
    return;
  }

  grid.innerHTML = "";
  setGridSize(1);

  const notice = document.createElement("div");
  notice.className = "grid-notice";
  notice.textContent = message;
  grid.appendChild(notice);
}

function fallbackLabel(iconId) {
  return String(iconId ?? "?").slice(-2).toUpperCase();
}

function appendCellVisual(cell, iconId, notifyMissingIcon) {
  const fallback = document.createElement("span");
  fallback.className = "cell-fallback";
  fallback.textContent = fallbackLabel(iconId);
  fallback.hidden = true;

  const img = document.createElement("img");
  img.src = ICONS_API + iconId;
  img.alt = iconId;
  img.addEventListener("error", () => {
    cell.classList.add("missing");
    img.remove();
    fallback.hidden = false;
    notifyMissingIcon();
  });

  cell.appendChild(fallback);
  cell.appendChild(img);
}

async function fetchJson(path) {
  let response;
  try {
    response = await fetch(path);
  } catch {
    throw createRequestError("API unavailable", { code: "network" });
  }

  if (!response.ok) {
    throw createRequestError(
      response.status === 404 ? "Data unavailable" : "API unavailable",
      { status: response.status },
    );
  }

  return response.json();
}

async function loadManifest() {
  manifest = await fetchJson(`${EMBEDDINGS_API}models`);
  if (!Array.isArray(manifest?.models)) {
    throw createRequestError("Data unavailable", { code: "invalid-manifest" });
  }
  return manifest;
}

function initialModelId(models, manifestDefaultModel) {
  if (models.some((model) => model.id === DEFAULT_MODEL_ID)) {
    return DEFAULT_MODEL_ID;
  }
  if (
    manifestDefaultModel &&
    models.some((model) => model.id === manifestDefaultModel)
  ) {
    return manifestDefaultModel;
  }
  return models[0]?.id ?? null;
}

async function loadMeta(modelId) {
  if (!metaCache.has(modelId)) {
    const meta = await fetchJson(
      `${EMBEDDINGS_API}${encodeURIComponent(modelId)}/meta`,
    );
    if (!Array.isArray(meta?.image_ids)) {
      throw createRequestError("Model unavailable", { code: "invalid-meta" });
    }
    metaCache.set(modelId, meta);
  }
  return metaCache.get(modelId);
}

async function loadNearest(modelId, iconId) {
  return fetchJson(
    `${EMBEDDINGS_API}${encodeURIComponent(modelId)}/nearest/${iconId}.json`,
  );
}

async function loadIconDetail(iconId) {
  let response;
  try {
    response = await fetch(`${ICON_DETAIL_API}${encodeURIComponent(iconId)}`);
  } catch {
    return {
      icon_hex: iconId,
      name: "Unavailable",
    };
  }

  if (response.status === 404) {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return {
        icon_hex: iconId,
        name: "Unavailable",
      };
    }

    try {
      const detail = await response.json();
      return {
        icon_hex: detail.icon_hex ?? iconId,
        name: detail.name ?? "No database match",
      };
    } catch {
      return {
        icon_hex: iconId,
        name: "Unavailable",
      };
    }
  }

  if (!response.ok) {
    return {
      icon_hex: iconId,
      name: "Unavailable",
    };
  }

  return response.json();
}

function buildModelPicker() {
  const select = document.getElementById("model-select");
  select.innerHTML = "";

  for (const model of manifest.models) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label;
    select.appendChild(option);
  }

  select.value = currentModelId;
  select.onchange = async (event) => {
    await switchModel(event.target.value);
  };
}

function randomIconId(ids) {
  return ids[Math.floor(Math.random() * ids.length)];
}

async function switchModel(modelId) {
  const previousModelId = currentModelId;
  currentModelId = modelId;
  const model = manifest.models.find((candidate) => candidate.id === modelId);
  setGridSize(reservedGridSizeForModel(model));

  let meta;
  try {
    meta = await loadMeta(modelId);
  } catch (error) {
    currentModelId = previousModelId;
    document.getElementById("model-select").value = previousModelId ?? "";
    setStatus(error.message);
    return;
  }

  const ids = meta.image_ids;
  if (!ids.length) {
    currentModelId = previousModelId;
    document.getElementById("model-select").value = previousModelId ?? "";
    setStatus("No icons available");
    return;
  }

  if (!ids.includes(currentIconId)) {
    currentIconId = randomIconId(ids);
  }

  document.getElementById("model-select").value = currentModelId;
  await showIcon(currentIconId);
}

async function showIcon(iconId) {
  currentIconId = iconId;

  const grid = document.getElementById("grid");
  const ids = idsForCurrentModel();
  const focusIndex = ids.indexOf(iconId);

  if (focusIndex === -1) {
    renderGridNotice("Icon unavailable");
    setStatus("Icon unavailable");
    setIconDetail(iconId, "Unavailable");
    return;
  }

  setStatus("");
  setIconDetail(iconId, "Loading...");
  const [similarResult, detailResult] = await Promise.allSettled([
    loadNearest(currentModelId, iconId),
    loadIconDetail(iconId),
  ]);

  const similarValue = similarResult.status === "fulfilled"
    ? similarResult.value
    : null;
  const similar = Array.isArray(similarValue) ? similarValue : [];
  const detail = detailResult.status === "fulfilled"
    ? detailResult.value
    : { icon_hex: iconId, name: "Unavailable" };

  grid.innerHTML = "";

  const size = gridSizeForNeighborCount(similar.length);
  const center = Math.floor(size / 2);
  setGridSize(size);

  let missingIconsNotified = false;
  const notifyMissingIcon = () => {
    if (missingIconsNotified) {
      return;
    }
    missingIconsNotified = true;
    setStatus("Some icons unavailable");
  };

  const cells = Array.from({ length: size }, () => Array(size).fill(null));
  cells[center][center] = { iconId, isFocus: true };

  const positions = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (row === center && col === center) continue;
      positions.push([row, col]);
    }
  }
  positions.sort(
    (a, b) =>
      Math.abs(a[0] - center) +
      Math.abs(a[1] - center) -
      (Math.abs(b[0] - center) + Math.abs(b[1] - center)),
  );

  for (
    let index = 0;
    index < Math.min(similar.length, positions.length);
    index += 1
  ) {
    const [row, col] = positions[index];
    const neighborId = ids[similar[index]];
    if (!neighborId) {
      continue;
    }
    cells[row][col] = { iconId: neighborId, isFocus: false };
  }

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.style.gridRow = row + 1;
      cell.style.gridColumn = col + 1;

      const data = cells[row][col];
      if (data === null || !data.iconId) {
        cell.style.visibility = "hidden";
        cell.disabled = true;
      } else {
        if (data.isFocus) {
          cell.classList.add("focus");
          cell.disabled = true;
        } else {
          cell.onclick = () => showIcon(data.iconId);
        }

        appendCellVisual(cell, data.iconId, notifyMissingIcon);
      }

      grid.appendChild(cell);
    }
  }

  if (similarResult.status === "rejected") {
    setStatus("Related icons unavailable");
  } else {
    setStatus("");
  }
  setIconDetail(detail.icon_hex ?? iconId, detail.name ?? "Unnamed");
}

async function main() {
  setStatus("");
  setModelPickerEnabled(false);

  const manifestData = await loadManifest();
  currentModelId = initialModelId(
    manifestData.models,
    manifestData.default_model,
  );
  if (!currentModelId) {
    throw new Error("No models available");
  }

  const initialModel = manifestData.models.find(
    (model) => model.id === currentModelId,
  );
  setGridSize(reservedGridSizeForModel(initialModel));

  const meta = await loadMeta(currentModelId);
  if (!meta.image_ids.length) {
    throw new Error("No icons available");
  }

  buildModelPicker();
  setModelPickerEnabled(true);
  currentIconId = randomIconId(idsForCurrentModel());
  await showIcon(currentIconId);
}

main().catch((error) => {
  console.error(error);
  setStatus(error.message);
  setModelPickerEnabled(false);
  renderGridNotice(error.message);
  setIconDetail(null, "Unavailable");
});
