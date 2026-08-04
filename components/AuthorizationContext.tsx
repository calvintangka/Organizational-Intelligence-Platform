"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type AuthorizationState = { role: string | null; capabilities: string[]; loading: boolean };
const AuthorizationContext = createContext<AuthorizationState>({ role: null, capabilities: [], loading: true });

export function AuthorizationProvider({ organizationId, children }: { organizationId: string; children: ReactNode }) {
  const [state, setState] = useState<AuthorizationState>({ role: null, capabilities: [], loading: true });
  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    fetch(`/api/organizations/${encodeURIComponent(organizationId)}/authorization`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { data?: { role?: string | null; capabilities?: string[] } };
        if (!response.ok || !payload.data) throw new Error("Authorization context unavailable");
        if (!cancelled) setState({ role: payload.data.role ?? null, capabilities: payload.data.capabilities ?? [], loading: false });
      })
      .catch(() => { if (!cancelled) setState({ role: null, capabilities: [], loading: false }); });
    return () => { cancelled = true; };
  }, [organizationId]);
  return <AuthorizationContext.Provider value={state}>{children}</AuthorizationContext.Provider>;
}

export function useAuthorization() {
  const state = useContext(AuthorizationContext);
  return useMemo(() => ({ ...state, can: (capability: string) => state.capabilities.includes(capability) }), [state]);
}
