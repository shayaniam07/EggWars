/*
 * ============================================================================
 *  EGG WARS — Free Fire × Shell Shockers inspired arcade shooter
 *  (Next.js App Router + Drizzle/PostgreSQL + three.js)
 *
 *  ADMIN PANEL ACCESS  →  /admin
 *    email    : admin@eggwars.gg
 *    password : EggWars#Admin2026
 *
 *  Override before first boot with the ADMIN_EMAIL / ADMIN_PASSWORD env vars.
 *  Change the password from the admin panel after the first sign-in and keep
 *  these credentials private — they are only noted here for the project owner.
 * ============================================================================
 */
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const GAME_NAME = process.env.NEXT_PUBLIC_GAME_NAME || "EGG WARS";

export const metadata: Metadata = {
  title: `${GAME_NAME} — Egg Soldier Arena Shooter`,
  description:
    "EGG WARS is an original third-person arcade shooter with egg soldiers, offline NPC battles and server-authoritative multiplayer.",
  manifest: "/manifest.webmanifest",
  applicationName: GAME_NAME,
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: GAME_NAME },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#060a12",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="ew-scroll bg-[#060a12] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
