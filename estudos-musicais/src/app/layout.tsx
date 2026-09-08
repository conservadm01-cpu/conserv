import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Estudos Musicais',
  description: 'Plataforma de estudos musicais: MSA e métodos de instrumento, com acompanhamento por comum e região.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = { themeColor: '#2f7d5b', width: 'device-width', initialScale: 1 };

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
