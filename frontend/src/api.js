import axios from 'axios';
import {readSession, rememberAttendanceLink, roleForPath} from './session.js';
export {readSession} from './session.js';
export const API_URL = import.meta.env.VITE_API_URL || '/api';
export const api = axios.create({ baseURL: API_URL, timeout: 30000 });
api.interceptors.request.use(config => {
  const token = readSession()?.token;
  if (token && !config.headers.Authorization) config.headers.Authorization = 'Bearer ' + token;
  const role=roleForPath(window.location.pathname);
  if(role && (!config.url?.startsWith('/auth/') || config.url==='/auth/context')) config.headers['X-Portal-Role']=role;
  return config;
});
api.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && !error.config?.url?.startsWith('/auth/')) {
    rememberAttendanceLink();
    localStorage.removeItem('gvpcew_session');
    window.location.replace('/index.html');
  }
  return Promise.reject(error);
});
