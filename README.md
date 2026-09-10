# Hütte Dangstetten - Portal & Chat

Eine webbasierte Verwaltungs- und Kommunikationsplattform für die Hütte Dangstetten. Das Portal ermöglicht die Erstellung und den Versand von Einladungen inklusive Standortkarte, RSVP-Rückmeldungen sowie Gruppen- und Direkt-Chats in Echtzeit.

## 🚀 Funktionen

- **Authentifizierung:** Login via E-Mail/Passwort sowie Google Single Sign-On (Firebase Auth).
- **Einladungssystem & RSVP:**
  - Erstellen von Einladungen mit integrierter OpenStreetMap-Kartenauswahl.
  - Automatisierter E-Mail-Versand (EmailJS) mit personalisierten Links.
  - **RSVP-Rückmeldung:** Empfänger können direkt per Klick in der E-Mail zusagen oder absagen.
  - Admin-Übersicht über Zu- und Absagen pro Einladung.
- **Echtzeit-Chat:**
  - Öffentlicher Hütten-Hauptchat.
  - Admin-gesteuerte Gruppen-Kanäle basierend auf Tags.
  - Private Direktnachrichten (DMs) zwischen Nutzern.
- **Rollen- & Rechteverwaltung:** Unterscheidung zwischen Administratoren und Standard-Nutzern.

## 🛠️ Technologien

- **Frontend:** HTML5, CSS3, JavaScript (ES6 Modules)
- **Backend / Datenbank:** [Firebase Firestore](https://firebase.google.com/)
- **Authentifizierung:** [Firebase Authentication](https://firebase.google.com/docs/auth)
- **E-Mail-Versand:** [EmailJS](https://www.emailjs.com/)
- **Karten-Einbindung:** [Leaflet.js](https://leafletjs.com/) & [OpenStreetMap](https://www.openstreetmap.org/)
- **Date-Picker:** [Flatpickr](https://flatpickr.js.org/)

## 📦 Installation & Setup

1. **Repository klonen:**
   ```bash
   git clone [https://github.com/dein-username/huette-dangstetten.git](https://github.com/dein-username/huette-dangstetten.git)
   cd huette-dangstetten
