import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, onAuthStateChanged, updateEmail, GoogleAuthProvider,
    signInWithPopup, signInWithRedirect, getRedirectResult,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore, doc, setDoc, getDoc, collection, onSnapshot, addDoc,
    query, orderBy, serverTimestamp, deleteDoc, updateDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Initialize EmailJS
emailjs.init("CFQLo5C6SDyav2WuP");

const firebaseConfig = {
    apiKey: "AIzaSyCLhOlcwKeqtdNNF_HrFA0xavgOgZjHMPw",
    authDomain: "huette-dangstetten-3a737.firebaseapp.com",
    projectId: "huette-dangstetten-3a737",
    storageBucket: "huette-dangstetten-3a737.firebasestorage.app",
    messagingSenderId: "700971650309",
    appId: "1:700971650309:web:0793b2667578bc8eea7b6c"
};

// Nach dem Deploy auf die URL deines Workers setzen.
const IMAGE_UPLOAD_WORKER_URL = "https://huettenportal-image-worker.j-s-schulze.workers.dev/upload";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let isRegistering = false;
let currentUserData = null;
let usersList = [];
let tagsList = [];
let templatesList = [];
let selectedUserEmails = new Set();
let savedLocations = [];
let map = null;
let currentChatRoom = "global";
let activeChatUnsubscribe = null;
let activeUnsubscribes = [];
let invitationsCache = {};
let appInitialized = false;

async function handleRSVPFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const invId = urlParams.get('rsvp_inv');
    const status = urlParams.get('rsvp_status');

    if (invId && status && auth.currentUser) {
        try {
            const rsvpRef = doc(db, `invitations/${invId}/responses`, auth.currentUser.uid);
            await setDoc(rsvpRef, {
                userEmail: auth.currentUser.email,
                userName: currentUserData?.name || auth.currentUser.email,
                status: status,
                respondedAt: serverTimestamp()
            });

            window.history.replaceState({}, document.title, window.location.pathname);
            alert(status === 'yes' ? 'Vielen Dank! Deine Zusage wurde gespeichert.' : 'Schade! Deine Absage wurde gespeichert.');
        } catch (err) {
            console.error("Fehler beim Speichern der Rückmeldung:", err);
        }
    }
}

async function ensureUserDocument(user) {
    if (!user) return null;
    const userRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
        const newUserData = {
            name: user.displayName || user.email.split('@')[0] || 'Google-Nutzer',
            email: user.email,
            role: 'user',
            tags: []
        };
        await setDoc(userRef, newUserData);
        return newUserData;
    }
    return userDoc.data();
}

getRedirectResult(auth).then(async (result) => {
    if (result && result.user) await ensureUserDocument(result.user);
}).catch((error) => {
    const authMessage = document.getElementById('auth-message');
    if (authMessage) authMessage.innerText = 'Google-Login Fehler: ' + error.message;
});

function stopAllListeners() {
    activeUnsubscribes.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
    });
    activeUnsubscribes = [];
    if (activeChatUnsubscribe) {
        activeChatUnsubscribe();
        activeChatUnsubscribe = null;
    }
}

window.toggleUserTag = async (uid, tagName, add) => {
    if (!currentUserData || currentUserData.role !== 'admin') return;
    const userObj = usersList.find(u => u.id === uid);
    if (!userObj) return;
    let tags = Array.from(userObj.tags || []);
    if (add) {
        if (!tags.includes(tagName)) tags.push(tagName);
    } else {
        tags = tags.filter(t => t !== tagName);
    }
    try {
        await updateDoc(doc(db, "users", uid), { tags });
        if (currentChatRoom === "tag_" + tagName) setupTagSettingsPanel(tagName);
    } catch (err) {
        alert('Fehler beim Zuweisen des Tags: ' + err.message);
    }
};

window.deleteTag = async (tagId, tagName) => {
    if (!currentUserData || currentUserData.role !== 'admin') return;
    if (!confirm(`Gruppe / Tag "${tagName}" wirklich löschen?`)) return;
    try {
        await deleteDoc(doc(db, "tags", tagId));
        if (currentChatRoom === "tag_" + tagName) {
            window.switchChatRoom('global', 'Hütten-Hauptchat', 'Öffentlicher Raum für alle', '<svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>');
        }
    } catch (err) {
        alert('Fehler beim Löschen: ' + err.message);
    }
};

window.deleteLocation = async (locationId) => {
    if (!currentUserData || currentUserData.role !== 'admin') return;
    if (confirm("Möchtest du diesen gespeicherten Ort wirklich löschen?")) {
        try {
            await deleteDoc(doc(db, "locations", locationId));
        } catch (err) {
            alert('Fehler: ' + err.message);
        }
    }
};

window.deleteInvitation = async (invitationId) => {
    if (!currentUserData || currentUserData.role !== 'admin') return;
    if (confirm("Möchtest du diesen Einladungs-Eintrag wirklich löschen?")) {
        try {
            await deleteDoc(doc(db, "invitations", invitationId));
            window.closeModal();
        } catch (err) {
            alert('Fehler: ' + err.message);
        }
    }
};

window.toggleUserRole = async (uid, currentRole) => {
    if (!currentUserData || currentUserData.role !== 'admin') return;
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    await updateDoc(doc(db, "users", uid), { role: newRole });
};

window.deleteUserDoc = async (uid) => {
    if (!currentUserData || currentUserData.role !== 'admin') return;
    if (confirm("Nutzer wirklich löschen?")) {
        await deleteDoc(doc(db, "users", uid));
    }
};

