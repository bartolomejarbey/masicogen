"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type LoginFormProps = {
  authConfigured: boolean;
  redirectPath: string;
};

export function LoginForm({ authConfigured, redirectPath }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!authConfigured) {
      setError("Produkční Supabase Auth není nakonfigurovaný.");
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (loginError) {
        setError(loginError.message);
        return;
      }

      window.location.assign(redirectPath);
    } catch (loginFailure) {
      setError(loginFailure instanceof Error ? loginFailure.message : "Přihlášení se nepodařilo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submitLogin}>
      <label htmlFor="email">E-mail</label>
      <input
        autoComplete="email"
        disabled={!authConfigured || isSubmitting}
        id="email"
        onChange={(event) => setEmail(event.target.value)}
        required
        type="email"
        value={email}
      />

      <label htmlFor="password">Heslo</label>
      <input
        autoComplete="current-password"
        disabled={!authConfigured || isSubmitting}
        id="password"
        onChange={(event) => setPassword(event.target.value)}
        required
        type="password"
        value={password}
      />

      {error ? <p className="login-error">{error}</p> : null}

      <button className="button primary" disabled={!authConfigured || isSubmitting} type="submit">
        <LogIn size={18} aria-hidden="true" />
        {isSubmitting ? "Přihlašuji..." : "Přihlásit se"}
      </button>
    </form>
  );
}
