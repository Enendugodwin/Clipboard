import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
interface Toast { id: number; message: string; kind: 'info' | 'success' | 'error'; }
const Ctx = createContext<{ toasts: Toast[]; push: (message: string, kind?: Toast['kind']) => void }>({ toasts: [], push: () => {} });
let nextId = 1;
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return <Ctx.Provider value={{ toasts, push }}>
    {children}
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="rounded-lg px-4 py-2 text-sm border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black">{t.message}</div>
      ))}
    </div>
  </Ctx.Provider>;
}
export const useToast = () => useContext(Ctx);
