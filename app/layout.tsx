import type {Metadata} from 'next';
import './globals.css';
import { AgentStatusBar } from './components/AgentStatusBar';

export const metadata: Metadata = {
  title: 'PURPCLAW — Autonomous Governance Bridge',
  description: 'PURPCLAW multi-agent orchestration system with real-time swarm visualization',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🧠</text></svg>',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        {children}
        <AgentStatusBar />
      </body>
    </html>
  );
}
