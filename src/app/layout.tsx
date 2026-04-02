import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Auth0Provider } from "@auth0/nextjs-auth0";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lightly - Built for Designers",
  description: "Modify app design without worrying about code.",
  icons: "/logo.png",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} font-sans antialiased`}
      >
        <Auth0Provider>
          {children}
        </Auth0Provider>
      </body>
    </html>
  );
}