window.openInvitationModal = async (invId) => {
    const inv = invitationsCache[invId];
    if (!inv) return;

    const modal = document.getElementById('invitation-modal');
    const contentBox = document.getElementById('modal-content-box');
    const isAdmin = currentUserData && currentUserData.role === 'admin';
    const userUid = auth.currentUser ? auth.currentUser.uid : null;

    let yesList = [];
    let noList = [];
    let myCurrentStatus = null;

    try {
        const responsesSnap = await getDocs(collection(db, `invitations/${invId}/responses`));
        responsesSnap.forEach(docSnap => {
            const data = docSnap.data();
            const displayName = data.userName || data.userEmail;
            if (data.status === 'yes') yesList.push(displayName);
            if (data.status === 'no') noList.push(displayName);

            if (docSnap.id === userUid) {
                myCurrentStatus = data.status;
            }
        });
    } catch (err) {
        console.error("Fehler beim Laden der Rückmeldungen:", err);
    }

    contentBox.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
    <h3 style="margin:0; color:var(--primary-dark);">Einladungsdetails</h3>
    <button class="small-btn btn-secondary" onclick="window.closeModal()" style="padding:2px 8px;">✕</button>
    </div>

    <div style="font-size:0.9rem; display:flex; flex-direction:column; gap:8px; margin-top:12px;">
    <div><strong>Datum & Uhrzeit:</strong> ${inv.datetime || 'Nicht angegeben'}</div>
    <div><strong>Erstellt von:</strong> ${inv.createdBy || 'Unbekannt'}</div>
    <div><strong>Empfänger:</strong> ${inv.recipients ? inv.recipients.join(', ') : 'Keine'}</div>
    <div><strong>Hinweise:</strong> ${inv.details || 'Keine'}</div>
    ${inv.updatedAt ? `<div style="color: var(--primary); font-size: 0.8rem; font-weight: 500;">⚡ Diese Einladung wurde aktualisiert.</div>` : ''}
    ${inv.mapsUrl ? `
        <div>
        <a href="${inv.mapsUrl}" target="_blank" rel="noopener" style="color:var(--primary); font-weight:500; display:flex; align-items:center; gap:4px; text-decoration:underline;">
        <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Standort auf Google Maps öffnen
        </a>
        </div>` : ''}
        </div>

        <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:8px;">
        <strong>Deine Rückmeldung:</strong>
        <div style="display:flex; gap:10px; margin-top:8px;">
        <button class="small-btn" id="rsvp-yes-btn" style="flex:1; background:${myCurrentStatus === 'yes' ? '#059669' : '#10b981'};">
        ${myCurrentStatus === 'yes' ? '✓ Zugesagt' : 'Ich komme'}
        </button>
        <button class="small-btn delete-btn" id="rsvp-no-btn" style="flex:1; opacity:${myCurrentStatus === 'no' ? '1' : '0.8'};">
        ${myCurrentStatus === 'no' ? '✕ Abgesagt' : 'Ich kann nicht'}
        </button>
        </div>
        </div>

        <div style="border-top:1px solid var(--border); padding-top:12px; font-size:0.85rem;">
        <strong>Teilnehmer-Status:</strong>
        <div style="color: #059669; font-weight: 500; margin-top: 4px;">Zusagen (${yesList.length}): ${yesList.join(', ') || 'Keine'}</div>
        <div style="color: var(--danger); font-weight: 500; margin-top: 2px;">Absagen (${noList.length}): ${noList.join(', ') || 'Keine'}</div>
        </div>

        ${isAdmin ? `
            <div style="border-top:1px solid var(--border); padding-top:12px; display:flex; gap:8px; justify-content:flex-end;">
            <button class="small-btn delete-btn" onclick="window.deleteInvitation('${invId}')">Löschen</button>
            <button class="small-btn" onclick="window.startEditingInvitation('${invId}')">Bearbeiten & Neu senden</button>
            </div>` : ''}
            `;

            document.getElementById('rsvp-yes-btn').onclick = () => window.submitRSVP(invId, 'yes');
            document.getElementById('rsvp-no-btn').onclick = () => window.submitRSVP(invId, 'no');

            modal.classList.remove('hidden');
};

window.submitRSVP = async (invId, status) => {
    if (!auth.currentUser) return;
    try {
        const userRef = doc(db, `invitations/${invId}/responses`, auth.currentUser.uid);
        await setDoc(userRef, {
            userEmail: auth.currentUser.email,
            userName: currentUserData?.name || auth.currentUser.email,
            status: status,
            updatedAt: serverTimestamp()
        });

        window.openInvitationModal(invId);
    } catch (err) {
        alert('Fehler beim Speichern der Rückmeldung: ' + err.message);
    }
};

window.closeModal = () => {
    document.getElementById('invitation-modal').classList.add('hidden');
};

window.startEditingInvitation = (invId) => {
    const inv = invitationsCache[invId];
    if (!inv) return;
    window.closeModal();

    const pickerEl = document.getElementById('datetime-picker');
    if (pickerEl._flatpickr) {
        pickerEl._flatpickr.setDate(inv.datetime, true);
    } else {
        pickerEl.value = inv.datetime || '';
    }

    document.getElementById('email-subject-input').value = inv.subject || '';
    document.getElementById('email-message-input').value = inv.details || '';

    selectedUserEmails.clear();
    if (inv.recipients) {
        inv.recipients.forEach(email => selectedUserEmails.add(email));
    }
    renderUserChips();

    const sendBtn = document.getElementById('send-invite-btn');
    sendBtn.innerText = "Änderungen speichern & aktualisiert senden";
    sendBtn.onclick = () => window.updateAndResendInvitation(invId);

    document.getElementById('nav-invite-btn').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

function resetSendButtonToCreate() {
    const sendBtn = document.getElementById('send-invite-btn');
    sendBtn.innerHTML = `Einladung senden`;
    sendBtn.onclick = createNewInvitation;
}

const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const authTitle = document.getElementById('auth-title');
const nameGroup = document.getElementById('name-group');
const authName = document.getElementById('auth-name');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const googleLoginBtn = document.getElementById('google-login-btn');
const authToggleBtn = document.getElementById('auth-toggle-btn');
const authToggleText = document.getElementById('auth-toggle-text');
const authMessage = document.getElementById('auth-message');
const forgotPasswordBtn = document.getElementById('forgot-password-btn');
const forgotPasswordContainer = document.getElementById('forgot-password-container');

const navInviteBtn = document.getElementById('nav-invite-btn');
const navBlogBtn = document.getElementById('nav-blog-btn');
const navChatBtn = document.getElementById('nav-chat-btn');
const navProfileBtn = document.getElementById('nav-profile-btn');
const tabInviteContent = document.getElementById('tab-invite-content');
const tabBlogContent = document.getElementById('tab-blog-content');
const tabChatContent = document.getElementById('tab-chat-content');
const tabProfileContent = document.getElementById('tab-profile-content');

function switchTab(activeBtn, activeContent) {
    [navInviteBtn, navBlogBtn, navChatBtn, navProfileBtn].forEach(b => b && b.classList.remove('active'));
    [tabInviteContent, tabBlogContent, tabChatContent, tabProfileContent].forEach(c => c && c.classList.add('hidden'));
    activeBtn.classList.add('active');
    activeContent.classList.remove('hidden');
    if (activeBtn === navInviteBtn && map) {
        setTimeout(() => map.invalidateSize(), 200);
    }
}

navInviteBtn.addEventListener('click', () => switchTab(navInviteBtn, tabInviteContent));
navBlogBtn.addEventListener('click', () => switchTab(navBlogBtn, tabBlogContent));
navChatBtn.addEventListener('click', () => {
    switchTab(navChatBtn, tabChatContent);
    if (window.innerWidth < 768) {
        document.getElementById('chat-sidebar').style.display = 'flex';
        document.getElementById('chat-main').style.display = 'none';
    }
});
navProfileBtn.addEventListener('click', () => {
    switchTab(navProfileBtn, tabProfileContent);
    renderProfileTags();
});

const appMenu = document.getElementById('app-menu');
const menuScrim = document.getElementById('menu-scrim');
const appBarTitle = document.getElementById('app-bar-title');
const openAppMenuBtn = document.getElementById('open-app-menu-btn');
const closeAppMenuBtn = document.getElementById('close-app-menu-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeToggleState = document.getElementById('theme-toggle-state');

function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    localStorage.setItem('huettenportal-theme', isDark ? 'dark' : 'light');
    themeToggleBtn?.setAttribute('aria-pressed', String(isDark));
    if (themeToggleState) themeToggleState.innerText = isDark ? 'Dunkel' : 'Hell';
}

applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
themeToggleBtn?.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

function setAppMenuOpen(isOpen) {
    appMenu?.classList.toggle('open', isOpen);
    menuScrim?.classList.toggle('hidden', !isOpen);
    openAppMenuBtn?.setAttribute('aria-expanded', String(isOpen));
}

function selectAppMenuTab(tabName) {
    const tabMap = {
        invite: [navInviteBtn, tabInviteContent, 'Einladungen'],
        blog: [navBlogBtn, tabBlogContent, 'Blog'],
        chat: [navChatBtn, tabChatContent, 'Chat'],
        profile: [navProfileBtn, tabProfileContent, 'Profil & Verwaltung']
    };
    const target = tabMap[tabName];
    if (!target) return;

    switchTab(target[0], target[1]);
    if (target[0] === navProfileBtn) renderProfileTags();
    if (target[0] === navChatBtn && window.innerWidth < 768) {
        document.getElementById('chat-sidebar').style.display = 'flex';
        document.getElementById('chat-main').style.display = 'none';
    }
    if (appBarTitle) appBarTitle.innerText = target[2];
    document.querySelectorAll('[data-menu-tab]').forEach(item => {
        item.classList.toggle('active', item.dataset.menuTab === tabName);
    });
    setAppMenuOpen(false);
}

openAppMenuBtn?.addEventListener('click', () => setAppMenuOpen(true));
closeAppMenuBtn?.addEventListener('click', () => setAppMenuOpen(false));
menuScrim?.addEventListener('click', () => setAppMenuOpen(false));
document.querySelectorAll('[data-menu-tab]').forEach(item => {
    item.addEventListener('click', () => selectAppMenuTab(item.dataset.menuTab));
});

document.getElementById('mobile-back-btn').addEventListener('click', () => {
    if (window.innerWidth < 768) {
        document.getElementById('chat-sidebar').style.display = 'flex';
        document.getElementById('chat-main').style.display = 'none';
    }
});

authToggleBtn.addEventListener('click', () => {
    isRegistering = !isRegistering;
    authTitle.innerText = isRegistering ? 'Registrieren' : 'Anmelden';
    authSubmitBtn.innerText = isRegistering ? 'Account erstellen' : 'Anmelden';
    nameGroup.style.display = isRegistering ? 'block' : 'none';
    if (forgotPasswordContainer) {
        forgotPasswordContainer.style.display = isRegistering ? 'none' : 'block';
    }
    authToggleText.innerText = isRegistering ? 'Bereits einen Account?' : 'Noch keinen Account?';
    authToggleBtn.innerText = isRegistering ? 'Anmelden' : 'Registrieren';
    authMessage.innerText = '';
});

authSubmitBtn.addEventListener('click', async () => {
    const email = authEmail.value.trim();
    const password = authPassword.value;
    const name = authName.value.trim();
    authMessage.innerText = '';
    authMessage.style.color = 'var(--danger)';

    if (!email || !password) {
        authMessage.innerText = 'Bitte E-Mail und Passwort eingeben.';
        return;
    }

    try {
        if (isRegistering) {
            if (!name) { authMessage.innerText = 'Bitte Namen eingeben.'; return; }
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, "users", cred.user.uid), { name, email, role: 'user', tags: [] });
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        authMessage.innerText = 'Fehler: ' + error.message;
    }
});

// Passwort vergessen Handler mit Firebase Auth sendPasswordResetEmail
if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = authEmail.value.trim();
        authMessage.innerText = '';

        if (!email) {
            authMessage.style.color = 'var(--danger)';
            authMessage.innerText = 'Bitte gib zuerst deine E-Mail-Adresse in das E-Mail-Feld ein.';
            return;
        }

        try {
            await sendPasswordResetEmail(auth, email);
            authMessage.style.color = 'var(--success)';
            authMessage.innerText = 'E-Mail zum Zurücksetzen des Passworts wurde versendet! Bitte prüfe deinen Posteingang.';
        } catch (error) {
            authMessage.style.color = 'var(--danger)';
            authMessage.innerText = 'Fehler beim Senden: ' + error.message;
        }
    });
}

googleLoginBtn.addEventListener('click', async () => {
    authMessage.innerText = '';
    authMessage.style.color = 'var(--danger)';
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
        const result = await signInWithPopup(auth, provider);
        await ensureUserDocument(result.user);
    } catch (error) {
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
            try {
                await signInWithRedirect(auth, provider);
            } catch (redirectErr) {
                authMessage.innerText = 'Google-Login Fehler: ' + redirectErr.message;
            }
        } else {
            authMessage.innerText = 'Google-Login Fehler: ' + error.message;
        }
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserData = await ensureUserDocument(user);
        authSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        updateUIForCurrentUser();
        initApp();
        await handleRSVPFromURL();
    } else {
        currentUserData = null;
        appInitialized = false;
        stopAllListeners();
        authSection.classList.remove('hidden');
        appSection.classList.add('hidden');
    }
});

function updateUIForCurrentUser() {
    if (!currentUserData) return;

    const nameEl = document.getElementById('user-display-name');
    const badgeEl = document.getElementById('header-user-badge');
    const roleBadge = document.getElementById('user-role-badge');

    if (nameEl) nameEl.innerText = currentUserData.name || 'Nutzer';
    if (badgeEl) badgeEl.innerText = currentUserData.name || 'Nutzer';

    const profileName = document.getElementById('profile-name-display');
    const profileAvatar = document.getElementById('user-profile-avatar');
    if (profileName) profileName.innerText = currentUserData.name || 'Profilbild';
    if (profileAvatar) profileAvatar.innerHTML = getAvatarMarkup(currentUserData);

    const isAdmin = currentUserData.role === 'admin';
    if (roleBadge) {
        roleBadge.innerText = isAdmin ? 'Admin' : 'User';
        roleBadge.className = isAdmin ? 'badge-admin' : 'badge-user';
    }

    const adminElements = [
        document.getElementById('admin-section'),
        document.getElementById('admin-invite-creator-card'),
        document.getElementById('blog-admin-create')
    ];

    adminElements.forEach(el => {
        if (el) {
            if (isAdmin) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    });

    renderProfileTags();
}

document.getElementById('change-email-btn').addEventListener('click', async () => {
    const newEmail = document.getElementById('new-email-input').value.trim();
    const msg = document.getElementById('email-change-msg');
    if (!newEmail) return;
    try {
        await updateEmail(auth.currentUser, newEmail);
        await updateDoc(doc(db, "users", auth.currentUser.uid), { email: newEmail });
        msg.style.color = '#10b981';
        msg.innerText = 'E-Mail erfolgreich geändert!';
    } catch (err) {
        msg.style.color = 'var(--danger)';
        msg.innerText = 'Fehler: ' + err.message;
    }
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

document.getElementById('upload-profile-image-btn')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('profile-image-file-input');
    const file = fileInput?.files?.[0];
    if (!file || !auth.currentUser) {
        alert('Bitte ein Bild auswählen.');
        return;
    }

    try {
        const result = await uploadImageToWorker(file, 'profile');
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { photoURL: result.url });
        currentUserData.photoURL = result.url;
        updateUIForCurrentUser();
        updateChatRoomsList();
        fileInput.value = '';
        alert('Profilbild erfolgreich gespeichert.');
    } catch (err) {
        alert('Fehler beim Speichern des Profilbilds: ' + err.message);
    }
});

function initApp() {
    if (appInitialized) return;
    appInitialized = true;
    if (currentUserData && currentUserData.role === 'admin') {
        initMap();
        initFlatpickr();
    }
    loadUsers();
    loadTags();
    loadTemplates();
    loadLocations();
    loadInvitations();
    loadBlogs();
}

function initMap() {
    if (map) return;
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    map = L.map('map').setView([47.5750, 8.2860], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
}

function initFlatpickr() {
    const pickerEl = document.getElementById('datetime-picker');
    if (pickerEl && !pickerEl._flatpickr) {
        flatpickr("#datetime-picker", {
            enableTime: true,
            dateFormat: "d.m.Y H:i",
            time_24hr: true,
            locale: "de",
            defaultDate: new Date()
        });
    }
}

function loadUsers() {
    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
        usersList = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (auth.currentUser && docSnap.id === auth.currentUser.uid) {
                currentUserData = data;
                updateUIForCurrentUser();
            }
            usersList.push({ id: docSnap.id, ...data });
        });
        if (currentUserData && currentUserData.role === 'admin') {
            renderUserChips();
            renderAdminUsers();
        }
        renderProfileTags();
        updateChatRoomsList();
    });
    activeUnsubscribes.push(unsub);
}

function loadTags() {
    const unsub = onSnapshot(collection(db, "tags"), (snapshot) => {
        tagsList = [];
        snapshot.forEach(docSnap => tagsList.push({ id: docSnap.id, ...docSnap.data() }));
        if (currentUserData && currentUserData.role === 'admin') {
            renderAdminTags();
            renderAdminUsers();
        }
        updateChatRoomsList();
    });
    activeUnsubscribes.push(unsub);
}

function loadTemplates() {
    const unsub = onSnapshot(collection(db, "templates"), (snapshot) => {
        templatesList = [];
        snapshot.forEach(docSnap => templatesList.push({ id: docSnap.id, ...docSnap.data() }));

        const select = document.getElementById('template-select');
        if (select) {
            select.innerHTML = '<option value="">-- Neue Nachricht / Keine Vorlage --</option>';
            templatesList.forEach(tpl => {
                const opt = document.createElement('option');
                opt.value = tpl.id;
                opt.innerText = tpl.name;
                select.appendChild(opt);
            });
        }
    });
    activeUnsubscribes.push(unsub);
}

document.getElementById('template-select')?.addEventListener('change', (e) => {
    const tplId = e.target.value;
    const tpl = templatesList.find(t => t.id === tplId);
    if (tpl) {
        document.getElementById('email-subject-input').value = tpl.subject || '';
        document.getElementById('email-message-input').value = tpl.content || '';
    }
});

document.getElementById('save-template-btn')?.addEventListener('click', async () => {
    if (!currentUserData || currentUserData.role !== 'admin') return;
    const nameInput = document.getElementById('template-name-input');
    const name = nameInput.value.trim();
    const subject = document.getElementById('email-subject-input').value;
    const content = document.getElementById('email-message-input').value;

    if (!name) {
        alert('Bitte gib einen Namen für die Vorlage ein.');
        return;
    }

    try {
        await addDoc(collection(db, "templates"), {
            name,
            subject,
            content,
            createdAt: serverTimestamp()
        });
        alert('Vorlage erfolgreich gespeichert!');
        nameInput.value = '';
    } catch (err) {
        alert('Fehler beim Speichern der Vorlage: ' + err.message);
    }
});

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getAvatarMarkup(user, fallback = 'U') {
    const photoUrl = typeof user?.photoURL === 'string' && /^https:\/\//i.test(user.photoURL) ? user.photoURL : '';
    return photoUrl
        ? `<img src="${escapeHtml(photoUrl)}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;">`
        : escapeHtml((user?.name || fallback).slice(0, 1).toUpperCase());
}

function formatBlogDateTime(type) {
    const now = new Date();
    const date = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (type === 'date') return date;
    if (type === 'time') return time;
    return `${date} ${time}`;
}

function replaceBlogTokens(value) {
    return String(value || '').replace(/\{\{\s*(date|time|datetime)\s*\}\}/gi, (_, token) => formatBlogDateTime(token.toLowerCase()));
}

function formatBlogInline(value) {
    return escapeHtml(value)
        .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi, '<img src="$2" alt="$1" loading="lazy">')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
        .replace(/_([^_\n]+)_/g, '<em>$1</em>')
        .replace(/~~(.+?)~~/g, '<del>$1</del>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

function renderMarkdownToHtml(markdownText) {
    if (!markdownText) return '';

    let html = replaceBlogTokens(markdownText)
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n');

    const tokens = html.split(/\n\n+/);
    const formatted = tokens.map(block => {
        const trimmed = block.trim();
        if (!trimmed) return '';

        if (/^#{1,6}\s/.test(trimmed)) {
            const level = trimmed.match(/^#+/)[0].length;
            const text = trimmed.replace(/^#{1,6}\s*/, '');
            return `<h${level}>${formatBlogInline(text)}</h${level}>`;
        }

        if (/^>\s?/.test(trimmed)) {
            const quote = trimmed.replace(/^>\s?/gm, '');
            return `<blockquote>${formatBlogInline(quote)}</blockquote>`;
        }

        if (/^---+$/.test(trimmed)) {
            return '<hr>';
        }

        if (/^!\[[^\]]*\]\(https?:\/\/[^\s)]+\)$/i.test(trimmed)) {
            return `<figure>${formatBlogInline(trimmed)}</figure>`;
        }

        if (/^[-*+]\s+/.test(trimmed)) {
            const items = trimmed.split(/\n(?=[-*+]\s+)/).map(item => item.replace(/^[-*+]\s+/, '')).map(item => `<li>${formatBlogInline(item)}</li>`).join('');
            return `<ul>${items}</ul>`;
        }

        if (/^\d+\.\s+/.test(trimmed)) {
            const items = trimmed.split(/\n(?=\d+\.\s+)/).map(item => item.replace(/^\d+\.\s+/, '')).map(item => `<li>${formatBlogInline(item)}</li>`).join('');
            return `<ol>${items}</ol>`;
        }

        if (/^```/.test(trimmed)) {
            return `<pre><code>${escapeHtml(trimmed.replace(/^```\w*\n?|```$/g, ''))}</code></pre>`;
        }

        return `<p>${formatBlogInline(trimmed)}</p>`;
    });

    return formatted.join('');
}

