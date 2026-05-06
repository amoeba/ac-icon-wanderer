// Load data
const meta = await fetch('/data/embeddings/image_ids.json').then(r => r.json());
const ids = meta.map(p => p.replace('data/icons/', '').replace('.png', ''));
const nearest = await fetch('/data/embeddings/nearest.json').then(r => r.json());

const N = ids.length;

function topK(queryIdx, k) {
  return nearest[queryIdx].slice(0, k);
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
        img.src = '/api/icon/' + ids[data.idx];
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

        // Flip animation when clicking non-center icons (except immediate neighbors)
        if (!data.isFocus) {
          cell.onclick = () => showIcon(data.idx);
        }

        cell.appendChild(card);
      }
      grid.appendChild(cell);
    }
  }
}

// Random start
showIcon(Math.floor(Math.random() * N));
