import './style.css'

const ICONS_API = '/api/icon/'
const NEAREST_JSON = '/data/embeddings/nearest.json'
const IMAGE_IDS_JSON = '/data/embeddings/image_ids.json'

async function main() {
  const grid = document.getElementById('grid')

  const [nearestRes, idsRes] = await Promise.all([
    fetch(NEAREST_JSON),
    fetch(IMAGE_IDS_JSON)
  ])
  const nearest = await nearestRes.json()
  const imageIds = await idsRes.json()

  const randomIndex = Math.floor(Math.random() * nearest.length)
  const neighbors = nearest[randomIndex]

  console.log('imageIds:', imageIds.length)
  console.log('Random start:', randomIndex, '->', imageIds[randomIndex])

  const cols = Math.ceil(Math.sqrt(neighbors.length + 1))
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`

  const centerCell = document.createElement('div')
  centerCell.className = 'cell'
  const centerCard = document.createElement('div')
  centerCard.className = 'card'
  const centerFront = document.createElement('div')
  centerFront.className = 'face front'
  const centerImg = document.createElement('img')
  centerImg.src = `${ICONS_API}${imageIds[randomIndex]}`
  centerFront.appendChild(centerImg)
  centerCard.appendChild(centerFront)
  centerCell.appendChild(centerCard)
  grid.appendChild(centerCell)

  for (const idx of neighbors) {
    const hexId = imageIds[idx]
    if (!hexId) continue

    const cell = document.createElement('div')
    cell.className = 'cell'

    const card = document.createElement('div')
    card.className = 'card'

    const front = document.createElement('div')
    front.className = 'face front'

    const img = document.createElement('img')
    img.src = `${ICONS_API}${hexId}`
    img.loading = 'lazy'

    front.appendChild(img)

    const back = document.createElement('div')
    back.className = 'face back'
    back.textContent = idx

    card.appendChild(front)
    card.appendChild(back)
    cell.appendChild(card)

    cell.addEventListener('click', () => {
      card.classList.toggle('flip')
    })

    grid.appendChild(cell)
  }
}

main()