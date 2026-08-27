// Web Crypto port of the old api/src/lib/token.ts (Node's crypto.createHmac/
// timingSafeEqual aren't available on Workers). Same payload shape and TTL,
// same base64url encoding -- the frontend's token format doesn't change.

const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days - claimed profile should stay claimed

export type SessionPayload = {
	playerid: number;
	exp: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function hmacKey(secret: string) {
	return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array) {
	const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let str = '';
	for (const b of arr) str += String.fromCharCode(b);
	return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string) {
	const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
	const str = atob(padded);
	const arr = new Uint8Array(str.length);
	for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
	return arr;
}

export async function signSession(secret: string, playerid: number): Promise<string> {
	const payload: SessionPayload = { playerid, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
	const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
	const key = await hmacKey(secret);
	const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
	return `${body}.${toBase64Url(sig)}`;
}

export async function verifySession(secret: string, token: string | null | undefined): Promise<SessionPayload | null> {
	if (!token) return null;
	const [body, sig] = token.split('.');
	if (!body || !sig) return null;

	const key = await hmacKey(secret);
	const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(sig), encoder.encode(body));
	if (!valid) return null;

	try {
		const payload = JSON.parse(decoder.decode(fromBase64Url(body))) as SessionPayload;
		if (typeof payload.playerid !== 'number' || typeof payload.exp !== 'number') return null;
		if (payload.exp < Math.floor(Date.now() / 1000)) return null;
		return payload;
	} catch {
		return null;
	}
}
