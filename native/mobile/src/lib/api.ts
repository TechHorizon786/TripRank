/**
 * Tiny API client for the Expo app.
 * Set EXPO_PUBLIC_API_URL in .env to your laptop's LAN IP, e.g. http://192.168.1.20:3000
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const PROFILE_KEY = "triprank.profile";

export type Profile = { id: string; username: string; country: string; car: string | null };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  base: BASE,
  post: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  get: <T,>(path: string) => request<T>(path),

  async createProfile(input: { username: string; country: string; car: string }): Promise<Profile> {
    const { user } = await api.post<{ user: Profile }>("/api/users", input);
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(user));
    return user;
  },
  async loadProfile(): Promise<Profile | null> {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  },
  async clearProfile() {
    await AsyncStorage.removeItem(PROFILE_KEY);
  },
};
