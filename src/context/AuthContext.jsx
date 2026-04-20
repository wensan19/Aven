import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase, testSupabaseConnection } from "../services/supabaseClient";
import { getMyProfile, saveProfile } from "../services/dataService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState({
    checked: false,
    ok: false,
    message: "Checking Supabase connection...",
  });

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      const message = "Supabase environment variables are missing. Please check your .env file and restart Vite.";
      setError(message);
      setConnection({ checked: true, ok: false, message });
      return undefined;
    }

    testSupabaseConnection().then((result) => {
      setConnection({ checked: true, ...result });
      if (!result.ok) setError(result.message);
    });

    supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (sessionError) throw sessionError;
        setSession(data.session);
      })
      .catch((err) => {
        setError(`Supabase connection failed: ${err.message}`);
      })
      .finally(() => {
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => listener?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    async function syncProfile() {
      if (!session?.user) {
        setProfile(null);
        return;
      }
      try {
        const current = await getMyProfile(session.user.id);
        setProfile(current);
      } catch (profileError) {
        const metadata = session.user.user_metadata || {};
        try {
          const created = await saveProfile({
            id: session.user.id,
            email: session.user.email || "",
            username: metadata.username || `aven_${session.user.id.slice(0, 8)}`,
            display_name: metadata.display_name || "Aven Friend",
          });
          setProfile(created);
        } catch (createError) {
          setError(`Profile setup failed: ${createError.message || profileError.message}`);
        }
      }
    }
    syncProfile().catch((err) => setError(err.message));
  }, [session]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user || null,
      profile,
      setProfile,
      loading,
      error,
      configured: isSupabaseConfigured,
      connection,
    }),
    [session, profile, loading, error, connection]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
