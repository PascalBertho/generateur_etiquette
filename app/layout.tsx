import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Générateur d'étiquettes",
  description: "Générateur d'étiquettes produit connecté à la base articles",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
