import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1",
});

api.interceptors.request.use((config) => {
  // 1. Intentar obtener el token desde distintas variantes
  let token =
    localStorage.getItem("token") || localStorage.getItem("accessToken");

  // 2. Si se guardó el objeto de usuario completo como JSON
  if (!token) {
    const authData =
      localStorage.getItem("auth") || localStorage.getItem("user");
    if (authData) {
      try {
        const parsed = JSON.parse(authData);
        token = parsed.token || parsed.accessToken || parsed.state?.token;
      } catch {
        // No era JSON
      }
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
