const ICONS_API = 'https://wander.treestats.net/api/icon/'
const IMAGE_IDS_JSON = '/data/embeddings/image_ids.json'

let ids = []

async function loadNearest(idx) {
  const id = ids[idx]
  const res = await fetch(`/data/embeddings/nearest/${id}.json`)
  return res.json()
}

async function showIcon(idx) {
  const grid = document.getElementById('grid')
  const similar = await loadNearest(idx)
  
  grid.innerHTML = ''
  grid.style.gridTemplateColumns = ''
  
  const total = similar.length + 1
  const size = Math.ceil(Math.sqrt(total))
  const center = Math.floor(size / 2)
  grid.style.gridTemplateColumns = `repeat(${size}, 40px)`

  const cells = Array.from({length: size}, () => Array(size).fill(null))
  cells[center][center] = {idx: idx, isFocus: true}

  const positions = []
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (r === center && c === center) continue
      positions.push([r, c])
    }
  }
  positions.sort((a, b) => (Math.abs(a[0] - center) + Math.abs(a[1] - center)) - (Math.abs(b[0] - center) + Math.abs(b[1] - center)))

  for (let i = 0; i < Math.min(similar.length, positions.length); i++) {
    const [r, c] = positions[i]
    cells[r][c] = {idx: similar[i], isFocus: false}
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = document.createElement('div')
      cell.className = 'cell'
      cell.style.gridRow = r + 1
      cell.style.gridColumn = c + 1

      const data = cells[r][c]
      if (data === null || data.idx === undefined) {
        cell.style.visibility = 'hidden'
      } else {
        const img = document.createElement('img')
        img.src = ICONS_API + ids[data.idx]

        if (data.isFocus) {
          cell.classList.add('focus')
        } else {
          cell.onclick = () => showIcon(data.idx)
        }

        cell.appendChild(img)
      }
      grid.appendChild(cell)
    }
  }
}

async function main() {
  const idsRes = await fetch(IMAGE_IDS_JSON)
  ids = await idsRes.json()

  console.log('Loaded ids:', ids.length)

  showIcon(Math.floor(Math.random() * ids.length))
}

main()