function renderBlogContent(content) {
    const normalized = String(content || '');
    if (!normalized.trim()) return '<p>Kein Inhalt vorhanden.</p>';

    const hasHtml = /<\s*(p|div|h[1-6]|ul|ol|li|strong|em|a|blockquote|img|code|pre|br)\b/i.test(normalized);

    if (hasHtml) {
        const safeHtml = normalized
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/on\w+="[^"]*"/gi, '')
            .replace(/on\w+='[^']*'/gi, '')
            .replace(/href="javascript:[^"]*"/gi, 'href="#"');
        return replaceBlogTokens(safeHtml);
    }

    return renderMarkdownToHtml(normalized);
}

function loadBlogs() {
    const unsub = onSnapshot(query(collection(db, "blogs"), orderBy("createdAt", "desc")), (snapshot) => {
        const container = document.getElementById('blog-list');
        if (!container) return;
        container.innerHTML = '';

        if (snapshot.empty) {
            container.innerHTML = '<em>Es wurden noch keine Blogbeiträge veröffentlicht.</em>';
            return;
        }

        snapshot.forEach(docSnap => {
            const blog = docSnap.data();
            const article = document.createElement('article');
            article.className = 'card';
            article.dataset.blogId = docSnap.id;
            article.style.padding = '18px';
            article.innerHTML = `
                <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:12px;">
                    <div>
                        <h4 style="margin:0 0 6px;">${escapeHtml(blog.title || 'Ohne Titel')}</h4>
                        <div style="font-size:0.75rem; color:var(--text-muted);">Von ${escapeHtml(blog.author || 'Unbekannt')} · ${blog.createdAt ? new Date(blog.createdAt.toDate()).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Datum unbekannt'}</div>
                    </div>
                    ${currentUserData && currentUserData.role === 'admin' ? `
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            <button class="small-btn btn-secondary" onclick="window.editBlog('${docSnap.id}')">Bearbeiten</button>
                            <button class="small-btn delete-btn" onclick="window.deleteBlog('${docSnap.id}')">Löschen</button>
                        </div>
                    ` : ''}
                </div>
                <div class="blog-preview" style="margin-top:0; padding:0; border:none; background:transparent;">
                    <div class="blog-content">${renderBlogContent(blog.content)}</div>
                </div>
            `;
            container.appendChild(article);
        });
    });
    activeUnsubscribes.push(unsub);
}

