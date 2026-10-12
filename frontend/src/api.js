import axios from 'axios';
import {readSession, rememberAttendanceLink, roleForPath} from './session.js';
import {configuredApiUrl,normalizeServerUrl,isNativeApp} from './server-config.js';
export {readSession} from './session.js';
export const API_URL = configuredApiUrl();
export const api = axios.create({ baseURL: API_URL, timeout: 30000 });
export function setCampusServer(value) {
 const url=normalizeServerUrl(value);
 if (url !== api.defaults.baseURL) localStorage.removeItem('gvpcew_session');
 localStorage.setItem('gvpcew_api_url',url);
 api.defaults.baseURL=url;
}
api.interceptors.request.use(config => {
  if (isNativeApp() && !api.defaults.baseURL) throw Error('Enter the campus server address before signing in.');
  const token = readSession()?.token;
  if (token && !config.headers.Authorization) config.headers.Authorization = 'Bearer ' + token;
  const role=roleForPath(window.location.pathname);
  if(role && (!config.url?.startsWith('/auth/') || config.url==='/auth/context')) config.headers['X-Portal-Role']=role;
  return config;
});
api.interceptors.response.use(response => {
  if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) throw Error('The server address did not return a campus API response. Check the campus server address.');
  return response;
}, error => {
  if (error.response?.status === 401 && !error.config?.url?.startsWith('/auth/')) {
    rememberAttendanceLink();
    localStorage.removeItem('gvpcew_session');
    window.location.replace('/index.html');
  }
  return Promise.reject(error);
});
