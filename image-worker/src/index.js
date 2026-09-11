import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";

const FIREBASE_ISSUER = (projectId) => `https://securetoken.google.com/${projectId}`;
const FIREBASE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

function corsHeaders(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigins = (env.ALLOWED_ORIGIN || "")
        .split(",")
        .map(value => value.trim())
        .filter(Boolean);
    const allowed = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || "null";
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
    };
}

function isOriginAllowed(request, env) {
    const origin = request.headers.get("Origin");
    if (!origin) return true;
    return (env.ALLOWED_ORIGIN || "")
        .split(",")
        .map(value => value.trim())
        .filter(Boolean)
        .includes(origin);
}

function json(data, status, request, env) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(request, env) }
    });
}

async function authenticate(request, env) {
    const header = request.headers.get("Authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new Error("missing-token");

    const { payload } = await jwtVerify(token, FIREBASE_KEYS, {
        issuer: FIREBASE_ISSUER(env.FIREBASE_PROJECT_ID),
        audience: env.FIREBASE_PROJECT_ID
    });
    return { payload, token };
}

async function isAdminFromFirestore(uid, token, env) {
    const documentUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
    const response = await fetch(documentUrl, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return false;

    const document = await response.json();
    return document?.fields?.role?.stringValue === "admin";
}

function firestoreValue(value) {
    if (!value) return null;
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.integerValue !== undefined) return Number(value.integerValue);
    if (value.doubleValue !== undefined) return value.doubleValue;
    if (value.arrayValue) return (value.arrayValue.values || []).map(firestoreValue);
    if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, field]) => [key, firestoreValue(field)]));
    return null;
}

function firestoreDocument(document) {
    return Object.fromEntries(Object.entries(document?.fields || {}).map(([key, value]) => [key, firestoreValue(value)]));
}

async function getGoogleAccessToken(env) {
    if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON fehlt");
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const privateKey = await importPKCS8(serviceAccount.private_key, "RS256");
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging" })
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setIssuer(serviceAccount.client_email)
        .setAudience("https://oauth2.googleapis.com/token")
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
    });
    const result = await response.json();
    if (!response.ok || !result.access_token) throw new Error("Google-Zugriffstoken konnte nicht erstellt werden");
    return { token: result.access_token, serviceAccount };
}

async function getUserDocument(uid, accessToken, env) {
    const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return null;
    return firestoreDocument(await response.json());
}

function notificationPreference(user, type, channel) {
    const preferences = user.notificationPreferences || {};
    return preferences[type] !== false && preferences[`${channel}Enabled`] !== false;
}

async function sendPush(user, title, body, data, accessToken, env) {
    const tokens = Array.isArray(user.fcmTokens) ? user.fcmTokens : [];
    if (!tokens.length) return false;
    const url = `https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`;
    for (const token of tokens) {
        await fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ message: { token, notification: { title, body }, data: Object.fromEntries(Object.entries(data || {}).map(([key, value]) => [key, String(value)])) } })
        });
    }
    return true;
}

async function sendEmail(user, title, body, env) {
    if (!env.EMAILJS_SERVICE_ID || !env.EMAILJS_TEMPLATE_ID || !env.EMAILJS_PUBLIC_KEY || !user.email) return false;
    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            service_id: env.EMAILJS_SERVICE_ID,
            template_id: env.EMAILJS_TEMPLATE_ID,
            user_id: env.EMAILJS_PUBLIC_KEY,
            template_params: {
                to_email: user.email,
                subject: title,
                message: body,
                from_name: env.NOTIFICATION_FROM_NAME || "HüttenPortal",
                reply_to: env.NOTIFICATION_REPLY_TO || env.NOTIFICATION_FROM_EMAIL || user.email
            }
        })
    });
    return response.ok;
}

