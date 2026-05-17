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

/**
 * GET /ultimo-video?channel_id=UCXXXXX
 *
 * Busca el video más reciente del canal (incluyendo Shorts) y redirige a él.
 */
app.get('/ultimo-video', async (req, res) => {
  const { channel_id } = req.query;

  // Validar que se recibió el parámetro
  if (!channel_id) {
    return res.status(400).json({
      error: 'Falta el parámetro channel_id. Ejemplo: /ultimo-video?channel_id=UCXXXXX',
    });
  }

  // Revisar cache antes de llamar a la API
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
    // YouTube Search API: lista videos del canal, ordenados por fecha descendente.
    // type=video incluye Shorts (son videos normales con duración ≤ 60 s).
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        key: apiKey,
        channelId: channel_id,
        part: 'snippet',
        order: 'date',       // más reciente primero
        type: 'video',       // solo videos (incluye Shorts)
        maxResults: 1,       // solo necesitamos el primero
      },
    });

    const items = response.data.items;

    // Si el canal no tiene videos o el canal_id no existe
    if (!items || items.length === 0) {
      return res.status(404).json({
        error: `No se encontraron videos para el canal: ${channel_id}`,
      });
    }

    const videoId = items[0].id.videoId;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Guardar en cache para las próximas peticiones
    setCache(channel_id, videoUrl);

    console.log(`[ok] Redirigiendo ${channel_id} → ${videoUrl}`);
    return res.redirect(videoUrl);

  } catch (err) {
    // Error de la API de YouTube (quota excedida, canal privado, etc.)
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
