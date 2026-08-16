import { Inter, Nunito, Plus_Jakarta_Sans } from "next/font/google";

export const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const nunito = Nunito({
  variable: "--font-logo",
  subsets: ["latin"],
  weight: ["700", "800"],
});

export const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const fontClassName = `${plusJakarta.variable} ${nunito.variable} ${inter.variable}`;