window.editBlog = async (blogId) => {
    if (!currentUserData || currentUserData.role !== 'admin') return;

    try {
        const docSnap = await getDoc(doc(db, 'blogs', blogId));
        if (!docSnap.exists()) return;

        const blog = docSnap.data();
        const titleInput = document.getElementById('blog-title-input');
        const contentInput = document.getElementById('blog-content-input');
        const formTitle = document.getElementById('blog-form-title');
        const cancelBtn = document.getElementById('cancel-blog-edit-btn');
        const createBtn = document.getElementById('create-blog-btn');

        titleInput.value = blog.title || '';
        contentInput.value = blog.content || '';
        document.getElementById('blog-admin-create').classList.remove('hidden');
        formTitle.innerText = 'Blogbeitrag bearbeiten';
        createBtn.innerText = 'Änderungen speichern';
        cancelBtn.classList.remove('hidden');
        cancelBtn.dataset.blogId = blogId;
        createBtn.dataset.blogId = blogId;
        updateBlogPreview();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        alert('Fehler beim Laden des Blogbeitrags: ' + err.message);
    }
};

window.deleteBlog = async (blogId) => {
    if (!currentUserData || currentUserData.role !== 'admin') return;
    if (!confirm('Diesen Blogbeitrag wirklich löschen?')) return;

    try {
        await deleteDoc(doc(db, 'blogs', blogId));
    } catch (err) {
        alert('Fehler beim Löschen des Blogbeitrags: ' + err.message);
    }
};

