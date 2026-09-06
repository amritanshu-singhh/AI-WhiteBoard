# AI-Powered Collaborative Whiteboard

A full-stack, responsive real-time whiteboard where multiple users draw together on a
shared canvas, with AI-based handwriting-to-text recognition, board save/load, and
shareable collaboration links.

## Stack

| Layer      | Technology |
|------------|------------|
| Frontend   | Vanilla JS + HTML5 Canvas (Pointer Events) + CSS Grid/Flexbox — no build step required |
| Real-time  | Socket.io |
| Backend    | Node.js + Express |
| Database   | MongoDB (Mongoose) |
| AI / OCR   | Tesseract.js (runs fully client-side, no API key needed) |

> The original report proposed a React frontend. This build uses plain JS instead so it
> runs directly in the browser with zero build tooling — functionally equivalent, and
> easier to run/demo. Swapping in React later is straightforward since the drawing,
> socket, and OCR logic in `app.js` is already isolated from markup.

## Features implemented

- **Real-time collaborative drawing** — every stroke is broadcast instantly via
  WebSockets (Socket.io) to everyone viewing the same board.
- **Live presence** — see who else is currently on the board, and their live cursor position.
- **AI handwriting recognition** — click "Recognize Handwriting" to OCR the canvas
  content into editable text (Tesseract.js).
- **Save / load boards** — boards persist to MongoDB with full stroke history and a
  thumbnail snapshot; reload any saved board from the sidebar.
- **Shareable links** — "Copy Share Link" puts a URL with `?board=<id>` on your
  clipboard; anyone who opens it joins the same live session.
- **Fully responsive UI** — sidebar collapses into a slide-out drawer on mobile,
  canvas resizes with the window (high-DPI aware), touch/stylus supported via
  Pointer Events.
- **Pen / eraser tools**, adjustable color and brush size, clear board.
- **Graceful degradation** — if MongoDB isn't running, the backend still starts and
  real-time drawing still works; only save/load is unavailable until the DB is connected.

## Project structure

```
ai-whiteboard/
├── backend/
│   ├── server.js          # Express + Socket.io + Mongoose bootstrap
│   ├── models/Board.js    # Mongoose schema for a saved board
│   ├── routes/boards.js   # REST API: list / get / create / update / delete boards
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── index.html
    ├── style.css
    ├── config.js           # points the frontend at your backend URL
    └── app.js              # canvas drawing, socket events, save/load, OCR
```

## Running it locally

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # edit MONGO_URI if you're using MongoDB Atlas
npm start
```

The server starts on `http://localhost:5000`. If MongoDB isn't reachable, it still
starts (drawing/collaboration works; save/load will fail until the DB is up).

You need a MongoDB instance — either:
- install MongoDB locally (`mongod`), or
- use a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster and paste its
  connection string into `.env` as `MONGO_URI`.

### 2. Frontend

No build step — just serve the static files. Easiest options:

```bash
cd frontend
npx serve .
# or: python3 -m http.server 8080
```

Then open the printed URL (e.g. `http://localhost:8080`) in two different browser
tabs/devices to see real-time collaboration in action.

> `config.js` assumes the backend runs on the same hostname, port 5000. If you deploy
> the backend elsewhere, update `API_BASE` in `config.js`.

## Deploying

- **Backend**: any Node host (Render, Railway, Fly.io, a VPS). Set `MONGO_URI` to an
  Atlas connection string and `PORT` as required by the host.
- **Frontend**: any static host (Netlify, Vercel, GitHub Pages). Update `config.js`
  to point at your deployed backend's URL.
- Enable CORS/WebSocket support on whatever reverse proxy sits in front of the backend.

## How it matches the original proposal

| Report section | Status in this build |
|---|---|
| Real-time sync via WebSockets | ✅ Socket.io, broadcast per stroke |
| AI handwriting recognition | ✅ Tesseract.js OCR on canvas |
| Save/share boards | ✅ MongoDB persistence + shareable link |
| Responsive UI | ✅ mobile drawer, touch support, fluid canvas |
| Future scope (voice, video, shape detection) | Not implemented — noted as future work, same as the report |

## Known limitations (carried over from the report, plus implementation notes)

- OCR accuracy depends heavily on handwriting legibility, same caveat as the report.
- No authentication yet — `owner`/collaborator names are ephemeral guest names.
  Swapping in real auth would mean adding a `User` model and gating the board routes.
- Presence/cursor state is in-memory on the server, so it resets if the backend restarts.
- Stroke history is stored as a flat array; for very long-running boards you'd want to
  periodically flatten strokes into the thumbnail and trim history for performance.
