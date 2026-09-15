import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";

const FIREBASE_ISSUER = (projectId) => `https://securetoken.google.com/${projectId}`;
const FIREBASE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

function isOriginAllowed(request, env) {
    const origin = request.headers.get("Origin");
    if (!origin || origin === "null") return true;
    const allowedOrigins = (env.ALLOWED_ORIGIN || "")
        .split(",")
        .map(value => value.trim())
        .filter(Boolean);
    if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return true;
    try {
        const url = new URL(origin);
        const host = url.hostname;
        if (
            host === "localhost" ||
            host === "127.0.0.1" ||
            host === "raspberrypi" ||
            host.endsWith(".local") ||
            host.endsWith(".github.io") ||
            /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
            /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
            /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
        ) {
            return true;
        }
    } catch {}
    return false;
}

function corsHeaders(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = (origin && isOriginAllowed(request, env)) ? origin : (origin || "*");
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
    };
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
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" })
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

function notificationPreference(user, type) {
    const preferences = user.notificationPreferences || {};
    return preferences[type] !== false && preferences.emailEnabled !== false;
}

function replacePlaceholders(text, params) {
    if (typeof text !== "string") return text;
    let result = text;
    for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null) {
            result = result.replaceAll(`{{${key}}}`, String(val));
        }
    }
    return result;
}

async function sendEmail(user, title, body, env, extraParams = {}) {
    if (!env.EMAILJS_SERVICE_ID || !env.EMAILJS_TEMPLATE_ID || !env.EMAILJS_PUBLIC_KEY || !user.email) {
        console.warn("EmailJS Konfiguration oder Empfänger-E-Mail fehlt:", {
            serviceId: Boolean(env.EMAILJS_SERVICE_ID),
            templateId: Boolean(env.EMAILJS_TEMPLATE_ID),
            publicKey: Boolean(env.EMAILJS_PUBLIC_KEY),
            userEmail: user?.email
        });
        return false;
    }
    const recipientName = user.name || user.email?.split('@')[0] || "Nutzer";
    const placeholderMap = {
        name: recipientName,
        to_name: recipientName,
        to_email: user.email,
        datetime: extraParams.datetime || "",
        mapsUrl: extraParams.mapsUrl || "",
        sender: extraParams.sender || env.NOTIFICATION_FROM_NAME || "HüttenPortal",
        from_name: env.NOTIFICATION_FROM_NAME || "HüttenPortal",
        reply_to: env.NOTIFICATION_REPLY_TO || env.NOTIFICATION_FROM_EMAIL || user.email,
        ...extraParams
    };

    const personalizedSubject = replacePlaceholders(title, placeholderMap);
    const personalizedBody = replacePlaceholders(body, placeholderMap);

    const payload = {
        service_id: env.EMAILJS_SERVICE_ID,
        template_id: env.EMAILJS_TEMPLATE_ID,
        user_id: env.EMAILJS_PUBLIC_KEY,
        ...(env.EMAILJS_PRIVATE_KEY ? { accessToken: env.EMAILJS_PRIVATE_KEY } : {}),
        template_params: {
            to_email: user.email,
            to_name: recipientName,
            name: recipientName,
            subject: personalizedSubject,
            message: personalizedBody,
            datetime: extraParams.datetime || "",
            mapsUrl: extraParams.mapsUrl || "",
            sender: extraParams.sender || env.NOTIFICATION_FROM_NAME || "HüttenPortal",
            from_name: env.NOTIFICATION_FROM_NAME || "HüttenPortal",
            reply_to: env.NOTIFICATION_REPLY_TO || env.NOTIFICATION_FROM_EMAIL || user.email,
            ...extraParams
        }
    };
    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errorText = await response.text();
        console.error("EmailJS-Versand fehlgeschlagen:", response.status, errorText);
    }
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
    const senderUser = await getUserDocument(user.payload.sub, accessToken, env);
    const senderName = senderUser?.name || senderUser?.email || "Dein Hütten-Team";

    const title = String(payload.title || "HüttenPortal").slice(0, 120);
    const body = String(payload.body || "Es gibt neue Aktivitäten.").slice(0, 500);
    const result = { email: 0 };
    const recipientUids = payload.type === "test"
        ? [user.payload.sub]
        : payload.type === "invitations"
        ? [...new Set(payload.recipientUids)]
        : [...new Set(payload.recipientUids)].filter(uid => uid !== user.payload.sub);

    const extraParams = {
        datetime: payload.data?.datetime || "",
        mapsUrl: payload.data?.mapsUrl || "",
        sender: senderName,
        ...(payload.data || {})
    };

    for (const uid of recipientUids) {
        const recipient = await getUserDocument(uid, accessToken, env);
        if (!recipient) continue;
        const shouldSend = (payload.type === "invitations" || payload.type === "test") ? true : notificationPreference(recipient, payload.type);
        if (shouldSend && await sendEmail(recipient, title, body, env, extraParams)) {
            result.email++;
        }
    }
    return result;
}

