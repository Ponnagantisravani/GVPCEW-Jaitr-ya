export const isNativeApp = () => Boolean(globalThis.Capacitor?.isNativePlatform?.());
export function normalizeServerUrl(value) {
 const url = new URL(value.trim());
 if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('Enter the campus server address, for example https://portal.example.edu/api.');
 const path = url.pathname.replace(/\/+$/, '');
 url.pathname = path || '/api';
 return url.href.replace(/\/$/, '');
}
export function configuredApiUrl() {
 if (!isNativeApp()) return import.meta.env.VITE_API_URL || '/api';
 return localStorage.getItem('gvpcew_api_url') || import.meta.env.VITE_NATIVE_API_URL || import.meta.env.VITE_API_URL || '';
}
