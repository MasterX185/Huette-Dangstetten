# 🏡 Hütten-Manager (Firebase Chat & Event Platform)

A full-featured, mobile-first web application designed for group coordination, real-time communication, and invitation management. Built with **vanilla JavaScript**, **Firebase** (Authentication, Cloud Firestore), **Leaflet maps**, and **EmailJS**.

---

## 📖 User Guidelines & Support

* **General Support:** If you have any questions or need help navigating the platform, please reach out to one of the **Admins**.
* **Account Deletion & Password Resets:** To delete your account or request a password reset, contact the **IT-Admin**.
  > **Note:** For security reasons, Admins can manage or remove user accounts, but they cannot directly view or edit existing plain-text passwords. You can also change your password on your own by clicking the "Forgot Password" button.

---

## 🌟 Features

### 💬 Real-Time Chat System
* **Global Chat (`global`):** Public chat room accessible to all authenticated users.
* **Tag-Based Group Channels (`#channel`):** Exclusive channels dynamically created by admins (e.g., `#Orga`, `#Küche`). Access is automatically restricted based on user tags.
* **Direct Messages (DMs):** Private 1-on-1 messaging between registered users.
* **Group Settings Panel:** In-chat admin panel for quick tag management, participant lookup, and channel deletion.

### ✉️ Event Invitations & RSVP
* **Personalized Email Invitations:** Send customizable HTML email invitations powered by EmailJS using template placeholders like `{{name}}`.
* **Interactive Maps:** Integrated Leaflet / OpenStreetMap controls to set precise location pins or select from pre-saved locations.
* **URL & In-App RSVP:** Invited users can confirm (`Yes`) or decline (`No`) directly from email links or within the dashboard.
* **Live Guest List:** Real-time visibility into current responses and guest attendance counts.

### 🛡️ Role-Based Access Control (RBAC) & User Management
* **User Roles:** Distinct privileges for standard `user` and `admin` roles.
* **Custom Tagging System:** Admins can create custom tags and assign them to users to grant channel access.
* **User Administration:** Admin tools to upgrade/downgrade roles, update tags, or permanently remove accounts.

---

## 📱 Tech Stack

| Domain | Technology |
| :--- | :--- |
| **Frontend** | HTML5, Modern CSS (Custom Properties / Flexbox / Grid), JavaScript ES6+ (Modules) |
| **Database & Auth** | Firebase Web SDK v10 (Cloud Firestore, Authentication with Redirect/Popup handling) |
| **Email Service** | EmailJS Browser SDK |
| **Maps & Routing** | Leaflet.js / OpenStreetMap |
| **Date Pickers** | Flatpickr (German Localization) |

---

## 📁 Project Structure

```text
├── index.html        # Main HTML structure, modal views, and CSS variables/styles
├── app.js            # Main application logic, Firebase SDK setup, and real-time listeners
└── README.md         # Technical documentation and user guide
```

---

## 🚀 Setup & Installation

### 1. Prerequisites
* A [Firebase Project](https://console.firebase.google.com/) with **Authentication** (Email/Password & Google Sign-In) and **Cloud Firestore** enabled.
* An active [EmailJS Account](https://www.emailjs.com/) for dispatching invitations.

### 2. Firebase Configuration
Update `app.js` with your project's configuration credentials:

```javascript
// Firebase Configuration (app.js)
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// EmailJS Initialization (app.js)
emailjs.init("YOUR_EMAILJS_PUBLIC_KEY");
```

Ensure your Service ID and Template ID match your `emailjs.send()` logic in `createNewInvitation()` and `updateAndResendInvitation()`.

### 3. Initializing the First Admin User
By default, newly registered users receive the `user` role. To elevate an account to **Admin**:

1. Register an account through the app UI or Google Sign-In.
2. Go to the **Firebase Console** $\rightarrow$ **Firestore Database** $\rightarrow$ `users` collection.
3. Select your user document and edit the `role` field:
   ```json
   {
     "role": "admin"
   }
   ```
4. Reload the web app. The **Admin** interface elements and management utilities will now be visible.

---

## 🔒 Cloud Firestore Security Rules

Apply these rules in your **Firebase Console** under **Firestore Database > Rules**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // --- Helper Functions ---
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isAdmin() {
      return isAuthenticated() && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    function hasTag(tagName) {
      return isAuthenticated() && 
        tagName in get(/databases/$(database)/documents/users/$(request.auth.uid)).data.tags;
    }

    // --- User Profiles ---
    match /users/{userId} {
      allow read: if isAuthenticated();
      // Admins can update any user; users can edit their own profile
      allow write: if isAuthenticated() && (request.auth.uid == userId || isAdmin());
    }

    // --- Saved Locations ---
    match /locations/{locationId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    // --- Invitations & Responses ---
    match /invitations/{invitationId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();

      // RSVP Subcollection
      match /responses/{userId} {
        allow read: if isAuthenticated();
        allow write: if isAuthenticated() && (request.auth.uid == userId || isAdmin());
      }
    }

    // --- Tags / Group Channels Metadata ---
    match /tags/{tagId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    // --- Email Templates ---
    match /templates/{templateId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    // --- Chat Room Metadata ---
    match /chat_groups/{groupId} {
      allow read: if isAuthenticated();
      allow create, delete, update: if isAdmin();
    }

    // --- Chat Messages Subcollection ---
    match /chats/{roomId}/messages/{messageId} {
      allow read: if isAuthenticated();
      
      // Write permission logic:
      // 1. 'global' room (all authenticated users)
      // 2. Direct Messages (room ID contains the sender's UID or Email)
      // 3. Tag channels (admin OR user possessing the corresponding tag)
      allow create: if isAuthenticated() && (
        roomId == 'global' ||
        roomId.matches('.*' + request.auth.uid + '.*') ||
        roomId.matches('.*' + request.auth.token.email + '.*') ||
        (roomId.matches('^tag_.*') && (isAdmin() || hasTag(roomId.replace('tag_', ''))))
      );
    }
  }
}
```

---

## 📄 License

This project is licensed under the **MIT License**.
