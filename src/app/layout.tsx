import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LinkUp — decide where to eat, together",
  description: "Create a room, invite friends, swipe on nearby restaurants, and match on dinner.",
  appleWebApp: { capable: true, title: "LinkUp", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#1c0f33",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="glow-bg min-h-dvh">
          <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">{children}</div>
        </div>
      </body>
    </html>
  );
}
