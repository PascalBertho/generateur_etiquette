"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Connexion refusée");
      }

      const next =
        new URLSearchParams(window.location.search).get("next") ||
        "/generateur-etiquettes/";

      router.replace(
        next.startsWith("/") ? next : "/generateur-etiquettes/"
      );
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Connexion impossible"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateRows: "1fr auto",
        background:
          "radial-gradient(circle at 50% 38%, #233d55 0%, #182838 48%, #14222f 100%)",
        color: "#182838",
        fontFamily: "Inter, Segoe UI, Arial, sans-serif",
      }}
    >
      <section
        style={{
          minHeight: "calc(100vh - 42px)",
          display: "grid",
          placeItems: "center",
          padding: "32px 20px",
        }}
      >
        <div
          style={{
            width: "min(440px, 100%)",
          }}
        >
          <div
            style={{
              textAlign: "center",
              marginBottom: 18,
              color: "white",
            }}
          >
            <img
              src="/generateur-etiquettes/Logo_DS_Label.png"
              alt="Logo DS"
              style={{
                width: 220,
                maxWidth: "72vw",
                height: 118,
                objectFit: "contain",
                display: "block",
                margin: "0 auto 6px",
                background: "#182838",
                mixBlendMode: "lighten",
              }}
            />

            <h1
              style={{
                margin: 0,
                fontFamily:
                  '"Arial Narrow","Roboto Condensed","Liberation Sans Narrow",Impact,Arial,sans-serif',
                fontSize: 34,
                lineHeight: 1,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "-0.7px",
              }}
            >
              Générateur d&apos;étiquettes
            </h1>

            <div
              style={{
                marginTop: 7,
                color: "#e2b985",
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              Exclusive by Detandt Simon SA
            </div>
          </div>

          <form
            onSubmit={submit}
            style={{
              width: "100%",
              background: "rgba(255,255,255,.98)",
              border: "1px solid rgba(255,255,255,.45)",
              borderRadius: 14,
              padding: "26px 28px 28px",
              boxShadow: "0 22px 60px rgba(0,0,0,.28)",
            }}
          >
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 19,
                  fontWeight: 900,
                  color: "#182838",
                  marginBottom: 5,
                }}
              >
                Connexion
              </div>
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: "#647588",
                }}
              >
                Saisissez le mot de passe pour accéder à LABEL DS.
              </div>
            </div>

            <label
              htmlFor="password"
              style={{
                display: "block",
                fontWeight: 800,
                fontSize: 13,
                marginBottom: 7,
                color: "#182838",
              }}
            >
              Mot de passe
            </label>

            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoFocus
                placeholder="Votre mot de passe"
                style={{
                  width: "100%",
                  height: 46,
                  padding: "0 46px 0 13px",
                  border: "1px solid #b5c2cb",
                  borderRadius: 8,
                  outline: "none",
                  background: "#fff",
                  color: "#182838",
                  fontSize: 14,
                }}
              />

              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={
                  showPassword
                    ? "Masquer le mot de passe"
                    : "Afficher le mot de passe"
                }
                title={
                  showPassword
                    ? "Masquer le mot de passe"
                    : "Afficher le mot de passe"
                }
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 32,
                  height: 32,
                  border: 0,
                  borderRadius: 6,
                  background: "transparent",
                  color: "#5f7181",
                  cursor: "pointer",
                  fontSize: 17,
                }}
              >
                {showPassword ? "◉" : "○"}
              </button>
            </div>

            {error && (
              <div
                role="alert"
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 7,
                  border: "1px solid #f2b5b5",
                  background: "#fff4f4",
                  color: "#b42318",
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                minHeight: 46,
                marginTop: 18,
                padding: "11px 16px",
                border: 0,
                borderRadius: 8,
                background: loading ? "#7a8a98" : "#e1262b",
                color: "white",
                fontWeight: 900,
                fontSize: 14,
                cursor: loading ? "wait" : "pointer",
                boxShadow: "0 4px 10px rgba(225,38,43,.22)",
              }}
            >
              {loading ? "Connexion…" : "Ouvrir LABEL DS"}
            </button>

            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: "1px solid #edf1f4",
                textAlign: "center",
                fontSize: 11.5,
                color: "#778794",
              }}
            >
              Accès sécurisé • Générateur d&apos;étiquettes produit
            </div>
          </form>
        </div>
      </section>

      <footer
        style={{
          minHeight: 42,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 16px",
          color: "rgba(255,255,255,.62)",
          fontSize: 11,
        }}
      >
        LABEL DS — Detandt Simon SA
      </footer>
    </main>
  );
}