function resetBlogForm() {
    document.getElementById('blog-title-input').value = '';
    document.getElementById('blog-content-input').value = '';
    document.getElementById('blog-form-title').innerText = 'Neuen Blogbeitrag erstellen';
    document.getElementById('create-blog-btn').innerText = 'Beitrag veröffentlichen';
    document.getElementById('create-blog-btn').removeAttribute('data-blog-id');
    document.getElementById('cancel-blog-edit-btn').classList.add('hidden');
    document.getElementById('cancel-blog-edit-btn').removeAttribute('data-blog-id');
    updateBlogPreview();
}

function insertBlogMarkdown(type) {
    const input = document.getElementById('blog-content-input');
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = input.value.substring(start, end) || 'Text';
    const formats = {
        bold: `**${selected}**`, italic: `*${selected}*`, heading: `\n## ${selected}`,
        heading2: `\n### ${selected}`, quote: `\n> ${selected}`, list: `\n- ${selected}`,
        'ordered-list': `\n1. ${selected}`, link: `[${selected}](https://example.com)`,
        code: `\`${selected}\``, codeblock: `\n\n\`\`\`\n${selected}\n\`\`\``,
        image: `\n![Bild](${selected})\n`, separator: '\n\n---\n\n',
        date: '{{date}}', time: '{{time}}', datetime: '{{datetime}}'
    };
    input.setRangeText(formats[type] || selected, start, end, 'end');
    input.focus();
    updateBlogPreview();
}

window.insertBlogImageUrl = () => {
    const urlInput = document.getElementById('blog-image-url-input');
    const contentInput = document.getElementById('blog-content-input');
    const url = urlInput?.value.trim();
    if (!url || !contentInput) return alert('Bitte gib eine Bild-URL ein.');
    const markdown = `\n![Bild](${url})\n`;
    contentInput.setRangeText(markdown, contentInput.selectionStart, contentInput.selectionEnd, 'end');
    contentInput.focus();
    urlInput.value = '';
    updateBlogPreview();
};

window.uploadBlogImageToExternalApi = async () => {
    const fileInput = document.getElementById('blog-image-file-input');
    const contentInput = document.getElementById('blog-content-input');
    const file = fileInput?.files?.[0];
    if (!file || !contentInput) return alert('Bitte ein Bild auswählen.');
    try {
        const result = await uploadImageToWorker(file, 'blog');
        contentInput.setRangeText(`\n![Bild](${result.url})\n`, contentInput.selectionStart, contentInput.selectionEnd, 'end');
        contentInput.focus();
        fileInput.value = '';
        updateBlogPreview();
    } catch (err) {
        alert('Fehler beim Upload: ' + err.message);
    }
};

async function uploadImageToWorker(file, purpose) {
    if (IMAGE_UPLOAD_WORKER_URL.includes('YOUR_ACCOUNT')) {
        throw new Error('IMAGE_UPLOAD_WORKER_URL wurde in app.js noch nicht konfiguriert.');
    }
    if (!auth.currentUser) throw new Error('Du musst angemeldet sein.');

    const formData = new FormData();
    formData.append('image', file);
    formData.append('purpose', purpose);
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(IMAGE_UPLOAD_WORKER_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
    });
    const result = await response.json();
    if (!response.ok || !result?.url) throw new Error(result?.error || 'Bild-Upload fehlgeschlagen.');
    return result;
}

function applyBlogFormat(type) {
    insertBlogMarkdown(type);
}

function updateBlogPreview() {
    const preview = document.getElementById('blog-preview-content');
    const input = document.getElementById('blog-content-input');
    if (!preview || !input) return;
    preview.innerHTML = renderBlogContent(input.value);
}

document.querySelectorAll('.blog-toolbar-btn').forEach(button => {
    button.addEventListener('click', () => applyBlogFormat(button.dataset.format));
});

document.getElementById('blog-add-image-btn')?.addEventListener('click', window.insertBlogImageUrl);
document.getElementById('blog-upload-image-btn')?.addEventListener('click', window.uploadBlogImageToExternalApi);

document.getElementById('blog-content-input')?.addEventListener('input', updateBlogPreview);
document.getElementById('cancel-blog-edit-btn')?.addEventListener('click', resetBlogForm);

document.getElementById('create-blog-btn')?.addEventListener('click', async () => {
    if (!currentUserData || currentUserData.role !== 'admin') return;

    const titleInput = document.getElementById('blog-title-input');
    const contentInput = document.getElementById('blog-content-input');
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();

    if (!title || !content) {
        alert('Bitte Titel und Inhalt für den Blogbeitrag eingeben.');
        return;
    }

    const blogId = document.getElementById('create-blog-btn').dataset.blogId;

    try {
        if (blogId) {
            await updateDoc(doc(db, 'blogs', blogId), {
                title,
                content,
                author: currentUserData.name || auth.currentUser.email,
                updatedAt: serverTimestamp()
            });
            alert('Blogbeitrag erfolgreich aktualisiert!');
        } else {
            await addDoc(collection(db, 'blogs'), {
                title,
                content,
                author: currentUserData.name || auth.currentUser.email,
                createdAt: serverTimestamp()
            });
            alert('Blogbeitrag erfolgreich veröffentlicht!');
        }

        resetBlogForm();
    } catch (err) {
        alert('Fehler beim Speichern des Blogbeitrags: ' + err.message);
    }
});

