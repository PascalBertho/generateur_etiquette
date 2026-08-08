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
        gridTemplateColumns: "minmax(0,1.05fr) minmax(420px,.95fr)",
        background: "#182838",
        fontFamily: "Inter, Segoe UI, Arial, sans-serif",
      }}
    >
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          minHeight: "100vh",
          padding: "56px 64px 46px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          color: "#fff",
          background:
            "radial-gradient(circle at 65% 42%, rgba(255,255,255,.055), transparent 28%), linear-gradient(135deg,#10283d 0%,#182838 48%,#0f2335 100%)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 520,
            height: 260,
            right: 25,
            top: 255,
            border: "24px solid rgba(255,255,255,.045)",
            borderRadius: 60,
            transform: "rotate(-12deg)",
          }}
        />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              marginBottom: 48,
            }}
          >
            <div
              style={{
                width: 148,
                height: 92,
                border: "6px solid white",
                borderRadius: 18,
                transform: "rotate(-7deg)",
                display: "grid",
                placeItems: "center",
                fontSize: 42,
                fontWeight: 900,
                letterSpacing: 1,
              }}
            >
              DS
            </div>

            <div>
              <div
                style={{
                  fontFamily:
                    '"Arial Narrow","Roboto Condensed","Liberation Sans Narrow",Impact,Arial,sans-serif',
                  fontSize: 46,
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: "-1px",
                }}
              >
                LABEL <span style={{ color: "#e1262b" }}>DS</span>
              </div>

              <div
                style={{
                  color: "#e2b985",
                  fontSize: 18,
                  fontWeight: 700,
                  marginTop: 7,
                }}
              >
                Exclusive by Detandt Simon SA
              </div>
            </div>
          </div>

          <h1
            style={{
              margin: 0,
              maxWidth: 620,
              fontFamily:
                '"Arial Narrow","Roboto Condensed","Liberation Sans Narrow",Impact,Arial,sans-serif',
              fontSize: 56,
              lineHeight: 1.04,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-1.4px",
            }}
          >
            Générateur
            <br />
            d&apos;étiquettes produit
          </h1>

          <div
            style={{
              width: 118,
              height: 4,
              borderRadius: 4,
              background: "#e1262b",
              margin: "32px 0 26px",
            }}
          />

          <p
            style={{
              maxWidth: 560,
              margin: 0,
              color: "#e3e9ee",
              fontSize: 18,
              lineHeight: 1.55,
            }}
          >
            Créez, préparez et imprimez vos étiquettes produits depuis une
            interface unique.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,minmax(0,1fr))",
              gap: 28,
              maxWidth: 620,
              marginTop: 52,
            }}
          >
            {[
              ["◇", "Étiquettes personnalisées"],
              ["▥", "Gestion et aperçu"],
              ["▣", "Impression optimisée"],
            ].map(([icon, label]) => (
              <div
                key={label}
                style={{
                  paddingRight: 20,
                  borderRight:
                    label === "Impression optimisée"
                      ? "0"
                      : "1px solid rgba(255,255,255,.18)",
                }}
              >
                <div
                  style={{
                    color: "#e2b985",
                    fontSize: 34,
                    lineHeight: 1,
                    marginBottom: 12,
                  }}
                >
                  {icon}
                </div>
                <div
                  style={{
                    color: "#eef3f6",
                    fontSize: 14,
                    lineHeight: 1.35,
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            alignSelf: "flex-end",
            color: "rgba(255,255,255,.72)",
            fontSize: 13,
            fontStyle: "italic",
            fontWeight: 600,
          }}
        >
          Created by PbeR
        </div>
      </section>

      <section
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "48px",
          background: "#f7f8f9",
        }}
      >
        <form
          onSubmit={submit}
          style={{
            width: "min(520px,100%)",
            background: "#fff",
            border: "1px solid #e4e9ed",
            borderRadius: 18,
            padding: "42px 42px 36px",
            boxShadow: "0 18px 50px rgba(24,40,56,.10)",
          }}
        >
          <h2
            style={{
              margin: "0 0 10px",
              color: "#111",
              fontSize: 34,
              lineHeight: 1,
              fontWeight: 900,
            }}
          >
            Bienvenue
          </h2>

          <p
            style={{
              margin: "0 0 34px",
              color: "#607284",
              fontSize: 16,
              lineHeight: 1.5,
            }}
          >
            Connectez-vous pour accéder au générateur d&apos;étiquettes.
          </p>

          <label
            htmlFor="password"
            style={{
              display: "block",
              color: "#182838",
              fontSize: 14,
              fontWeight: 800,
              marginBottom: 8,
            }}
          >
            Mot de passe
          </label>

          <div style={{ position: "relative" }}>
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#7f8e9b",
                fontSize: 18,
              }}
            >
              ⌾
            </span>

            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoFocus
              placeholder="Saisissez votre mot de passe"
              style={{
                width: "100%",
                height: 54,
                boxSizing: "border-box",
                padding: "0 50px 0 46px",
                border: "1px solid #c2cdd5",
                borderRadius: 9,
                background: "#fff",
                color: "#182838",
                outline: "none",
                fontSize: 15,
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
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                width: 34,
                height: 34,
                border: 0,
                borderRadius: 7,
                background: "#f0f3f5",
                color: "#657687",
                fontSize: 17,
                cursor: "pointer",
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
                border: "1px solid #f0b4b4",
                borderRadius: 7,
                background: "#fff4f4",
                color: "#b42318",
                fontSize: 13,
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
              height: 54,
              marginTop: 24,
              border: 0,
              borderRadius: 9,
              background: loading ? "#83929f" : "#e1262b",
              color: "#fff",
              fontSize: 15,
              fontWeight: 900,
              cursor: loading ? "wait" : "pointer",
              boxShadow: "0 6px 16px rgba(225,38,43,.20)",
            }}
          >
            {loading ? "Connexion…" : "🔒  OUVRIR LABEL DS"}
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              margin: "30px 0 20px",
              color: "#a3afb9",
            }}
          >
            <div style={{ flex: 1, height: 1, background: "#e2e7eb" }} />
            <span>🔒</span>
            <div style={{ flex: 1, height: 1, background: "#e2e7eb" }} />
          </div>

          <div
            style={{
              display: "flex",
              gap: 14,
              alignItems: "center",
              padding: 16,
              borderRadius: 10,
              background: "#f8fafb",
              border: "1px solid #e1e7eb",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                display: "grid",
                placeItems: "center",
                background: "#edf2f5",
                color: "#182838",
                fontSize: 22,
              }}
            >
              ✓
            </div>

            <div>
              <div
                style={{
                  color: "#182838",
                  fontWeight: 800,
                  fontSize: 14,
                }}
              >
                Accès sécurisé
              </div>
              <div
                style={{
                  marginTop: 3,
                  color: "#728292",
                  fontSize: 12.5,
                  lineHeight: 1.4,
                }}
              >
                Vos données sont protégées et confidentielles.
              </div>
            </div>
          </div>
        </form>
      </section>

      <style jsx global>{`
        @media (max-width: 980px) {
          main {
            grid-template-columns: 1fr !important;
          }
          main > section:first-child {
            min-height: auto !important;
            padding: 36px 28px 26px !important;
          }
          main > section:nth-child(2) {
            min-height: auto !important;
            padding: 34px 22px 50px !important;
          }
        }
      `}</style>
    </main>
  );
}
