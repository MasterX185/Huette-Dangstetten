import { createRemoteJWKSet, jwtVerify } from "jose";

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
            return json({ status: "ok", service: "HüttenPortal Image Worker", upload: "/upload" }, 200, request, env);
        }
        if (url.pathname !== "/upload" || request.method !== "POST") {
            return json({ error: "Not found" }, 404, request, env);
        }

        let user;
        try {
            user = await authenticate(request, env);
        } catch {
            return json({ error: "Authentifizierung fehlgeschlagen" }, 401, request, env);
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
