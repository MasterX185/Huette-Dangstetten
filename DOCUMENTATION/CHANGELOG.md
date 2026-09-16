# Changelog

Alle wichtigen Änderungen am HüttenPortal werden hier dokumentiert[cite: 14].

Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/)[cite: 14].

## [Unreleased]

### Geplant

- Weitere Optimierungen der mobilen Chatansicht[cite: 14]
- Erweiterte Profilbild-Verwaltung[cite: 14]

## [2026-09-13]

### Hinzugefügt

- Public Event-Anfragesystem für Gäste ohne Account über ein modales Formular[cite: 8, 12].
- Generierung und Verwaltung von Anfrage-Schlüsseln (`accessKey`) für Gäste zur Statusabfrage und Kommunikation[cite: 8, 9, 12].
- Cloudflare Worker Endpunkt `/event-request` zur sicheren serverseitigen Verarbeitung von Event-Anfragen und Gastnachrichten[cite: 9, 12].
- Admin-Verwaltung für Event-Anfragen in einem zwei-spaltigen Grid-Layout[cite: 8, 9].
- Statusverwaltung (*Neu*, *In Prüfung*, *Angenommen*, *Abgelehnt*) und Notizfunktion für Event-Anfragen[cite: 8, 9].
- Dynamische Einbettung der GitHub-Dokumentation `DOCUMENTATION/HELP.md` im Hilfe-Tab sowie in einem eigenen Login-Modal[cite: 10, 11].
- Zentriertes Fadenkreuz-Overlay (`.map-crosshair`) für die präzise Standortauswahl auf Leaflet-Karten[cite: 8].

### Geändert

- Hilfefunktion über ein eigenes Modal (`#help-modal`) direkt auf dem Login-Bildschirm zugänglich gemacht[cite: 11].
- Einheitliches Button-Design (`.btn-primary`, `.btn-secondary`, `.small-btn`, `.btn-danger`) über die gesamte Anwendung hinweg umgesetzt[cite: 8].
- Profil-Badges und Tag-Anzeigen in Chatnachrichten und Benutzerlisten integriert[cite: 8, 9].
- Mobile Navigation für Chats mit Zurück-Button-Optimierung verbessert[cite: 8, 9].

### Behoben

- Fehler beim Öffnen der Hilfe-Anleitung auf dem Anmeldebildschirm behoben[cite: 10, 11].
- Abweichende URLs zwischen HTML-Links und JavaScript-Fetching für die Hilfedokumentation vereinheitlicht[cite: 10, 11].

## [2026-09-11]

### Hinzugefügt

- Blog-Bereich für eingeloggte Nutzer[cite: 14]
- Admin-Blogeditor mit Markdown-Formatierung[cite: 14]
- Überschriften, Untertitel, Zitate, Listen, Links, Codeblöcke und Trennlinien[cite: 14]
- Dynamische Blog-Tokens `{{date}}`, `{{time}}` und `{{datetime}}`[cite: 14]
- Eingebettete Bilder aus Markdown-URLs[cite: 14]
- Externer Bild-Upload über einen Cloudflare Worker und ImgBB[cite: 14]
- Profilbild-Upload für Nutzer[cite: 14]
- Profilbilder in Direktchat-Listen und Chatnachrichten[cite: 14]
- Frosted-Glass-App-Shell mit seitlichem Menü[cite: 14]
- Landingpage-Verlinkung[cite: 14]

### Geändert

- Dark Mode mit System-Voreinstellung und gespeicherter Nutzerauswahl ergänzt[cite: 14]
- App-Shell auf kontrastreiche, theme-fähige Oberflächen umgestellt[cite: 14]
- Bewegte Blur-Hintergründe und teure Glass-Effekte durch statische, leichtere Ebenen ersetzt[cite: 14]
- Fokuszustände für Eingabefelder verbessert[cite: 14]
- Cloudflare Worker um geschützten `/notify`-Endpunkt für FCM und E-Mail erweitert[cite: 14]
- Blog-, Chat- und Einladungsvorgänge an den Benachrichtigungsversand angebunden[cite: 14]
- Einladungs-E-Mails vom Client in den Worker verlagert, um Doppelversand zu vermeiden[cite: 14]
- Benachrichtigungseinstellungen für Push, E-Mail, Blog, Chat und Einladungen ergänzt[cite: 14]
- Firebase-Cloud-Messaging-Tokenregistrierung und Hintergrund-Pushs im Service Worker vorbereitet[cite: 14]
- Benachrichtigungspräferenzen werden pro Nutzer in Firestore gespeichert[cite: 14]
- App-Navigation von Bottom-Navigation auf Drawer-Menü umgestellt[cite: 14]
- Blog- und Chatdarstellung für Profilbilder erweitert[cite: 14]
- Hintergrundanimation und Glasunschärfe für bessere Performance reduziert[cite: 14]
- Externe JavaScript-Abhängigkeiten mit `defer` geladen[cite: 14]
- Cloudflare-Worker-CORS auf GitHub Pages und lokale Entwicklung begrenzt[cite: 14]
- Admin-Berechtigung für Blogbild-Uploads automatisch über Firestore-Rolle geprüft[cite: 14]

### Sicherheit

- ImgBB-API-Key wird nicht mehr im Browser eingegeben oder ausgeliefert[cite: 14]
- Bild-Uploads benötigen ein gültiges Firebase-ID-Token[cite: 14]
- Blogbild-Uploads sind auf Nutzer mit `role: "admin"` beschränkt[cite: 14]
- Fremde CORS-Origins werden vom Upload-Worker abgewiesen[cite: 14]

### Behoben

- Markdown-Formatierungen wurden teilweise als Rohtext angezeigt[cite: 14]
- Bild-Markdown wurde nicht als eingebettetes Bild gerendert[cite: 14]
- Profilbilder wurden in Chatnachrichten nicht angezeigt[cite: 14]
- Worker-CORS-Preflight blockierte den `Authorization`-Header[cite: 14]
- Doppelte Firebase-Listener konnten bei erneuter Authentifizierung entstehen[cite: 14]