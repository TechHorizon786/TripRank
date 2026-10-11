/** Local driver profile persisted in AsyncStorage (anonymous — no accounts yet). */
import { useEffect, useState } from "react";
import { api, type Profile } from "./api";

export function useAuth() {
  const [user, setUser] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.loadProfile().then((p) => {
      setUser(p);
      setReady(true);
    });
  }, []);

  const signIn = async (input: { username: string; country: string; car: string }) =>
    setUser(await api.createProfile(input));

  const signOut = async () => {
    await api.clearProfile();
    setUser(null);
  };

  return { user, ready, signIn, signOut };
}
