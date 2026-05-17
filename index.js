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

require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Cache en memoria ────────────────────────────────────────────────────────
// Evita llamar a la API de YouTube en cada petición.
// Cada entrada: { url: string, expiresAt: number }
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.url;
}

function setCache(key, url) {
  cache.set(key, { url, expiresAt: Date.now() + CACHE_TTL_MS });
}
// ─────────────────────────────────────────────────────────────────────────────

// Convierte duración ISO 8601 (ej: "PT1M30S") a segundos.
// Los Shorts duran 60 s o menos, por lo que cualquier valor > 60 es un video normal.
function iso8601ToSeconds(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours   = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * GET /ultimo-video?channel_id=UCXXXXX
 *
 * Busca el video más reciente del canal (excluyendo Shorts) y redirige a él.
 * Estrategia: obtiene los últimos 10 videos, consulta sus duraciones y
 * descarta los que duren 60 s o menos (definición oficial de Short).
 */
app.get('/ultimo-video', async (req, res) => {
  const { channel_id } = req.query;

  if (!channel_id) {
    return res.status(400).json({
      error: 'Falta el parámetro channel_id. Ejemplo: /ultimo-video?channel_id=UCXXXXX',
    });
  }

  const cachedUrl = getCached(channel_id);
  if (cachedUrl) {
    console.log(`[cache] Redirigiendo ${channel_id} → ${cachedUrl}`);
    return res.redirect(cachedUrl);
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'YOUTUBE_API_KEY no está configurada en el servidor.' });
  }

  try {
    // Paso 1: obtener los últimos 10 videos del canal ordenados por fecha.
    // Se piden 10 para tener margen en caso de que varios sean Shorts consecutivos.
    const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        key: apiKey,
        channelId: channel_id,
        part: 'snippet',
        order: 'date',
        type: 'video',
        maxResults: 10,
      },
    });

    const items = searchRes.data.items;
    if (!items || items.length === 0) {
      return res.status(404).json({
        error: `No se encontraron videos para el canal: ${channel_id}`,
      });
    }

    // Paso 2: consultar la duración de cada video con la API de Videos.
    // contentDetails incluye el campo "duration" en formato ISO 8601.
    const videoIds = items.map((item) => item.id.videoId).join(',');
    const detailsRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        key: apiKey,
        id: videoIds,
        part: 'contentDetails',
      },
    });

    // Paso 3: quedarse con el primer video que dure más de 60 segundos.
    const video = detailsRes.data.items.find((v) => {
      return iso8601ToSeconds(v.contentDetails.duration) > 60;
    });

    if (!video) {
      return res.status(404).json({
        error: 'Los últimos 10 videos del canal son Shorts. No se encontró un video normal.',
      });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;
    setCache(channel_id, videoUrl);

    console.log(`[ok] Redirigiendo ${channel_id} → ${videoUrl}`);
    return res.redirect(videoUrl);

  } catch (err) {
    const apiError = err.response?.data?.error?.message || err.message;
    console.error(`[error] YouTube API: ${apiError}`);
    return res.status(500).json({
      error: 'Error al consultar la API de YouTube.',
      detalle: apiError,
    });
  }
});

// Ruta raíz informativa
app.get('/', (req, res) => {
  res.json({
    mensaje: 'API de redirección al último video de YouTube',
    uso: '/ultimo-video?channel_id=UCXXXXX',
    documentacion: 'https://github.com/tu-usuario/tu-repo#readme',
  });
});

// Solo levanta el servidor si se corre directamente (node index.js).
// En Vercel, el export de abajo es lo que se usa.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

module.exports = app;
