# Changelog

Alle wichtigen Änderungen am HüttenPortal werden hier dokumentiert[cite: 7].

Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/)[cite: 7].

## [Unreleased]

### Geplant

- Weitere Optimierungen der mobilen Chatansicht[cite: 7]
- Erweiterte Profilbild-Verwaltung[cite: 7]

## [2026-09-17]

### Behoben

- **E-Mail-Button-Darstellung:** Leere Action-Buttons (`href=""`) in E-Mails bei fehlenden Links (z. B. bei Blogbeiträgen oder Einladungen ohne Standort) behoben[cite: 6].
- Dynamische Steuerung der Button-Sichtbarkeit (`maps_display`, `status_display`) via Inline-CSS im Cloudflare Worker (`index.js`) und EmailJS-Template integriert[cite: 6].

## [2026-09-13]

### Hinzugefügt

- Public Event-Anfragesystem für Gäste ohne Account über ein modales Formular[cite: 7, 8].
- Generierung und Verwaltung von Anfrage-Schlüsseln (`accessKey`) für Gäste zur Statusabfrage und Kommunikation[cite: 7, 8].
- Cloudflare Worker Endpunkt `/event-request` zur sicheren serverseitigen Verarbeitung von Event-Anfragen und Gastnachrichten[cite: 6, 7].
- Admin-Verwaltung für Event-Anfragen in einem zwei-spaltigen Grid-Layout[cite: 7, 8].
- Statusverwaltung (*Neu*, *In Prüfung*, *Angenommen*, *Abgelehnt*) und Notizfunktion für Event-Anfragen[cite: 7, 8].
- Dynamische Einbettung der GitHub-Dokumentation `DOCUMENTATION/HELP.md` im Hilfe-Tab sowie in einem eigenen Login-Modal[cite: 7, 8].
- Zentriertes Fadenkreuz-Overlay (`.map-crosshair`) für die präzise Standortauswahl auf Leaflet-Karten[cite: 7, 8].

### Geändert

- Hilfefunktion über ein eigenes Modal (`#help-modal`) direkt auf dem Login-Bildschirm zugänglich gemacht[cite: 7, 8].
- Einheitliches Button-Design (`.btn-primary`, `.btn-secondary`, `.small-btn`, `.btn-danger`) über die gesamte Anwendung hinweg umgesetzt[cite: 7, 8].
- Profil-Badges und Tag-Anzeigen in Chatnachrichten und Benutzerlisten integriert[cite: 7, 8].
- Mobile Navigation für Chats mit Zurück-Button-Optimierung verbessert[cite: 7, 8].

### Behoben

- Fehler beim Öffnen der Hilfe-Anleitung auf dem Anmeldebildschirm behoben[cite: 7, 8].
- Abweichende URLs zwischen HTML-Links und JavaScript-Fetching für die Hilfedokumentation vereinheitlicht[cite: 7, 8].

## [2026-09-11]

### Hinzugefügt

- Blog-Bereich für eingeloggte Nutzer[cite: 7]
- Admin-Blogeditor mit Markdown-Formatierung[cite: 7]
- Überschriften, Untertitel, Zitate, Listen, Links, Codeblöcke und Trennlinien[cite: 7]
- Dynamische Blog-Tokens `{{date}}`, `{{time}}` und `{{datetime}}`[cite: 7]
- Eingebettete Bilder aus Markdown-URLs[cite: 7]
- Externer Bild-Upload über einen Cloudflare Worker und ImgBB[cite: 7]
- Profilbild-Upload für Nutzer[cite: 7]
- Profilbilder in Direktchat-Listen und Chatnachrichten[cite: 7]
- Frosted-Glass-App-Shell mit seitlichem Menü[cite: 7]
- Landingpage-Verlinkung[cite: 7]

### Geändert

- Dark Mode mit System-Voreinstellung und gespeicherter Nutzerauswahl ergänzt[cite: 7]
- App-Shell auf kontrastreiche, theme-fähige Oberflächen umgestellt[cite: 7]
- Bewegte Blur-Hintergründe und teure Glass-Effekte durch statische, leichtere Ebenen ersetzt[cite: 7]
- Fokuszustände für Eingabefelder verbessert[cite: 7]
- Cloudflare Worker um geschützten `/notify`-Endpunkt für FCM und E-Mail erweitert[cite: 6, 7]
- Blog-, Chat- und Einladungsvorgänge an den Benachrichtigungsversand angebunden[cite: 7]
- Einladungs-E-Mails vom Client in den Worker verlagert, um Doppelversand zu vermeiden[cite: 6, 7]
- Benachrichtigungseinstellungen für Push, E-Mail, Blog, Chat und Einladungen ergänzt[cite: 7]
- Firebase-Cloud-Messaging-Tokenregistrierung und Hintergrund-Pushs im Service Worker vorbereitet[cite: 7]
- Benachrichtigungspräferenzen werden pro Nutzer in Firestore gespeichert[cite: 6, 7]
- App-Navigation von Bottom-Navigation auf Drawer-Menü umgestellt[cite: 7]
- Blog- und Chatdarstellung für Profilbilder erweitert[cite: 7]
- Hintergrundanimation und Glasunschärfe für bessere Performance reduziert[cite: 7]
- Externe JavaScript-Abhängigkeiten mit `defer` geladen[cite: 7]
- Cloudflare-Worker-CORS auf GitHub Pages und lokale Entwicklung begrenzt[cite: 6, 7]
- Admin-Berechtigung für Blogbild-Uploads automatisch über Firestore-Rolle geprüft[cite: 6, 7]

### Sicherheit

- ImgBB-API-Key wird nicht mehr im Browser eingegeben oder ausgeliefert[cite: 7]
- Bild-Uploads benötigen ein gültiges Firebase-ID-Token[cite: 6, 7]
- Blogbild-Uploads sind auf Nutzer mit `role: "admin"` beschränkt[cite: 6, 7]
- Fremde CORS-Origins werden vom Upload-Worker abgewiesen[cite: 6, 7]

### Behoben

- Markdown-Formatierungen wurden teilweise als Rohtext angezeigt[cite: 7]
- Bild-Markdown wurde nicht als eingebettetes Bild gerendert[cite: 7]
- Profilbilder wurden in Chatnachrichten nicht angezeigt[cite: 7]
- Worker-CORS-Preflight blockierte den `Authorization`-Header[cite: 7]
- Doppelte Firebase-Listener konnten bei erneuter Authentifizierung entstehen[cite: 7]