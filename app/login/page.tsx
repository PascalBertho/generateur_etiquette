"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      const next = new URLSearchParams(window.location.search).get("next") || "/generateur-etiquettes/";
      router.replace(next.startsWith("/") ? next : "/generateur-etiquettes/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form onSubmit={submit} style={{ width: "min(420px, 100%)", background: "white", border: "1px solid #e1e8ed", borderRadius: 14, padding: 28, boxShadow: "0 12px 35px rgba(20,40,60,.12)" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Générateur d'étiquettes</h1>
        <p style={{ margin: "0 0 22px", color: "#4a5c6e" }}>Saisissez le mot de passe de l'application.</p>
        <label htmlFor="password" style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Mot de passe</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus style={{ width: "100%", padding: "11px 12px", border: "1px solid #8fa3b3", borderRadius: 7 }} />
        {error && <p role="alert" style={{ color: "#b3261e", marginBottom: 0 }}>{error}</p>}
        <button type="submit" disabled={loading} style={{ width: "100%", marginTop: 18, padding: "11px 16px", border: 0, borderRadius: 7, background: "#0f5f8c", color: "white", fontWeight: 700, cursor: "pointer" }}>
          {loading ? "Connexion…" : "Ouvrir le générateur"}
        </button>
      </form>
    </main>
  );
}
