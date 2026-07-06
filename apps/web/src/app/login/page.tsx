import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { studioAuthConfigured } from "@/lib/studio-auth";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const redirectPath = getSafeRedirectPath(redirect);
  const authConfigured = studioAuthConfigured();

  return (
    <main className="locked-studio-page">
      <section className="locked-studio-card login-card" aria-labelledby="login-title">
        <span className="brand-mark">M</span>
        <p className="eyebrow">MASI-CO TV Studio</p>
        <h1 id="login-title">Přihlášení obsluhy</h1>
        <p>
          Produkční studio je dostupné jen přihlášeným uživatelům s aktivní rolí v
          organizaci. Lokální demo a TV přehrávač tím nejsou dotčené.
        </p>

        {!authConfigured ? (
          <div className="locked-studio-next">
            <strong>Auth není nakonfigurovaný</strong>
            <span>Doplňte Supabase URL a anon key, potom půjde ověřit přihlášení.</span>
          </div>
        ) : null}

        <LoginForm authConfigured={authConfigured} redirectPath={redirectPath} />

        <Link className="button" href="/">
          Zpět na studio
        </Link>
      </section>
    </main>
  );
}

function getSafeRedirectPath(value: string | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}
