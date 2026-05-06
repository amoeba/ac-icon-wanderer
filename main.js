// Load data
const meta = await fetch('/data/embeddings/image_ids.json').then(r => r.json());
const ids = meta.map(p => p.replace('data/icons/', '').replace('.png', ''));
const nearest = await fetch('/data/embeddings/nearest.json').then(r => r.json());

console.log('Loaded ids:', ids.length, 'nearest:', nearest.length);

const N = ids.length;

function topK(queryIdx, k) {
  return nearest[queryIdx].slice(0, k);
}

function showIcon(idx) {
  const grid = document.getElementById('grid');
  const similar = topK(idx, 100);
  
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = '';
  
  const total = similar.length + 1;
  const size = Math.ceil(Math.sqrt(total));
  const center = Math.floor(size / 2);
  grid.style.gridTemplateColumns = `repeat(${size}, 40px)`;

  // Build 2D grid
  const cells = Array.from({length: size}, () => Array(size).fill(null));
  cells[center][center] = {idx: idx, isFocus: true};

  // Generate positions sorted by Manhattan distance
  const positions = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (r === center && c === center) continue;
      positions.push([r, c]);
    }
  }
  positions.sort((a, b) => (Math.abs(a[0] - center) + Math.abs(a[1] - center)) - (Math.abs(b[0] - center) + Math.abs(b[1] - center)));

  // Fill grid
  for (let i = 0; i < Math.min(similar.length, positions.length); i++) {
    const [r, c] = positions[i];
    cells[r][c] = {idx: similar[i], isFocus: false};
  }

  // Render
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.gridRow = r + 1;
      cell.style.gridColumn = c + 1;

      const data = cells[r][c];
      if (data === null || data.idx === undefined) {
        cell.style.visibility = 'hidden';
      } else {
        const img = document.createElement('img');
        img.src = '/api/icon/' + ids[data.idx];

        if (data.isFocus) {
          cell.classList.add('focus');
        } else {
          cell.onclick = () => showIcon(data.idx);
        }

        cell.appendChild(img);
      }
      grid.appendChild(cell);
    }
  }
}

// Random start
showIcon(Math.floor(Math.random() * N));
console.log('Initial load done');