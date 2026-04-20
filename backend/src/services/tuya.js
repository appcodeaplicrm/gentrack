import { createHmac, createHash, randomUUID } from 'node:crypto';

const ACCESS_ID     = process.env.TUYA_ACCESS_ID;
const ACCESS_SECRET = process.env.TUYA_ACCESS_SECRET;
const BASE_URL      = process.env.TUYA_BASE_URL


function hmacSHA256(str, secret) {
    return createHmac('sha256', secret)
        .update(str)
        .digest('hex')
        .toUpperCase();
}

function buildHeaders(accessToken = null, method = 'GET', path = '', body = '') {
    const t     = Date.now().toString();
    const nonce = randomUUID().replace(/-/g, '');

    const contentHash = createHash('sha256')
        .update(body)
        .digest('hex');

    const stringToSign = [method, contentHash, '', path].join('\n');

    const strToSign = accessToken
        ? ACCESS_ID + accessToken + t + nonce + stringToSign
        : ACCESS_ID + t + nonce + stringToSign;

    const sign = hmacSHA256(strToSign, ACCESS_SECRET);

    const headers = {
        'client_id':    ACCESS_ID,
        'sign':         sign,
        'sign_method':  'HMAC-SHA256',
        't':            t,
        'nonce':        nonce,
        'Content-Type': 'application/json',
    };

    if (accessToken) headers['access_token'] = accessToken;
    return headers;
}

// El token de Tuya dura 2h, así que lo cacheamos en memoria para no pedir uno nuevo en cada llamada

let cachedToken    = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
    // Si aún es válido, reutilizarlo
    if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

    const path    = '/v1.0/token?grant_type=1';
    const headers = buildHeaders(null, 'GET', path);

    const res  = await fetch(`${BASE_URL}${path}`, { headers });
    const data = await res.json();

    if (!data.success) throw new Error(`Tuya token error: ${data.msg}`);

    cachedToken    = data.result.access_token;
    // expire_time viene en segundos, dejamos 5 min de margen
    tokenExpiresAt = Date.now() + (data.result.expire_time - 300) * 1000;

    return cachedToken;
}

// ── CONTROL DE DISPOSITIVO ───────────────────────────────────────────────────

async function controlDevice(deviceId, commands) {
    const token = await getAccessToken();
    const path  = `/v1.0/devices/${deviceId}/commands`;
    const body  = JSON.stringify({ commands });
    const headers = buildHeaders(token, 'POST', path, body);

    const res  = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body });
    const data = await res.json();

    if (!data.success) throw new Error(`Tuya control error: ${data.msg}`);
    return data;
}


/**
 * Enciende el breaker del generador.
 * switch_1: true  → breaker ON  → generador APAGADO 
 * switch_1: false → breaker OFF → generador ENCENDIDO
 * 
 */

export async function tuyaEncenderGenerador(tuyaDeviceId) {
    return controlDevice(tuyaDeviceId, [{ code: 'switch_1', value: false }]);
}

export async function tuyaApagarGenerador(tuyaDeviceId) {
    return controlDevice(tuyaDeviceId, [{ code: 'switch_1', value: true }]);
}