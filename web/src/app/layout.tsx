import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GPT Mathematical | Format ChatGPT math into Word documents",
  description:
    "GPT Mathematical turns ChatGPT mathematical formulas, Markdown, tables, and code into polished Word documents from a local Windows app."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
