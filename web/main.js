// Load data
const meta = await fetch('/meta.json').then(r => r.json());
const shape = meta.shape; // [N, D]
const ids = meta.image_ids; // just filenames

const resp = await fetch('/embeddings.bin');
const buf = await resp.arrayBuffer();
const embeddings = new Float32Array(buf); // flat array: N x D

const N = shape[0], D = shape[1];

function getEmbedding(idx) {
  return embeddings.subarray(idx * D, (idx + 1) * D);
}

function cosineSim(a, b) {
  let dot = 0;
  for (let i = 0; i < D; i++) dot += a[i] * b[i];
  return dot; // already normalized
}

function topK(queryIdx, k) {
  const q = getEmbedding(queryIdx);
  const sims = [];
  for (let i = 0; i < N; i++) {
    if (i === queryIdx) continue;
    if (i >= ids.length || !ids[i]) {
      console.error('Invalid index in topK:', i);
      continue;
    }
    sims.push([i, cosineSim(q, getEmbedding(i))]);
  }
  sims.sort((a, b) => b[1] - a[1]);
  const result = sims.slice(0, k).map(x => x[0]);
  return result;
}

function showIcon(idx) {
  const grid = document.getElementById('grid');
  const similar = topK(idx, 100);
  const total = similar.length + 1;
  const size = Math.ceil(Math.sqrt(total));
  const center = Math.floor(size / 2);

  grid.style.gridTemplateColumns = `repeat(${size}, 40px)`;
  grid.innerHTML = '';

  // Build 2D grid: grid[row][col] = icon data or null for empty
  const cells = Array.from({length: size}, () => Array(size).fill(null));

  // Place focused icon at center (row=center, col=center) = coordinate (0,0)
  cells[center][center] = {idx: idx, isFocus: true};

  // Generate all positions sorted by Manhattan distance from (0,0) in coordinate space
  const positions = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (r === center && c === center) continue; // skip center
      const x = c - center; // negative=left
      const y = center - r; // positive=north
      positions.push([r, c, x, y]);
    }
  }
  positions.sort((a, b) => (Math.abs(a[2]) + Math.abs(a[3])) - (Math.abs(b[2]) + Math.abs(b[3])));

  // Fill grid with similar icons
  for (let i = 0; i < Math.min(similar.length, positions.length); i++) {
    const [r, c] = positions[i];
    const iconIdx = similar[i];
    if (iconIdx === undefined || iconIdx < 0 || iconIdx >= ids.length || !ids[iconIdx]) {
      console.error('Invalid icon index:', iconIdx, 'at position', i, 'similar length:', similar.length);
      continue;
    }
    cells[r][c] = {idx: iconIdx, isFocus: false};
  }

  // Render grid row by row
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.gridRow = r + 1;
      cell.style.gridColumn = c + 1;

      const data = cells[r][c];
      if (data === null || data.idx === undefined || data.idx >= ids.length || !ids[data.idx]) {
        if (data && data.idx !== undefined) console.error('Bad icon idx at', r, c, data.idx, 'ids length:', ids.length);
        cell.style.visibility = 'hidden';
      } else {
        // Card with front (icon) and back face for poker flip
        const card = document.createElement('div');
        card.className = 'card';

        const front = document.createElement('div');
        front.className = 'face front';
        const img = document.createElement('img');
        img.src = '/icons/' + ids[data.idx];
        front.appendChild(img);

        const back = document.createElement('div');
        back.className = 'face back';

        card.appendChild(front);
        card.appendChild(back);

        if (data.isFocus) {
          cell.classList.add('focus');
        } else {
          cell.onclick = () => showIcon(data.idx);
        }

        // Stagger flip animation by Manhattan distance from center
        const x = c - center;
        const y = center - r;
        const dist = Math.abs(x) + Math.abs(y);
        const delay = dist * 120;
        setTimeout(() => card.classList.add('flip'), delay);

        cell.appendChild(card);
      }
      grid.appendChild(cell);
    }
  }
}

// Random start
showIcon(Math.floor(Math.random() * N));
