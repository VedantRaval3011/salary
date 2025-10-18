import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ExcelProvider } from '@/context/ExcelContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Excel Layout Improver',
  description: 'Improve Excel attendance layouts for better readability',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ExcelProvider>{children}</ExcelProvider>
      </body>
    </html>
  );
}
