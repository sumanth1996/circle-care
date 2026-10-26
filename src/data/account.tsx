// Signed-in account state for the real (server-backed) experience (CC-172 – CC-178).

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, SESSION_EXPIRED_EVENT, type AppConfig, type Me } from "../lib/api";

interface AccountCtx {
  me: Me | null;
  config: AppConfig | null;
  /** False until the first /api/auth/me check finishes. */
  ready: boolean;
  /** False when this copy of the site has no API (e.g. a static preview). */
  available: boolean;
  setMe: (m: Me | null) => void;
  refresh: () => Promise<Me | null>;
  signOut: () => Promise<void>;
  /** Cache-busting key for the profile photo URL. */
  photoKey: number;
  bumpPhoto: () => void;
}

const Ctx = createContext<AccountCtx | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(true);
  const [photoKey, setPhotoKey] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ me: Me }>("/api/me");
      setMe(r.me);
      return r.me;
    } catch {
      setMe(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const c = await api<AppConfig>("/api/config");
        if (alive) setConfig(c);
        await refresh();
      } catch {
        if (alive) setAvailable(false);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, [refresh]);

  useEffect(() => {
    const onExpired = () => { setMe(null); nav("/app/login?expired=1"); };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [nav]);

  const signOut = useCallback(async () => {
    try { await api("/api/auth/signout", { method: "POST", body: {} }); } finally { setMe(null); }
  }, []);

  return (
    <Ctx.Provider value={{ me, config, ready, available, setMe, refresh, signOut, photoKey, bumpPhoto: () => setPhotoKey(Date.now()) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAccount(): AccountCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAccount must be used inside <AccountProvider>");
  return c;
}

export const ROLE_INFO = {
  elder: { label: "Elder", title: "I'm the elder", line: "The person at the center of the circle. You decide who sees what.", tone: "var(--elder)", soft: "var(--elder-soft)" },
  caregiver: { label: "Caregiver", title: "I'm a caregiver", line: "Family or professional. Shifts, doses, tasks and hand-offs.", tone: "var(--care)", soft: "var(--care-soft)" },
  guardian: { label: "Legal guardian", title: "I'm the legal guardian", line: "Oversight, approvals and payments for care.", tone: "var(--guard)", soft: "var(--guard-soft)" },
} as const;
