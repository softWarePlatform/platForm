import React, { createContext, useContext, useMemo, useState } from "react";

export type Role = "STUDENT" | "TEACHER" | "ADMIN";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl?: string | null;
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

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      setSession(nextToken, nextUser) {
        setToken(nextToken);
        setUser(nextUser);
        if (nextToken) localStorage.setItem("token", nextToken);
        else localStorage.removeItem("token");
        if (nextUser) localStorage.setItem("user", JSON.stringify(nextUser));
        else localStorage.removeItem("user");
      },
      logout() {
        setToken(null);
        setUser(null);
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      },
    }),
    [token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
