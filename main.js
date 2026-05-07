const ICONS_API = "/api/icon/";
const EMBEDDINGS_API = "/api/embeddings/";
const DEFAULT_MODEL_ID = "siglip2";
const CELL_SIZE = 40;

let currentIconId = null;
let currentModelId = null;
let manifest = null;
const metaCache = new Map();

function currentMeta() {
  return metaCache.get(currentModelId);
}

function idsForCurrentModel() {
  return currentMeta()?.image_ids ?? [];
}

function setStatus(message) {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = message;
  }
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}

async function loadManifest() {
  manifest = await fetchJson(`${EMBEDDINGS_API}models`);
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
    metaCache.set(
      modelId,
      await fetchJson(`${EMBEDDINGS_API}${encodeURIComponent(modelId)}/meta`),
    );
  }
  return metaCache.get(modelId);
}

async function loadNearest(modelId, iconId) {
  return fetchJson(
    `${EMBEDDINGS_API}${encodeURIComponent(modelId)}/nearest/${iconId}.json`,
  );
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
  currentModelId = modelId;
  const meta = await loadMeta(modelId);
  const ids = meta.image_ids;

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
    throw new Error(`Unknown icon id for ${currentModelId}: ${iconId}`);
  }

  setStatus(`Loading ${iconId} with ${currentModelId}...`);
  const similar = await loadNearest(currentModelId, iconId);

  grid.innerHTML = "";
  grid.style.gridTemplateColumns = "";
  grid.style.gridAutoRows = "";

  const total = similar.length + 1;
  const size = Math.ceil(Math.sqrt(total));
  const center = Math.floor(size / 2);
  grid.style.gridTemplateColumns = `repeat(${size}, ${CELL_SIZE}px)`;
  grid.style.gridAutoRows = `${CELL_SIZE}px`;

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
        const img = document.createElement("img");
        img.src = ICONS_API + data.iconId;
        img.alt = data.iconId;

        if (data.isFocus) {
          cell.classList.add("focus");
          cell.disabled = true;
        } else {
          cell.onclick = () => showIcon(data.iconId);
        }

        cell.appendChild(img);
      }

      grid.appendChild(cell);
    }
  }

  setStatus(`${iconId}`);
}

async function main() {
  const manifestData = await loadManifest();
  currentModelId = initialModelId(
    manifestData.models,
    manifestData.default_model,
  );
  if (!currentModelId) {
    throw new Error("No embedding models available");
  }
  await loadMeta(currentModelId);
  buildModelPicker();
  currentIconId = randomIconId(idsForCurrentModel());
  await showIcon(currentIconId);
}

main().catch((error) => {
  console.error(error);
  setStatus(error.message);
});
