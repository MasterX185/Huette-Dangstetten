# Changelog

Alle wichtigen Änderungen am HüttenPortal werden hier dokumentiert.

Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## [Unreleased]

### Geplant

- Weitere Optimierungen der mobilen Chatansicht
- Erweiterte Profilbild-Verwaltung

### Geändert

- Dark Mode mit System-Voreinstellung und gespeicherter Nutzerauswahl ergänzt
- App-Shell auf kontrastreiche, theme-fähige Oberflächen umgestellt
- Bewegte Blur-Hintergründe und teure Glass-Effekte durch statische, leichtere Ebenen ersetzt
- Fokuszustände für Eingabefelder verbessert

## [2026-09-11]

### Hinzugefügt

- Blog-Bereich für eingeloggte Nutzer
- Admin-Blogeditor mit Markdown-Formatierung
- Überschriften, Untertitel, Zitate, Listen, Links, Codeblöcke und Trennlinien
- Dynamische Blog-Tokens `{{date}}`, `{{time}}` und `{{datetime}}`
- Eingebettete Bilder aus Markdown-URLs
- Externer Bild-Upload über einen Cloudflare Worker und ImgBB
- Profilbild-Upload für Nutzer
- Profilbilder in Direktchat-Listen und Chatnachrichten
- Frosted-Glass-App-Shell mit seitlichem Menü
- Landingpage-Verlinkung

### Geändert

- Cloudflare Worker um geschützten `/notify`-Endpunkt für FCM und E-Mail erweitert
- Blog-, Chat- und Einladungsvorgänge an den Benachrichtigungsversand angebunden
- Einladungs-E-Mails vom Client in den Worker verlagert, um Doppelversand zu vermeiden
- Benachrichtigungseinstellungen für Push, E-Mail, Blog, Chat und Einladungen ergänzt
- Firebase-Cloud-Messaging-Tokenregistrierung und Hintergrund-Pushs im Service Worker vorbereitet
- Benachrichtigungspräferenzen werden pro Nutzer in Firestore gespeichert
- App-Navigation von Bottom-Navigation auf Drawer-Menü umgestellt
- Blog- und Chatdarstellung für Profilbilder erweitert
- Hintergrundanimation und Glasunschärfe für bessere Performance reduziert
- Externe JavaScript-Abhängigkeiten mit `defer` geladen
- Cloudflare-Worker-CORS auf GitHub Pages und lokale Entwicklung begrenzt
- Admin-Berechtigung für Blogbild-Uploads automatisch über Firestore-Rolle geprüft

### Sicherheit

- ImgBB-API-Key wird nicht mehr im Browser eingegeben oder ausgeliefert
- Bild-Uploads benötigen ein gültiges Firebase-ID-Token
- Blogbild-Uploads sind auf Nutzer mit `role: "admin"` beschränkt
- Fremde CORS-Origins werden vom Upload-Worker abgewiesen

### Behoben

- Markdown-Formatierungen wurden teilweise als Rohtext angezeigt
- Bild-Markdown wurde nicht als eingebettetes Bild gerendert
- Profilbilder wurden in Chatnachrichten nicht angezeigt
- Worker-CORS-Preflight blockierte den `Authorization`-Header
- Doppelte Firebase-Listener konnten bei erneuter Authentifizierung entstehen