async function sendNotifications(request, env, user) {
    let payload;
    try {
        payload = await request.json();
    } catch {
        throw new Error("Ungültige Benachrichtigungsdaten");
    }
    const allowedTypes = new Set(["blog", "chat", "invitations", "test"]);
    if (!allowedTypes.has(payload.type) || !Array.isArray(payload.recipientUids) || payload.recipientUids.length > 100) {
        throw new Error("Ungültige Benachrichtigungsdaten");
    }
    if ((payload.type === "blog" || payload.type === "invitations") && !(await isAdminFromFirestore(user.payload.sub, user.token, env))) {
        throw new Error("Nur Admins dürfen diese Benachrichtigungen auslösen");
    }

    const { token: accessToken } = await getGoogleAccessToken(env);
    const title = String(payload.title || "HüttenPortal").slice(0, 120);
    const body = String(payload.body || "Es gibt neue Aktivitäten.").slice(0, 500);
    const result = { push: 0, email: 0 };
    const recipientUids = payload.type === "test"
        ? [user.payload.sub]
        : [...new Set(payload.recipientUids)].filter(uid => uid !== user.payload.sub);
    for (const uid of recipientUids) {
        const recipient = await getUserDocument(uid, accessToken, env);
        if (!recipient) continue;
        if (notificationPreference(recipient, payload.type, "push") && await sendPush(recipient, title, body, payload.data, accessToken, env)) result.push++;
        if (notificationPreference(recipient, payload.type, "email") && await sendEmail(recipient, title, body, env)) result.email++;
    }
    return result;
}

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            if (!isOriginAllowed(request, env)) {
                return new Response("Origin not allowed", { status: 403 });
            }
            return new Response(null, { status: 204, headers: corsHeaders(request, env) });
        }

        if (!isOriginAllowed(request, env)) {
            return json({ error: "Origin nicht erlaubt" }, 403, request, env);
        }

        const url = new URL(request.url);
        if (url.pathname === "/" && request.method === "GET") {
            return json({ status: "ok", service: "HüttenPortal Worker", upload: "/upload", notify: "/notify" }, 200, request, env);
        }
        if (url.pathname !== "/upload" && url.pathname !== "/notify" || request.method !== "POST") {
            return json({ error: "Not found" }, 404, request, env);
        }

        let user;
        try {
            user = await authenticate(request, env);
        } catch {
            return json({ error: "Authentifizierung fehlgeschlagen" }, 401, request, env);
        }

        if (url.pathname === "/notify") {
            try {
                return json(await sendNotifications(request, env, user), 200, request, env);
            } catch (error) {
                return json({ error: error.message || "Benachrichtigungen konnten nicht versendet werden" }, 400, request, env);
            }
        }

        const formData = await request.formData();
        const image = formData.get("image");
        const purpose = formData.get("purpose");

        if (!(image instanceof File) || !image.type.startsWith("image/")) {
            return json({ error: "Es muss eine Bilddatei hochgeladen werden" }, 400, request, env);
        }
        if (image.size > 10 * 1024 * 1024) {
            return json({ error: "Das Bild darf höchstens 10 MB groß sein" }, 413, request, env);
        }
        if (purpose === "blog" && !(await isAdminFromFirestore(user.payload.sub, user.token, env))) {
            return json({ error: "Nur Admins dürfen Blogbilder hochladen" }, 403, request, env);
        }
        if (!env.IMGBB_API_KEY) {
            return json({ error: "IMGBB_API_KEY ist im Worker nicht konfiguriert" }, 500, request, env);
        }

        const upload = new FormData();
        upload.append("key", env.IMGBB_API_KEY);
        upload.append("image", image, image.name || "upload-image");

        const response = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: upload });
        const result = await response.json();
        if (!response.ok || !result?.data?.url) {
            return json({ error: result?.error?.message || "ImgBB-Upload fehlgeschlagen" }, 502, request, env);
        }

        return json({ url: result.data.url, display_url: result.data.display_url || result.data.url }, 200, request, env);
    }
};
