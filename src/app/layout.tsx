/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Establish the product’s typography, dark field, and framing so every route feels like part of one annual-review system.
 * Guardrail: Reinforce publication-grade hierarchy and avoid generic centered-app shells.
 */
import type { Metadata } from 'next';
import { DM_Sans, JetBrains_Mono, Space_Grotesk, Syne } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const syne = Syne({ subsets: ['latin'], variable: '--font-syne', weight: ['400', '600', '700', '800'] });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', weight: ['300', '400', '500', '700'] });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', weight: ['300', '400', '500', '600', '700'] });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono', weight: ['400', '500', '700'] });

export const metadata: Metadata = {
  title: 'Wrapped for Work',
  description: 'A local high-fidelity prototype for turning work signals into a shareable wrap.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
