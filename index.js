/**
 * Backend: Redireccionador al último video de YouTube
 * ====================================================
 * Uso: GET /ultimo-video?channel_id=UCXXXXX
 *
 * Variables de entorno requeridas:
 *   YOUTUBE_API_KEY — tu API Key de YouTube Data v3
 *
 * Para correr localmente:
 *   1. Copia .env.example a .env y pon tu API Key
 *   2. npm install
 *   3. node index.js
 *   4. Abre: http://localhost:3000/ultimo-video?channel_id=UCxxxxxx
 */

require('dotenv').config()
const express = require('express')
const axios = require('axios')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 3000

// ─── Cache en memoria ────────────────────────────────────────────────────────
// Evita llamar a la API de YouTube en cada petición.
// Cada entrada: { url: string, expiresAt: number }
const cache = new Map()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutos

function getCached (key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.url
}

function setCache (key, url) {
  cache.set(key, { url, expiresAt: Date.now() + CACHE_TTL_MS })
}
// ─────────────────────────────────────────────────────────────────────────────

// Convierte duración ISO 8601 (ej: "PT1M30S") a segundos.
// Los Shorts duran 60 s o menos, por lo que cualquier valor > 60 es un video normal.
function iso8601ToSeconds (duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  const hours = parseInt(match[1] || 0)
  const minutes = parseInt(match[2] || 0)
  const seconds = parseInt(match[3] || 0)
  return hours * 3600 + minutes * 60 + seconds
}

// Límite de páginas a recorrer para no consumir cuota indefinidamente.
// Con 5 páginas de 10 videos se revisan hasta 50 videos recientes.
const MAX_PAGES = 5

/**
 * GET /ultimo-video?channel_id=UCXXXXX
 *
 * Busca el video más reciente del canal excluyendo Shorts.
 * Pagina los resultados de YouTube hasta encontrar un video de más de 60 s,
 * o hasta agotar MAX_PAGES páginas.
 */
app.get('/ultimo-video', async (req, res) => {
  const { channel_id } = req.query

  if (!channel_id) {
    return res.status(400).json({
      error:
        'Falta el parámetro channel_id. Ejemplo: /ultimo-video?channel_id=UCXXXXX'
    })
  }

  const cachedUrl = getCached(channel_id)
  if (cachedUrl) {
    console.log(`[cache] Redirigiendo ${channel_id} → ${cachedUrl}`)
    return res.redirect(cachedUrl)
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: 'YOUTUBE_API_KEY no está configurada en el servidor.' })
  }

  try {
    let pageToken = undefined

    for (let page = 0; page < MAX_PAGES; page++) {
      // Paso 1: obtener una página de videos recientes del canal.
      const searchRes = await axios.get(
        'https://www.googleapis.com/youtube/v3/search',
        {
          params: {
            key: apiKey,
            channelId: channel_id,
            part: 'snippet',
            order: 'date',
            type: 'video',
            maxResults: 10,
            ...(pageToken && { pageToken })
          }
        }
      )

      const items = searchRes.data.items

      if (!items || items.length === 0) {
        break // No hay más resultados en el canal
      }

      // Paso 2: consultar la duración real de cada video en esta página.
      const videoIds = items.map(item => item.id.videoId).join(',')
      const detailsRes = await axios.get(
        'https://www.googleapis.com/youtube/v3/videos',
        {
          params: {
            key: apiKey,
            id: videoIds,
            part: 'contentDetails,snippet'
          }
        }
      )

      // La API de videos NO garantiza el mismo orden que la búsqueda.
      // Construimos un mapa id→detalles para luego recorrer en orden cronológico.
      const detailsMap = new Map(detailsRes.data.items.map(v => [v.id, v]))

      // Paso 3: recorrer los resultados EN EL ORDEN de la búsqueda (más reciente primero)
      // y quedarse con el primero que no sea Short.
      // Un video es Short si dura ≤ 60 s O si tiene #shorts en el título/descripción.
      const searchItem = items.find(item => {
        const detail = detailsMap.get(item.id.videoId)
        if (!detail) return false
        const seconds = iso8601ToSeconds(detail.contentDetails.duration)

        const title = (detail.snippet.title || '').toLowerCase()
        const description = (detail.snippet.description || '').toLowerCase()
        const hasShortTag =
          title.includes('#shorts') || description.includes('#shorts')
        return seconds > 180 && !hasShortTag
      })

      const video = searchItem ? detailsMap.get(searchItem.id.videoId) : null

      if (video) {
        const videoUrl = `https://www.youtube.com/watch?v=${video.id}`
        setCache(channel_id, videoUrl)
        console.log(
          `[ok] Página ${page + 1} — Redirigiendo ${channel_id} → ${videoUrl}`
        )
        return res.redirect(videoUrl)
      }

      // Todos los de esta página son Shorts: pasar a la siguiente si existe.
      pageToken = searchRes.data.nextPageToken
      if (!pageToken) break
    }

    return res.status(404).json({
      error: `No se encontró ningún video (solo Shorts) en los últimos ${
        MAX_PAGES * 10
      } videos del canal.`
    })
  } catch (err) {
    const apiError = err.response?.data?.error?.message || err.message
    console.error(`[error] YouTube API: ${apiError}`)
    return res.status(500).json({
      error: 'Error al consultar la API de YouTube.',
      detalle: apiError
    })
  }
})

app.use(express.static(path.join(__dirname, 'public')))

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// Solo levanta el servidor si se corre directamente (node index.js).
// En Vercel, el export de abajo es lo que se usa.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`)
  })
}

module.exports = app
