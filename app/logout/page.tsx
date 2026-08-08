"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function logout() {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
        });
      } catch {
        // Même si la déconnexion API échoue, on renvoie vers la connexion.
      } finally {
        if (active) {
          router.replace("/login?next=/generateur-etiquettes/");
          router.refresh();
        }
      }
    }

    void logout();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(circle at 50% 38%, #233d55 0%, #182838 48%, #14222f 100%)",
        color: "#fff",
        fontFamily: "Inter, Segoe UI, Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "min(430px,100%)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            marginBottom: 22,
            fontFamily:
              '"Arial Narrow","Roboto Condensed","Liberation Sans Narrow",Impact,Arial,sans-serif',
            fontSize: 36,
            fontWeight: 900,
            letterSpacing: "-.5px",
          }}
        >
          LABEL <span style={{ color: "#e1262b" }}>DS</span>
        </div>

        <div
          style={{
            background: "#fff",
            color: "#182838",
            borderRadius: 16,
            padding: "30px 28px",
            boxShadow: "0 22px 60px rgba(0,0,0,.28)",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              margin: "0 auto 16px",
              display: "grid",
              placeItems: "center",
              background: "#edf2f5",
              color: "#182838",
              fontSize: 23,
              fontWeight: 900,
            }}
          >
            ✓
          </div>

          <div
            style={{
              fontSize: 20,
              fontWeight: 900,
              color: "#111",
              marginBottom: 8,
            }}
          >
            Déconnexion sécurisée
          </div>

          <div
            style={{
              color: "#657687",
              fontSize: 13.5,
              lineHeight: 1.5,
            }}
          >
            Fermeture de votre session LABEL DS…
          </div>

          <div
            style={{
              marginTop: 18,
              height: 4,
              borderRadius: 4,
              overflow: "hidden",
              background: "#edf1f4",
            }}
          >
            <div
              style={{
                width: "72%",
                height: "100%",
                background: "#e1262b",
              }}
            />
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            color: "rgba(255,255,255,.62)",
            fontSize: 12,
          }}
        >
          Redirection vers la page de connexion…
        </div>
      </div>
    </main>
  );
}