function renderProfileTags() {
    const container = document.getElementById('user-profile-tags');
    if (!container || !currentUserData) return;
    const tags = currentUserData.tags || [];
    container.innerHTML = tags.length === 0 ? '<em>Keine</em>' : '';
    tags.forEach(t => {
        const badge = document.createElement('span');
        badge.className = 'tag-badge';
        badge.innerText = t;
        container.appendChild(badge);
    });
}

const createTagBtn = document.getElementById('create-tag-btn');
if (createTagBtn) {
    createTagBtn.onclick = async () => {
        if (!currentUserData || currentUserData.role !== 'admin') return;
        const input = document.getElementById('new-tag-name-input');
        const name = input.value.trim();
        if (!name) return;
        if (tagsList.some(t => t.name.toLowerCase() === name.toLowerCase())) {
            alert('Diesen Tag bzw. Kanal gibt es bereits.');
            return;
        }
        await addDoc(collection(db, "tags"), { name, createdAt: serverTimestamp() });
        input.value = '';
    };
}

function renderAdminTags() {
    const container = document.getElementById('admin-tags-list');
    if (!container) return;
    container.innerHTML = tagsList.length === 0 ? '<em>Keine Gruppen erstellt.</em>' : '';
    tagsList.forEach(t => {
        const div = document.createElement('div');
        div.className = 'card';
        div.style.padding = '8px 12px';
        div.style.marginBottom = '6px';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.innerHTML = `
        <span class="tag-badge">${t.name}</span>
        <button class="small-btn delete-btn" onclick="window.deleteTag('${t.id}', '${t.name}')">Gruppe löschen</button>
        `;
        container.appendChild(div);
    });
}

function renderUserChips() {
    const container = document.getElementById('user-chips');
    if (!container) return;
    container.innerHTML = '';
    usersList.forEach(u => {
        const chip = document.createElement('div');
        chip.className = `user-chip ${selectedUserEmails.has(u.email) ? 'selected' : ''}`;
        chip.innerHTML = `
        <div class="user-chip-icon">${u.name ? u.name[0].toUpperCase() : 'U'}</div>
        <div class="user-chip-info">
        <div class="user-chip-name">${u.name || 'Unbenannt'}</div>
        <div class="user-chip-email">${u.email}</div>
        </div>
        `;
        chip.onclick = () => {
            if (selectedUserEmails.has(u.email)) selectedUserEmails.delete(u.email);
            else selectedUserEmails.add(u.email);
            renderUserChips();
        };
        container.appendChild(chip);
    });
}

const selectAllBtn = document.getElementById('select-all-btn');
if (selectAllBtn) selectAllBtn.onclick = () => { usersList.forEach(u => selectedUserEmails.add(u.email)); renderUserChips(); };
const deselectAllBtn = document.getElementById('deselect-all-btn');
if (deselectAllBtn) deselectAllBtn.onclick = () => { selectedUserEmails.clear(); renderUserChips(); };

function loadLocations() {
    const unsub = onSnapshot(collection(db, "locations"), (snapshot) => {
        savedLocations = [];
        snapshot.forEach(docSnap => savedLocations.push({ id: docSnap.id, ...docSnap.data() }));

        const select = document.getElementById('location-select');
        if (select) {
            select.innerHTML = '<option value="custom">-- Eigene Karten-Pin verwenden --</option>';
            savedLocations.forEach(loc => {
                const opt = document.createElement('option');
                opt.value = loc.id;
                opt.innerText = loc.name;
                select.appendChild(opt);
            });
        }

        const managementContainer = document.getElementById('saved-locations-management-list');
        if (managementContainer) {
            managementContainer.innerHTML = savedLocations.length === 0 ? '<em>Keine gespeicherten Orte.</em>' : '';
            savedLocations.forEach(loc => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'card';
                itemDiv.style.display = 'flex';
                itemDiv.style.justifyContent = 'space-between';
                itemDiv.style.alignItems = 'center';
                itemDiv.style.padding = '10px 14px';
                itemDiv.style.marginBottom = '6px';
                itemDiv.innerHTML = `
                <div style="font-size:0.9rem; display:flex; align-items:center; gap:6px;">
                <svg class="icon" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <strong>${loc.name}</strong>
                </div>
                <button class="small-btn delete-btn" onclick="window.deleteLocation('${loc.id}')">Löschen</button>
                `;
                managementContainer.appendChild(itemDiv);
            });
        }
    });
    activeUnsubscribes.push(unsub);
}

const locationSelect = document.getElementById('location-select');
if (locationSelect) {
    locationSelect.addEventListener('change', (e) => {
        const loc = savedLocations.find(l => l.id === e.target.value);
        if (loc && map) map.setView([loc.lat, loc.lng], 16);
    });
}

const saveLocationBtn = document.getElementById('save-location-btn');
if (saveLocationBtn) {
    saveLocationBtn.addEventListener('click', async () => {
        if (!currentUserData || currentUserData.role !== 'admin') return;
        if (!map) { alert('Karte nicht bereit.'); return; }
        const name = document.getElementById('location-name-input').value.trim();
        if (!name) { alert('Bitte Ortsnamen eingeben.'); return; }
        const center = map.getCenter();
        await addDoc(collection(db, "locations"), { name, lat: center.lat, lng: center.lng });
        alert('Ort gespeichert!');
        document.getElementById('location-name-input').value = '';
    });
}

async function createNewInvitation() {
    if (!currentUserData || currentUserData.role !== 'admin') return;

    const selectedUsers = usersList.filter(u => selectedUserEmails.has(u.email));

    if (selectedUsers.length === 0) {
        alert('Bitte wähle mindestens eine Person als Empfänger aus.');
        return;
    }

    const datetime = document.getElementById('datetime-picker').value;
    const subjectTemplate = document.getElementById('email-subject-input').value;
    const messageTemplate = document.getElementById('email-message-input').value;
    const center = map ? map.getCenter() : { lat: 47.5750, lng: 8.2860 };
    const mapsUrl = `https://www.google.com/maps?q=${center.lat},${center.lng}`;

    const recipientEmails = selectedUsers.map(u => u.email);

    try {
        await addDoc(collection(db, "invitations"), {
            createdBy: auth.currentUser.email,
            recipients: recipientEmails,
            datetime,
            subject: subjectTemplate,
            details: messageTemplate,
            mapsUrl,
            createdAt: serverTimestamp()
        });

        for (const user of selectedUsers) {
            let personalizedMessage = messageTemplate
            .replace(/{{name}}/g, user.name || 'Teilnehmer')
            .replace(/{{datetime}}/g, datetime)
            .replace(/{{sender}}/g, currentUserData.name || auth.currentUser.email)
            .replace(/{{mapsUrl}}/g, mapsUrl);

            await emailjs.send("service_oxlrwkl", "template_rl8z3ur", {
                to_email: user.email,
                subject: subjectTemplate,
                message: personalizedMessage,
                from_name: currentUserData.name || 'Hütten-Admin',
                reply_to: currentUserData.email || auth.currentUser.email
            });
        }

        alert('Einladungen erfolgreich und personalisiert versendet!');
    } catch (err) {
        alert('Fehler beim Versenden: ' + (err.message || JSON.stringify(err)));
    }
}

