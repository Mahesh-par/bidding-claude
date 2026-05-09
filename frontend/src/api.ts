import axios from 'axios';

const API_BASE = 'http://172.168.19.55:4747';

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const user = localStorage.getItem('user');
  if (user) {
    const { token } = JSON.parse(user);
    config.headers.Authorization = token;
  }
  return config;
});

export default api;
