import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../services/settings';
import type { CompanySettings } from '../types';

interface SettingsState {
  settings: CompanySettings;
  loading: boolean;
  error: string;
  save: (s: CompanySettings) => Promise<void>;
}

const SettingsContext = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSettings()
      .then(setSettings)
      .catch((e) => setError(`自社設定の読み込みに失敗しました: ${String(e)}`))
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (s: CompanySettings) => {
    await saveSettings(s);
    setSettings(s);
  }, []);

  return <SettingsContext.Provider value={{ settings, loading, error, save }}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