window.updateAndResendInvitation = async (invId) => {
    if (!currentUserData || currentUserData.role !== 'admin') return;
    const selectedUsers = usersList.filter(u => selectedUserEmails.has(u.email));

    if (selectedUsers.length === 0) {
        alert('Bitte wähle mindestens eine Person als Empfänger aus.');
        return;
    }

    const datetime = document.getElementById('datetime-picker').value;
    const subjectTemplate = document.getElementById('email-subject-input').value;
    const messageTemplate = document.getElementById('email-message-input').value;
    const center = map ? map.getCenter() : { lat: 47.5750, lng: 8.2860 };
    const mapsUrl = `https://www.google.com/maps?q=${center.lat},${center.lng}`;
    const recipientEmails = selectedUsers.map(u => u.email);

    try {
        await updateDoc(doc(db, "invitations", invId), {
            recipients: recipientEmails,
            datetime,
            subject: subjectTemplate,
            details: messageTemplate,
            mapsUrl,
            updatedAt: serverTimestamp()
        });

        for (const user of selectedUsers) {
            let personalizedMessage = messageTemplate
            .replace(/{{name}}/g, user.name || 'Teilnehmer')
            .replace(/{{datetime}}/g, datetime)
            .replace(/{{sender}}/g, currentUserData.name || auth.currentUser.email)
            .replace(/{{mapsUrl}}/g, mapsUrl);

            await emailjs.send("service_oxlrwkl", "template_rl8z3ur", {
                to_email: user.email,
                subject: subjectTemplate,
                message: personalizedMessage,
                from_name: currentUserData.name || 'Hütten-Admin',
                reply_to: currentUserData.email || auth.currentUser.email
            });
        }

        resetSendButtonToCreate();
        alert('Einladung erfolgreich aktualisiert und versendet!');
    } catch (err) {
        alert('Fehler beim Senden: ' + (err.message || JSON.stringify(err)));
    }
};

const sendInviteBtn = document.getElementById('send-invite-btn');
if (sendInviteBtn) {
    sendInviteBtn.onclick = createNewInvitation;
}

function loadInvitations() {
    const unsub = onSnapshot(query(collection(db, "invitations"), orderBy("createdAt", "desc")), (snapshot) => {
        const container = document.getElementById('invitations-list');
        if (!container) return;
        container.innerHTML = '';
        invitationsCache = {};

        let count = 0;
        snapshot.forEach(docSnap => {
            const inv = docSnap.data();
            const invId = docSnap.id;
            invitationsCache[invId] = inv;

            const isAdmin = currentUserData && currentUserData.role === 'admin';
            const isRecipient = auth.currentUser && inv.recipients && inv.recipients.includes(auth.currentUser.email);

            if (isAdmin || isRecipient) {
                count++;
                const card = document.createElement('div');
                card.className = 'card invitation-card';
                card.style.cursor = 'pointer';
                card.onclick = () => window.openInvitationModal(invId);
                card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="display:flex; flex-direction:column; gap:4px;">
                <div style="font-size:0.9rem; display:flex; align-items:center; gap:6px;">
                <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <strong>Datum: ${inv.datetime || 'Kein Datum'}</strong>
                ${inv.updatedAt ? '<span class="badge-user" style="font-size:0.65rem; padding:1px 4px;">Aktualisiert</span>' : ''}
                </div>
                <div style="font-size:0.85rem; color:var(--text-muted);">Erstellt von: ${inv.createdBy} | Klick für Details</div>
                </div>
                </div>
                `;
                container.appendChild(card);
            }
        });

        if (count === 0) {
            container.innerHTML = '<em>Keine Einladungen vorhanden, in denen du eingetragen bist.</em>';
        }
    });
    activeUnsubscribes.push(unsub);
}

function getDMId(email1, email2) { return [email1, email2].sort().join("_"); }

function updateChatRoomsList() {
    const sidebarList = document.getElementById('chat-rooms-list');
    if (!sidebarList || !auth.currentUser) return;
    sidebarList.innerHTML = '';

    const globalItem = document.createElement('div');
    globalItem.className = `chat-room-item ${currentChatRoom === 'global' ? 'active' : ''}`;
    globalItem.dataset.roomId = 'global';
    globalItem.innerHTML = `
    <div class="room-avatar" style="background:var(--primary-dark); color:white;">
    <svg class="icon" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    </div>
    <div class="room-meta">
    <div class="room-name">Hütten-Hauptchat</div>
    <div class="room-sub">Öffentlicher Raum</div>
    </div>
    `;
    globalItem.onclick = () => window.switchChatRoom('global', 'Hütten-Hauptchat', 'Öffentlicher Raum für alle', '<svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>');
    sidebarList.appendChild(globalItem);

    tagsList.forEach(tag => {
        const roomId = "tag_" + tag.name;
        const userTags = currentUserData?.tags || [];
        const hasThisTag = userTags.includes(tag.name);
        const isAdmin = currentUserData?.role === 'admin';

        if (hasThisTag || isAdmin) {
            const tagItem = document.createElement('div');
            tagItem.className = `chat-room-item ${currentChatRoom === roomId ? 'active' : ''}`;
            tagItem.dataset.roomId = roomId;
            tagItem.innerHTML = `
            <div class="room-avatar" style="background:var(--primary); color:white;">
            <svg class="icon" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            </div>
            <div class="room-meta">
            <div class="room-name"># ${tag.name}</div>
            <div class="room-sub">Gruppen-Kanal</div>
            </div>
            `;
            tagItem.onclick = () => window.switchChatRoom(roomId, `# ${tag.name}`, `Exklusiver Gruppen-Kanal`, '<svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>');
            sidebarList.appendChild(tagItem);
        }
    });

    usersList.forEach(u => {
        if (u.email !== auth.currentUser.email) {
            const dmId = "dm_" + getDMId(auth.currentUser.email, u.email);
            const dmItem = document.createElement('div');
            dmItem.className = `chat-room-item ${currentChatRoom === dmId ? 'active' : ''}`;
            dmItem.dataset.roomId = dmId;
            dmItem.innerHTML = `
            <div class="room-avatar">${getAvatarMarkup(u)}</div>
            <div class="room-meta">
            <div class="room-name">${u.name || 'Unbenannt'}</div>
            <div class="room-sub">${u.email}</div>
            </div>
            `;
            dmItem.onclick = () => window.switchChatRoom(dmId, u.name || u.email, `Privater Chat`, getAvatarMarkup(u));
            sidebarList.appendChild(dmItem);
        }
    });
}

window.switchChatRoom = (roomId, title, subtitle, avatarHTML) => {
    currentChatRoom = roomId;
    document.getElementById('active-chat-title').innerText = title;
    document.getElementById('active-chat-sub').innerText = subtitle;
    document.getElementById('active-chat-avatar').innerHTML = avatarHTML || '<svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

    if (window.innerWidth < 768) {
        document.getElementById('chat-sidebar').style.display = 'none';
        document.getElementById('chat-main').style.display = 'flex';
    }

    document.querySelectorAll('.chat-room-item').forEach(el => {
        if (el.dataset.roomId === roomId) el.classList.add('active');
        else el.classList.remove('active');
    });

    const settingsBtn = document.getElementById('toggle-chat-settings-btn');
    const settingsPanel = document.getElementById('chat-settings-panel');
    settingsPanel.classList.add('hidden');

    if (roomId.startsWith('tag_')) {
        const tagName = roomId.replace('tag_', '');
        if (currentUserData && currentUserData.role === 'admin') {
            settingsBtn.classList.remove('hidden');
            setupTagSettingsPanel(tagName);
        } else {
            settingsBtn.classList.add('hidden');
        }
    } else {
        settingsBtn.classList.add('hidden');
    }

    if (activeChatUnsubscribe) activeChatUnsubscribe();

    const q = query(collection(db, `chats/${roomId}/messages`), orderBy("createdAt", "asc"));
    activeChatUnsubscribe = onSnapshot(q, (snapshot) => {
        const container = document.getElementById('chat-messages');
        container.innerHTML = snapshot.empty ? '<em>Noch keine Nachrichten in diesem Kanal.</em>' : '';
        snapshot.forEach(docSnap => {
            const msg = docSnap.data();
            const isMe = auth.currentUser && auth.currentUser.email === msg.senderEmail;
            const sender = isMe
                ? currentUserData
                : usersList.find(user => user.email === msg.senderEmail) || { name: msg.senderName || msg.senderEmail };
            const row = document.createElement('div');
            row.className = `message-row ${isMe ? 'mine' : ''}`;
            const msgDiv = document.createElement('div');
            msgDiv.className = `message-bubble ${isMe ? 'my-message' : 'other-message'}`;
            const timeStr = msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
            msgDiv.innerHTML = `
            ${!isMe ? `<div class="msg-sender">${escapeHtml(msg.senderName || msg.senderEmail)}</div>` : ''}
            <div>${escapeHtml(msg.text || '')}</div>
            <div class="msg-time">${timeStr}</div>
            `;
            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            avatar.innerHTML = getAvatarMarkup(sender);
            if (isMe) {
                row.appendChild(msgDiv);
                row.appendChild(avatar);
            } else {
                row.appendChild(avatar);
                row.appendChild(msgDiv);
            }
            container.appendChild(row);
        });
        container.scrollTop = container.scrollHeight;
    });
};

document.getElementById('toggle-chat-settings-btn').onclick = () => {
    document.getElementById('chat-settings-panel').classList.toggle('hidden');
};

function setupTagSettingsPanel(tagName) {
    if (!currentUserData || currentUserData.role !== 'admin') return;
    const content = document.getElementById('group-settings-content');
    const tagObj = tagsList.find(t => t.name === tagName);

    let membersHtml = `<div style="font-size:0.85rem; margin-bottom:12px;"><strong>Mitglieder der Gruppe "${tagName}" verwalten:</strong><div style="max-height:120px; overflow-y:auto; border:1px solid var(--border); padding:6px; border-radius:6px; background:#f8fafc; margin-top:6px;">`;
    usersList.forEach(u => {
        const hasTag = u.tags && u.tags.includes(tagName);
        membersHtml += `<label style="display:block; margin-bottom:4px; font-weight:normal; font-size:0.85rem;">
        <input type="checkbox" ${hasTag ? 'checked' : ''} onchange="window.toggleUserTag('${u.id}', '${tagName}', this.checked)"> ${u.name || u.email} (${u.email})
        </label>`;
    });
    membersHtml += '</div></div>';

    if (tagObj) {
        membersHtml += `<div style="border-top:1px solid var(--border); padding-top:8px; display:flex; justify-content:flex-end;">
        <button class="small-btn delete-btn" onclick="window.deleteTag('${tagObj.id}', '${tagName}')">Diese Gruppe / Kanal komplett löschen</button>
        </div>`;
    }

    content.innerHTML = membersHtml;
}

document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !auth.currentUser) return;
    input.value = '';
    await addDoc(collection(db, `chats/${currentChatRoom}/messages`), {
        text,
        senderEmail: auth.currentUser.email,
        senderName: currentUserData ? currentUserData.name : auth.currentUser.email,
        createdAt: serverTimestamp()
    });
}

