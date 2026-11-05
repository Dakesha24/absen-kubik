import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import "./overrides.css";

export const metadata: Metadata = {
  title: "ABSEN-KUBIK | Absensi Kelas",
  description: "Absensi tutor, siswa, lokasi, dan dokumentasi pertemuan kelas.",
  applicationName: "ABSEN-KUBIK",
  icons: { icon: "/images/logo-kubik.jpg" },
};

export const viewport: Viewport = { themeColor: "#4f70df", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
