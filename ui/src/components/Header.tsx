import { Moon, RotateCcw, Sun } from 'lucide-react';
import type { BackendStatus } from '../types/golfpm';

interface HeaderProps {
  backendStatus: BackendStatus;
  darkMode: boolean;
  resetting: boolean;
  onToggleTheme: () => void;
  onResetDemo: () => void;
  onRefreshHealth: () => void;
}

const LIGHT_LOGO_SRC = '/assets/brand/rainbird-logo.png';
const DARK_LOGO_SRC = '/assets/brand/rainbird-logo-white.png';

export function Header({
  backendStatus,
  darkMode,
  resetting,
  onToggleTheme,
  onResetDemo,
  onRefreshHealth,
}: HeaderProps) {
  const statusConfig = {
    checking: {
      dot: 'bg-[#6F7F77]',
      text: 'Checking backend…',
      shortText: 'Checking',
      surface:
        'bg-[#F4F6F5] text-[#4C5C54] border-[#DDE4E0] dark:bg-[#1E2B24] dark:text-[#B3C2BA] dark:border-[#2C3E35]',
    },
    connected_llm: {
      dot: 'bg-[#018752] dark:bg-[#2FB06A]',
      text: 'AI model connected',
      shortText: 'AI live',
      surface:
        'bg-[#E6F3ED] text-[#006A40] border-[#BFE0D0] dark:bg-[#143123] dark:text-[#6EE09F] dark:border-[#23523A]',
    },
    connected_rules: {
      dot: 'bg-[#F2A900]',
      text: 'Offline rules mode',
      shortText: 'Rules',
      surface:
        'bg-[#FEF6E0] text-[#946200] border-[#F6DB93] dark:bg-[#33270B] dark:text-[#F8C84A] dark:border-[#574212]',
    },
    unreachable: {
      dot: 'bg-[#D92D20]',
      text: 'Backend not reachable',
      shortText: 'Offline',
      surface:
        'bg-[#FDECEC] text-[#B42318] border-[#F7C5C2] dark:bg-[#3A1717] dark:text-[#FCA5A5] dark:border-[#5E2424]',
    },
  }[backendStatus];

  return (
    <header className="sticky top-0 z-30 h-16 bg-white dark:bg-[#16201B] border-b-4 border-[#018752] dark:border-[#2FB06A] px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sm:gap-4 shadow-[0_1px_2px_rgba(29,42,36,0.04)]">
      {/* Left: Rain Bird logo + divider + Product Name & Subtitle */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
        <img
          src={darkMode ? DARK_LOGO_SRC : LIGHT_LOGO_SRC}
          alt="Rain Bird"
          referrerPolicy="no-referrer"
          className={`h-[22px] sm:h-[30px] w-auto object-contain shrink-0 select-none ${
            darkMode ? 'mix-blend-screen' : ''
          }`}
        />
        <div
          aria-hidden="true"
          className="h-6 sm:h-7 w-px bg-[#DDE4E0] dark:bg-[#2B3D34] shrink-0"
        />
        <div className="min-w-0 leading-tight">
          <div className="font-display font-bold text-[14px] sm:text-[17px] tracking-tight text-[#018752] dark:text-[#2FB06A] whitespace-nowrap truncate">
            GolfPM Assist
          </div>
          <div className="text-[11px] font-medium text-[#6F7F77] dark:text-[#96A89E] whitespace-nowrap truncate hidden sm:block">
            Golf Customer Support Agent
          </div>
        </div>
      </div>

      {/* Right: Status pill, Demo pill, Theme toggle, Reset demo */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onRefreshHealth}
          title={statusConfig.text}
          className={`inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 rounded-full border text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#018752] ${statusConfig.surface}`}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${statusConfig.dot}`} />
          <span className="sm:hidden">{statusConfig.shortText}</span>
          <span className="hidden sm:inline">{statusConfig.text}</span>
        </button>

        <span className="hidden md:inline-flex items-center px-2.5 py-1 rounded-full border border-[#DDE4E0] dark:border-[#2B3D34] bg-[#F4F6F5] dark:bg-[#1D2A24] text-[#4C5C54] dark:text-[#B3C2BA] text-xs font-medium whitespace-nowrap shrink-0">
          Demo · synthetic data
        </span>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
          title={darkMode ? 'Light mode' : 'Dark mode'}
          className="inline-flex items-center gap-1.5 h-8 sm:h-9 px-2 sm:px-3 rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#1D2A24] text-[#1D2A24] dark:text-[#EAF1ED] hover:bg-[#F4F6F5] dark:hover:bg-[#24342C] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#018752]"
        >
          {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          <span className="hidden xl:inline">{darkMode ? 'Light' : 'Dark'}</span>
        </button>

        <button
          type="button"
          onClick={onResetDemo}
          disabled={resetting}
          className="inline-flex items-center gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3.5 rounded-lg bg-[#018752] hover:bg-[#006A40] dark:bg-[#018752] dark:hover:bg-[#2FB06A] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#018752]"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
          <span className="sm:hidden">{resetting ? '…' : 'Reset'}</span>
          <span className="hidden sm:inline">{resetting ? 'Resetting…' : 'Reset demo'}</span>
        </button>
      </div>
    </header>
  );
}