function renderAdminUsers() {
    if (!currentUserData || currentUserData.role !== 'admin') return;
    const container = document.getElementById('admin-user-list');
    if (!container) return;
    container.innerHTML = '';
    usersList.forEach(u => {
        let tagsCheckboxes = '<div class="admin-tag-assignment" style="margin: 6px 0; font-size:0.8rem;"><strong>Gruppen zuweisen:</strong><div class="admin-tag-options">';
        tagsList.forEach(t => {
            const hasTag = u.tags && u.tags.includes(t.name);
            tagsCheckboxes += `<label class="admin-tag-option">
            <input type="checkbox" ${hasTag ? 'checked' : ''} onchange="window.toggleUserTag('${u.id}', '${t.name}', this.checked)"> ${t.name}
            </label>`;
        });
        tagsCheckboxes += '</div></div>';

        const div = document.createElement('div');
        div.className = 'card';
        div.style.padding = '10px';
        div.style.marginBottom = '8px';
        div.innerHTML = `
        <div style="font-size:0.85rem;"><strong>${u.name || 'Unbenannt'}</strong> (${u.email})<br>Rolle: ${u.role}</div>
        ${tagsCheckboxes}
        <div style="margin-top:6px; display:flex; gap:6px;">
        <button class="small-btn btn-secondary" onclick="window.toggleUserRole('${u.id}', '${u.role}')">Rolle ändern</button>
        <button class="small-btn delete-btn" onclick="window.deleteUserDoc('${u.id}')">Nutzer löschen</button>
        </div>
        `;
        container.appendChild(div);
    });
}

document.getElementById('new-chat-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('new-chat-modal');
    const userListContainer = document.getElementById('new-chat-user-list');
    const adminSection = document.getElementById('admin-create-channel-section');

    if (!modal || !userListContainer) return;

    userListContainer.innerHTML = '';

    if (currentUserData && currentUserData.role === 'admin') {
        adminSection?.classList.remove('hidden');
    } else {
        adminSection?.classList.add('hidden');
    }

    usersList.forEach(u => {
        if (u.email !== auth.currentUser.email) {
            const item = document.createElement('div');
            item.className = 'chat-room-item';
            item.style.borderRadius = 'var(--radius-sm)';
            item.style.border = '1px solid var(--border-strong)';
            item.innerHTML = `
            <div class="room-avatar">${getAvatarMarkup(u)}</div>
            <div class="room-meta">
            <div class="room-name">${u.name || 'Unbenannt'}</div>
            <div class="room-sub">${u.email}</div>
            </div>
            `;
            item.onclick = () => {
                const dmId = "dm_" + getDMId(auth.currentUser.email, u.email);
                window.switchChatRoom(dmId, u.name || u.email, 'Privater Chat', getAvatarMarkup(u));
                modal.classList.add('hidden');
            };
            userListContainer.appendChild(item);
        }
    });

    modal.classList.remove('hidden');
});

document.getElementById('modal-create-tag-btn')?.addEventListener('click', async () => {
    if (!currentUserData || currentUserData.role !== 'admin') return;
    const input = document.getElementById('modal-new-tag-input');
    const name = input.value.trim();
    if (!name) return;

    if (tagsList.some(t => t.name.toLowerCase() === name.toLowerCase())) {
        alert('Diesen Tag bzw. Kanal gibt es bereits.');
        return;
    }

    try {
        await addDoc(collection(db, "tags"), { name, createdAt: serverTimestamp() });
        input.value = '';
        document.getElementById('new-chat-modal')?.classList.add('hidden');
    } catch (err) {
        alert('Fehler beim Erstellen des Kanals: ' + err.message);
    }
});
