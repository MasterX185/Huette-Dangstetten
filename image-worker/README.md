# HüttenPortal Image Worker

Der Worker lädt Blogbilder und Profilbilder zu ImgBB hoch, ohne den ImgBB-Key an den Browser auszuliefern.

## Einrichtung

```bash
cd image-worker
npm install
npx wrangler login
npx wrangler secret put IMGBB_API_KEY
npx wrangler deploy
```

Danach in `app.js` `IMAGE_UPLOAD_WORKER_URL` auf die ausgegebene Worker-URL mit `/upload` setzen. In `wrangler.toml` muss `ALLOWED_ORIGIN` auf die echte Website-Adresse zeigen. Mehrere Origins werden kommasepariert eingetragen, zum Beispiel `http://localhost:8000,https://deine-app.example`.

Der Worker akzeptiert Firebase-ID-Tokens. Für Bloguploads liest er mit dem authentifizierten Token das eigene Firestore-Dokument `users/{uid}` und prüft `role == "admin"`; Profiluploads sind für alle angemeldeten Nutzer erlaubt.
