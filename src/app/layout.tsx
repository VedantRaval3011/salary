import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ExcelProvider } from "@/context/ExcelContext";
import { FinalDifferenceProvider } from "@/context/FinalDifferenceContext";
import { GrandOTProvider } from "@/context/GrandOTContext";
import { PunchVerificationProvider } from "@/context/PunchVerificationContext";
import { PunchDataProvider } from "@/context/PunchDataContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Excel Layout Improver",
  description: "Improve Excel attendance layouts for better readability",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <PunchVerificationProvider>
          <PunchDataProvider>
            <ExcelProvider>
              <GrandOTProvider>
                <FinalDifferenceProvider>{children}</FinalDifferenceProvider>
              </GrandOTProvider>
            </ExcelProvider>
          </PunchDataProvider>
        </PunchVerificationProvider>
      </body>
    </html>
  );
}
