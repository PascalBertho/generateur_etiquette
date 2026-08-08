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
        color: "white",
        fontFamily: "Inter, Segoe UI, Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          textAlign: "center",
        }}
      >
        <img
          src="/generateur-etiquettes/Logo_DS_Label.png"
          alt="Logo DS"
          style={{
            width: 205,
            height: 108,
            objectFit: "contain",
            display: "block",
            margin: "0 auto 10px",
            background: "#182838",
            mixBlendMode: "lighten",
          }}
        />

        <div
          style={{
            background: "rgba(255,255,255,.98)",
            color: "#182838",
            borderRadius: 14,
            padding: "24px 26px",
            boxShadow: "0 22px 60px rgba(0,0,0,.28)",
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              margin: "0 auto 14px",
              display: "grid",
              placeItems: "center",
              background: "#eef2f5",
              fontSize: 22,
              fontWeight: 900,
            }}
          >
            ✓
          </div>

          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              marginBottom: 7,
            }}
          >
            Déconnexion sécurisée
          </div>

          <div
            style={{
              fontSize: 13,
              lineHeight: 1.45,
              color: "#647588",
            }}
          >
            Fermeture de votre session LABEL DS…
          </div>
        </div>
      </div>
    </main>
  );
}
