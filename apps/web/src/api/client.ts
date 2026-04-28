import axios from "axios";

const defaultApiBase =
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? `http://${window.location.hostname}:3000`
    : "http://localhost:3000";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || defaultApiBase,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("role");
      localStorage.removeItem("email");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
