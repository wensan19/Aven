import { requireSupabase } from "./supabaseClient";

export async function signUp({ email, password, username, displayName }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, display_name: displayName } },
  });
  if (error) throw error;
  if (data.user) {
    await upsertProfile({
      id: data.user.id,
      email,
      username,
      display_name: displayName || username,
    });
  }
  return data;
}

export async function login({ email, password }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function logout() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function upsertProfile(profile) {
  const { data, error } = await requireSupabase().from("profiles").upsert(profile).select().single();
  if (error) throw error;
  return data;
}