function firestoreField(value) {
    if (typeof value === "string") return { stringValue: value };
    if (typeof value === "boolean") return { booleanValue: value };
    if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreField) } };
    if (value && typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreField(item)])) } };
    return { nullValue: null };
}

function firestoreFields(data) {
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, firestoreField(value)]));
}

function eventValue(value, maxLength = 1000) {
    return String(value || "").trim().slice(0, maxLength);
}

async function hashAccessKey(accessKey) {
    const bytes = new TextEncoder().encode(accessKey);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function createAccessKey() {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase().match(/.{1,6}/g).join("-");
}

function eventRequestId(document) {
    return document?.name?.split("/").pop() || "";
}

async function firestoreApi(path, options, accessToken, env) {
    const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents${path}`;
    const response = await fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "Firestore-Anfrage fehlgeschlagen");
    return data;
}

async function findEventRequest(accessKey, accessToken, env) {
    const keyHash = await hashAccessKey(eventValue(accessKey, 100));
    const result = await firestoreApi(":runQuery", {
        method: "POST",
        body: JSON.stringify({ structuredQuery: {
            from: [{ collectionId: "eventRequests" }],
            where: { fieldFilter: { field: { fieldPath: "accessKeyHash" }, op: "EQUAL", value: { stringValue: keyHash } } },
            limit: 1
        } })
    }, accessToken, env);
    const document = result.find(item => item.document)?.document;
    return document || null;
}

async function getAdminUsers(accessToken, env) {
    const result = await firestoreApi(":runQuery", {
        method: "POST",
        body: JSON.stringify({ structuredQuery: {
            from: [{ collectionId: "users" }],
            where: { fieldFilter: { field: { fieldPath: "role" }, op: "EQUAL", value: { stringValue: "admin" } } },
            limit: 100
        } })
    }, accessToken, env);
    return result.filter(item => item.document).map(item => firestoreDocument(item.document));
}

async function notifyEventAdmins(eventRequest, accessToken, env) {
    try {
        const admins = await getAdminUsers(accessToken, env);
        const subject = "Neue Event-Anfrage von {{sender}}";
        const body = "Hallo {{name}},\n\nes gibt eine neue Event-Anfrage von {{sender}} für den {{datetime}}:\n\n" + (eventRequest.details || "");
        const extraParams = {
            datetime: eventRequest.eventDate || "",
            sender: eventRequest.name || "Gast",
            name: eventRequest.name || "Gast"
        };
        for (const admin of admins) {
            if (admin.email && admin.notificationPreferences?.eventRequests !== false) {
                await sendEmail(admin, subject, body, env, extraParams);
            }
        }
    } catch (error) {
        console.warn("Admin-Benachrichtigung für Event-Anfrage fehlgeschlagen:", error);
    }
}

async function notifyEventRequester(eventRequest, subject, body, env) {
    try {
        if (eventRequest && eventRequest.email) {
            const extraParams = {
                datetime: eventRequest.eventDate || "",
                name: eventRequest.name || "Anfrager",
                sender: "Dein Hütten-Team"
            };
            await sendEmail({ email: eventRequest.email, name: eventRequest.name }, subject, body, env, extraParams);
        }
    } catch (error) {
        console.warn("E-Mail an Anfrager fehlgeschlagen:", error);
    }
}

async function getEventMessages(requestId, accessToken, env) {
    const result = await firestoreApi(`/eventRequests/${encodeURIComponent(requestId)}/messages?orderBy=createdAt&pageSize=100`, { method: "GET" }, accessToken, env);
    return (result.documents || []).map(document => ({ id: eventRequestId(document), ...firestoreDocument(document) }));
}

async function eventRequestResponse(document, accessToken, env) {
    const request = firestoreDocument(document);
    return {
        request: {
            id: eventRequestId(document),
            name: request.name,
            email: request.email,
            eventDate: request.eventDate,
            details: request.details,
            status: request.status || "neu",
            adminNote: request.adminNote || "",
            createdAt: request.createdAt
        },
        messages: await getEventMessages(eventRequestId(document), accessToken, env)
    };
}

async function createEventRequest(payload, env) {
    const name = eventValue(payload.name, 120);
    const email = eventValue(payload.email, 254);
    const eventDate = eventValue(payload.eventDate, 32);
    const details = eventValue(payload.details, 2000);
    if (!name || !email || !eventDate || !details || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Bitte fülle Name, E-Mail, Datum und Beschreibung aus.");
    const accessKey = createAccessKey();
    const id = crypto.randomUUID();
    const { token } = await getGoogleAccessToken(env);
    const document = await firestoreApi(`/eventRequests?documentId=${encodeURIComponent(id)}`, {
        method: "POST",
        body: JSON.stringify({ fields: firestoreFields({ name, email, eventDate, details, status: "neu", adminNote: "", accessKeyHash: await hashAccessKey(accessKey), createdAt: new Date().toISOString() }) })
    }, token, env);
    const response = await eventRequestResponse(document, token, env);
    await notifyEventAdmins(response.request, token, env);
    return { accessKey, ...response };
}

async function addEventMessage(requestId, sender, text, accessToken, env) {
    const cleanText = eventValue(text, 2000);
    if (!cleanText) throw new Error("Die Nachricht darf nicht leer sein.");
    await firestoreApi(`/eventRequests/${encodeURIComponent(requestId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ fields: firestoreFields({ sender, text: cleanText, createdAt: new Date().toISOString() }) })
    }, accessToken, env);
}

