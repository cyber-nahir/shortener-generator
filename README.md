# YouTube Last Video Redirector

API minimalista que redirige automáticamente al video más reciente de cualquier canal de YouTube, incluyendo Shorts. Un solo endpoint reutilizable para cualquier canal.

## ¿Cómo funciona?

El cliente hace una petición al endpoint pasando el ID del canal. El servidor consulta la API de YouTube, obtiene el video más reciente y responde con una redirección `302` directamente a YouTube.

```
Cliente → GET /ultimo-video?channel_id=UC... → Servidor → YouTube API → 302 → youtube.com/watch?v=...
```

El resultado se guarda en caché por 5 minutos, por lo que peticiones repetidas al mismo canal no consumen cuota de la API.

---

## Endpoint

```
GET /ultimo-video?channel_id={CHANNEL_ID}
```

| Parámetro    | Tipo   | Descripción                                   |
| ------------ | ------ | --------------------------------------------- |
| `channel_id` | string | ID del canal de YouTube (empieza con `UC...`) |

**Ejemplo:**

```
GET /ultimo-video?channel_id=UCddiUEpeqJcYeBxX1IVBKvQ
→ 302 https://www.youtube.com/watch?v=xxxxxxx
```

### Respuestas

| Código | Situación                                     |
| ------ | --------------------------------------------- |
| `302`  | Redirección exitosa al último video           |
| `400`  | Falta el parámetro `channel_id`               |
| `404`  | El canal no tiene videos o el ID no existe    |
| `500`  | Error de la API de YouTube o falta la API Key |

---

## Dónde encontrar el Channel ID

En YouTube, ve al canal y mira la URL:

```
https://www.youtube.com/channel/UCddiUEpeqJcYeBxX1IVBKvQ
                                 ↑ este es el channel_id
```

Si la URL usa `@usuario`, puedes obtener el ID desde la página del canal en _Acerca de → Compartir → Copiar ID del canal_.

---

## Configuración local

### 1. Obtener una API Key de YouTube

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un proyecto o usa uno existente
3. Activa **YouTube Data API v3** en _APIs y servicios → Biblioteca_
4. Ve a _Credenciales → Crear credencial → Clave de API_
5. Copia la clave generada (empieza con `AIza...`)

### 2. Instalar y correr

```bash
npm install

cp .env.example .env
# Edita .env y pega tu clave en YOUTUBE_API_KEY

npm start
# Servidor en http://localhost:3000
```

Para desarrollo con auto-reload:

```bash
npm run dev
```

### 3. Probar

```bash
# Sigue la redirección hasta YouTube
curl -L "http://localhost:3000/ultimo-video?channel_id=UCXXXXX"

# Solo ver la URL de destino sin redirigir
curl -I "http://localhost:3000/ultimo-video?channel_id=UCXXXXX"
```

---

## Despliegue en Vercel

El archivo `vercel.json` ya está incluido y listo.

```bash
npm install -g vercel
vercel

# Agregar la variable de entorno
vercel env add YOUTUBE_API_KEY
```

Una vez desplegado, el endpoint queda disponible en:

```
https://tu-proyecto.vercel.app/ultimo-video?channel_id=UC...
```

---

## Variables de entorno

| Variable          | Requerida | Descripción                    |
| ----------------- | --------- | ------------------------------ |
| `YOUTUBE_API_KEY` | Sí        | API Key de YouTube Data v3     |
| `PORT`            | No        | Puerto local (default: `3000`) |

---

## Stack

- [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/)
- [YouTube Data API v3](https://developers.google.com/youtube/v3)
- [Axios](https://axios-http.com/) para las peticiones HTTP
- Caché en memoria con `Map` nativo (sin dependencias extra)
