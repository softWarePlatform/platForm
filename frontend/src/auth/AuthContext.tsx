import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../api/client";

export type Role = "STUDENT" | "TEACHER" | "ADMIN";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl?: string | null;
  signature?: string | null;
  emailVerified?: boolean;
};

type AuthState = {
  user: User | null;
  token: string | null;
  setSession: (token: string | null, user: User | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

function readStored(): { token: string | null; user: User | null } {
  const token = localStorage.getItem("token");
  const raw = localStorage.getItem("user");
  if (!token || !raw) return { token: null, user: null };
  try {
    return { token, user: JSON.parse(raw) as User };
  } catch {
    return { token: null, user: null };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initial = readStored();
  const [token, setToken] = useState<string | null>(initial.token);
  const [user, setUser] = useState<User | null>(initial.user);
  const profileFetchGen = useRef(0);

  const setSession = useCallback((nextToken: string | null, nextUser: User | null) => {
    profileFetchGen.current += 1;
    setToken(nextToken);
    setUser(nextUser);
    if (nextToken) localStorage.setItem("token", nextToken);
    else localStorage.removeItem("token");
    if (nextUser) localStorage.setItem("user", JSON.stringify(nextUser));
    else localStorage.removeItem("user");
  }, []);

  const logout = useCallback(() => {
    profileFetchGen.current += 1;
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }, []);

  useEffect(() => {
    if (!token) return;
    const gen = profileFetchGen.current + 1;
    profileFetchGen.current = gen;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<{ user: User }>("/auth/me");
        if (cancelled || profileFetchGen.current !== gen) return;
        if (data.user) {
          setUser(data.user);
          localStorage.setItem("user", JSON.stringify(data.user));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      setSession,
      logout,
    }),
    [user, token, setSession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
