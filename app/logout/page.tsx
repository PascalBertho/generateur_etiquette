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
        fontFamily: "Inter, Segoe UI, Arial, sans-serif",
      }}
    >
      <p>Ouverture sécurisée de LABEL DS…</p>
    </main>
  );
}
