"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Unit } from "@/lib/metrics";

export type LocalProfile = { id: string; username: string; country: string; car: string | null };

const PROFILE_KEY = "triprank.profile";
const UNIT_KEY = "triprank.unit";
const EVT = "triprank:storage";

function subscribe(callback: () => void) {
  window.addEventListener(EVT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVT, callback);
    window.removeEventListener("storage", callback);
  };
}

function useStoredValue(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key) ?? "",
    () => undefined
  );
}

function parse<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(EVT));
}

export function useProfile() {
  const rawProfile = useStoredValue(PROFILE_KEY);
  const profile = parse<LocalProfile>(rawProfile);
  const ready = rawProfile !== undefined;
  const save = useCallback((p: LocalProfile | null) => write(PROFILE_KEY, p), []);
  return { profile, ready, save };
}

export function useUnit(): [Unit, (u: Unit) => void] {
  const rawUnit = useStoredValue(UNIT_KEY);
  const unit = parse<Unit>(rawUnit) ?? "kmh";
  const set = useCallback((u: Unit) => write(UNIT_KEY, u), []);
  return [unit, set];
}

export async function createProfile(input: { username: string; country: string; car: string }) {
  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create profile");
  const p: LocalProfile = {
    id: data.user.id,
    username: data.user.username,
    country: data.user.country,
    car: data.user.car,
  };
  write(PROFILE_KEY, p);
  return p;
}
