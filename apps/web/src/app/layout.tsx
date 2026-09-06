import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./styles.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://outscan.ru"),
  title: "OUTSCAN — мониторинг внешних киберрисков",
  description:
    "Платформа мониторинга внешних киберрисков и цифрового периметра организации.",
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: "#0b0d0f",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
