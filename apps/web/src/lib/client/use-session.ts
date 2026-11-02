"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "./api";
import { signIn } from "./wallet";

export function useSession() {
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ address: string | null }>("/api/auth/me").then((r) => setAddress(r.address)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async () => {
    setError(null);
    try {
      setAddress((await signIn()).toLowerCase());
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setAddress(null);
  }, []);

  return { address, loading, error, login, logout };
}
