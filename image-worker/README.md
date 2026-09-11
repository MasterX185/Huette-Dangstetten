# HüttenPortal Worker

Der Worker lädt Blogbilder und Profilbilder zu ImgBB hoch und versendet Push-/E-Mail-Benachrichtigungen, ohne sensible Schlüssel an den Browser auszuliefern.

## Einrichtung

```bash
cd image-worker
npm install
npx wrangler login
npx wrangler secret put IMGBB_API_KEY
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
npx wrangler deploy
```

`FIREBASE_SERVICE_ACCOUNT_JSON` ist der komplette JSON-Inhalt eines Firebase-Service-Accounts. Niemals committen oder in `wrangler.toml` eintragen. Der Worker verwendet das vorhandene EmailJS-Template `template_rl8z3ur` mit den Parametern `to_email`, `subject`, `message`, `from_name` und `reply_to`.

Der produktive Worker ist unter `https://huettenportal-image-worker.j-s-schulze.workers.dev` erreichbar. Die App verwendet `/upload` für Bilder und `/notify` für Benachrichtigungen. Für weitere Origins `ALLOWED_ORIGIN` in `wrangler.toml` anpassen und erneut deployen.

Der Worker akzeptiert Firebase-ID-Tokens. Für Bloguploads liest er mit dem authentifizierten Token das eigene Firestore-Dokument `users/{uid}` und prüft `role == "admin"`; Profiluploads sind für alle angemeldeten Nutzer erlaubt.
