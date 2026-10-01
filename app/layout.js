import './globals.css';

export const metadata = {
  title: 'Survivor Pool Hockey',
  description: 'Un joueur par jour. Survis ou disparais.',
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#a3262a' };

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
