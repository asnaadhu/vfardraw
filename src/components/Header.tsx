import { useState, useEffect } from 'react';
import { Maximize2, Settings } from 'lucide-react';
import { soundEngine } from '../utils/audio';

interface HeaderProps {
  onOpenSettings: (tab?: 'setup' | 'winners' | 'rules') => void;
}

export function Header({ onOpenSettings }: HeaderProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const toggleFullscreen = () => {
    soundEngine.playClick();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <header className="relative z-30 flex items-center justify-between px-4 sm:px-8 pt-5 pb-2 bg-transparent border-none transition-all">
      {/* Center: Event Title */}
      <div className="flex-1 sm:flex-none sm:absolute sm:left-1/2 sm:-translate-x-1/2 text-center">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-white drop-shadow-sm">
          Annual Staff Lucky Draw
        </h1>
      </div>

      {/* Right Controls - Hidden in full screen mode */}
      {!isFullscreen && (
        <div className="ml-auto flex items-center gap-2 relative z-10">
          {/* Fullscreen Stage Mode */}
          <button
            id="fullscreen-toggle-btn"
            onClick={toggleFullscreen}
            title="Toggle Fullscreen Stage Mode (F)"
            aria-label="Toggle Fullscreen Stage Mode"
            className="p-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 text-slate-300 hover:text-white transition-colors flex items-center justify-center shadow-sm"
          >
            <Maximize2 className="w-4 h-4 text-slate-300" />
          </button>
        </div>
      )}

      {/* Floating Settings Button - Bottom Right Corner */}
      {!isFullscreen && (
        <button
          id="settings-modal-btn"
          onClick={() => {
            soundEngine.playClick();
            onOpenSettings('setup');
          }}
          title="Open Settings"
          aria-label="Open Settings"
          className="fixed bottom-5 right-5 z-40 p-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/30 text-white transition-all flex items-center justify-center shadow-lg shadow-indigo-600/30 hover:scale-105 active:scale-95 opacity-0"
        >
          <Settings className="w-5 h-5" />
        </button>
      )}
    </header>
  );
}
