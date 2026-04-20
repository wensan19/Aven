import { useState } from "react";
import { login, signUp } from "../services/authService";

export function AuthPage({ configured, connection, authError }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", username: "", displayName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "login") await login(form);
      else await signUp(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <p className="eyebrow">Welcome to Aven</p>
        <h1>Pastel blue finance tracking with a private social layer.</h1>
        <div className={connection?.ok ? "success" : "alert"}>
          {connection?.message || "Checking Supabase connection..."}
        </div>
        {!configured && <div className="alert">Supabase environment variables are missing. Please check your .env file and restart Vite.</div>}
        {authError && configured && !connection?.ok && <div className="alert">{authError}</div>}
        <form onSubmit={submit} className="form-grid single">
          {mode === "signup" && (
            <>
              <label>
                Username
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
              </label>
              <label>
                Display name
                <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
              </label>
            </>
          )}
          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label>
            Password
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
          </label>
          {error && <div className="alert">{error}</div>}
          <button className="primary-action" disabled={loading || !configured}>
            {loading ? "Please wait..." : mode === "login" ? "Log In" : "Create Account"}
          </button>
        </form>
        <button className="ghost-button full" type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
        </button>
      </section>
    </main>
  );
}
