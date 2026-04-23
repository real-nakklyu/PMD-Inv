import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { ApiError, apiGet, apiSend } from "@/src/lib/api";
import { supabase } from "@/src/lib/supabase";
import type { ProfileMe } from "@/src/types/domain";

const pendingAccessRequestKey = "pmdinv.mobile.pendingAccessRequest";

type PendingAccessRequest = {
  full_name: string;
  requested_role: "viewer";
  message: string | null;
};

type SessionContextValue = {
  session: Session | null;
  profileMe: ProfileMe | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ hasSession: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<ProfileMe | null>;
  bootstrapFirstAdmin: (fullName: string) => Promise<void>;
  requestAccess: (payload: PendingAccessRequest) => Promise<void>;
  queuePendingAccessRequest: (payload: PendingAccessRequest) => Promise<void>;
  submitQueuedAccessRequest: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profileMe, setProfileMe] = useState<ProfileMe | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const nextSession = data.session;
    setSession(nextSession);
    if (!nextSession) {
      setProfileMe(null);
      return null;
    }

    try {
      const me = await apiGet<ProfileMe>("/profiles/me", { session: nextSession });
      setProfileMe(me);
      return me;
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        await supabase.auth.signOut();
        setProfileMe(null);
        return null;
      }
      throw reason;
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      if (data.session) {
        try {
          const me = await apiGet<ProfileMe>("/profiles/me", { session: data.session });
          if (!active) return;
          setProfileMe(me);
        } catch {
          if (!active) return;
          setProfileMe(null);
        }
      }
      if (active) setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession) {
        setProfileMe(null);
        setIsLoading(false);
        return;
      }
      try {
        const me = await apiGet<ProfileMe>("/profiles/me", { session: nextSession });
        if (!active) return;
        setProfileMe(me);
      } catch {
        if (!active) return;
        setProfileMe(null);
      } finally {
        if (active) setIsLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    return { hasSession: Boolean(data.session) };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfileMe(null);
  }, []);

  const bootstrapFirstAdmin = useCallback(
    async (fullName: string) => {
      await apiSend("/profiles/bootstrap-first-admin", "POST", { full_name: fullName });
      await refreshProfile();
    },
    [refreshProfile]
  );

  const requestAccess = useCallback(
    async (payload: PendingAccessRequest) => {
      await apiSend("/profiles/access-requests", "POST", payload);
      await AsyncStorage.removeItem(pendingAccessRequestKey);
      await refreshProfile();
    },
    [refreshProfile]
  );

  const queuePendingAccessRequest = useCallback(async (payload: PendingAccessRequest) => {
    await AsyncStorage.setItem(pendingAccessRequestKey, JSON.stringify(payload));
  }, []);

  const submitQueuedAccessRequest = useCallback(async () => {
    const raw = await AsyncStorage.getItem(pendingAccessRequestKey);
    if (!raw) return;

    const parsed = JSON.parse(raw) as PendingAccessRequest;
    await requestAccess(parsed);
  }, [requestAccess]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      profileMe,
      isLoading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      bootstrapFirstAdmin,
      requestAccess,
      queuePendingAccessRequest,
      submitQueuedAccessRequest,
    }),
    [bootstrapFirstAdmin, isLoading, profileMe, queuePendingAccessRequest, refreshProfile, requestAccess, session, signIn, signOut, signUp, submitQueuedAccessRequest]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside SessionProvider.");
  }
  return value;
}
