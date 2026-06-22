import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'] });

export const metadata = {
  title: 'Formalités — Tableau de bord',
  description: 'Suivi DocuSign & INPI en temps réel',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className={geist.className}>{children}</body>
    </html>
  );
}
