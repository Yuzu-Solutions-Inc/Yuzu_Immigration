import type { Metadata } from "next";

export const preferredRegion = "iad1";

export const metadata: Metadata = {
  title: "Yuzu Immigration",
  description: "Canadian immigration consultant CRM by Yuzu Solutions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
