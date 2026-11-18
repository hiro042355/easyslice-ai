import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXCUT AI",
  description: "AI動画切り抜きプラットフォーム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
