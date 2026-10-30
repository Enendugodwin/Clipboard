import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { ToastProvider, useToast } from './components/Toast';
import { Home } from './pages/Home';
import { RoomPage } from './pages/RoomPage';
import { SettingsPage, AboutPage, HistoryPage } from './pages/SettingsPage';
import { useTheme } from './hooks/useTheme';
import type { ConnectionState } from './types';

function Shell() {
  const { theme, setTheme } = useTheme();
  const { push } = useToast();
  const [conn, setConn] = useState<ConnectionState>('Disconnected');
  const cycle = () => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
  return (
    <div className="min-h-screen bg-transparent text-ink dark:bg-black dark:text-white">
      <Header conn={conn} onTheme={cycle} theme={theme} />
      <main>
        <Routes>
          <Route path="/" element={<Home onToast={push} onConn={setConn} />} />
          <Route path="/c/:id" element={<RoomPage onToast={push} onConn={setConn} />} />
          <Route path="/history" element={<HistoryPage onToast={push} />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<p className="p-8 text-sm">Invalid room URL. <a href="/" className="underline">Go home</a></p>} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </BrowserRouter>
  );
}