async function handleEventRequest(request, env) {
    const payload = await request.json();
    if (payload.action === "create") return createEventRequest(payload, env);

    if (payload.action === "guest-status" || payload.action === "guest-message") {
        const { token } = await getGoogleAccessToken(env);
        const document = await findEventRequest(payload.accessKey, token, env);
        if (!document) throw new Error("Anfrage-Schlüssel nicht gefunden.");
        if (payload.action === "guest-message") await addEventMessage(eventRequestId(document), "guest", payload.text, token, env);
        return eventRequestResponse(document, token, env);
    }

    const user = await authenticate(request, env);
    if (!(await isAdminFromFirestore(user.payload.sub, user.token, env))) throw new Error("Nur Admins haben Zugriff auf Anfragen.");
    const { token } = await getGoogleAccessToken(env);
    if (payload.action === "admin-list") {
        const result = await firestoreApi("/eventRequests?orderBy=createdAt%20desc&pageSize=100", { method: "GET" }, token, env);
        return { requests: (result.documents || []).map(document => ({ id: eventRequestId(document), ...firestoreDocument(document) })) };
    }
    const requestId = eventValue(payload.requestId, 100);
    if (!requestId) throw new Error("Anfrage fehlt.");
    const document = await firestoreApi(`/eventRequests/${encodeURIComponent(requestId)}`, { method: "GET" }, token, env);
    if (payload.action === "admin-detail") return eventRequestResponse(document, token, env);
    if (payload.action === "admin-message") {
        await addEventMessage(requestId, "admin", payload.text, token, env);
        const eventRequest = firestoreDocument(document);
        await notifyEventRequester(eventRequest, "Neue Nachricht zu deiner Event-Anfrage", `Das HüttenPortal-Team schreibt:\n\n${eventValue(payload.text, 2000)}`, env);
        return eventRequestResponse(document, token, env);
    }
    if (payload.action === "admin-delete") {
        await firestoreApi(`/eventRequests/${encodeURIComponent(requestId)}`, { method: "DELETE" }, token, env);
        return { success: true };
    }
    if (payload.action === "admin-update") {
        const status = eventValue(payload.status, 40);
        if (!new Set(["neu", "in_pruefung", "angenommen", "abgelehnt"]).has(status)) throw new Error("Ungültiger Status.");
        await firestoreApi(`/eventRequests/${encodeURIComponent(requestId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=adminNote`, {
            method: "PATCH",
            body: JSON.stringify({ fields: firestoreFields({ status, adminNote: eventValue(payload.adminNote, 2000) }) })
        }, token, env);
        const updatedDocument = await firestoreApi(`/eventRequests/${encodeURIComponent(requestId)}`, { method: "GET" }, token, env);
        const response = await eventRequestResponse(updatedDocument, token, env);
        await notifyEventRequester(response.request, "Status deiner Event-Anfrage wurde aktualisiert", `Neuer Status: ${response.request.status}${response.request.adminNote ? `\n\nNachricht vom Team:\n${response.request.adminNote}` : ""}`, env);
        return response;
    }
    throw new Error("Unbekannte Anfrage.");
}

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders(request, env) });
        }

        if (!isOriginAllowed(request, env)) {
            return json({ error: "Origin nicht erlaubt" }, 403, request, env);
        }

        const url = new URL(request.url);
        if (url.pathname === "/" && request.method === "GET") {
            return json({ status: "ok", service: "HüttenPortal Worker", upload: "/upload", notify: "/notify", eventRequest: "/event-request" }, 200, request, env);
        }
        if (!["/upload", "/notify", "/event-request"].includes(url.pathname) || request.method !== "POST") {
            return json({ error: "Not found" }, 404, request, env);
        }

        if (url.pathname === "/event-request") {
            try {
                return json(await handleEventRequest(request, env), 200, request, env);
            } catch (error) {
                return json({ error: error.message || "Anfrage konnte nicht verarbeitet werden" }, 400, request, env);
            }
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
