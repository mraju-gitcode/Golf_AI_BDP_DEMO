import {
  BarChart3,
  ClipboardCheck,
  Compass,
  FlaskConical,
  Library,
  Inbox,
  SlidersHorizontal,
} from 'lucide-react';
import type { NavSection } from '../types/golfpm';

interface SidebarProps {
  activeSection: NavSection;
  reviewCount: number;
  journeyCompletedCount?: number;
  onSelect: (section: NavSection) => void;
}

interface NavItem {
  id: NavSection;
  label: string;
  shortLabel: string;
  icon: typeof Inbox;
  badge?: number;
}

export function Sidebar({
  activeSection,
  reviewCount,
  onSelect,
}: SidebarProps) {
  const workspaceItems: NavItem[] = [
    { id: 'journey', label: 'Customer Journey', shortLabel: 'Journey', icon: Compass },
    { id: 'inbox', label: 'GolfPM Inbox', shortLabel: 'Inbox', icon: Inbox },
    {
      id: 'review',
      label: 'CSR Review',
      shortLabel: 'CSR Review',
      icon: ClipboardCheck,
      badge: reviewCount,
    },
    { id: 'knowledge', label: 'Knowledge Sources', shortLabel: 'Knowledge', icon: Library },
  ];

  const managementItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'Dashboard', icon: BarChart3 },
    {
      id: 'settings',
      label: 'Agent Settings',
      shortLabel: 'Settings',
      icon: SlidersHorizontal,
    },
    {
      id: 'testing',
      label: 'Quality & Testing',
      shortLabel: 'Testing',
      icon: FlaskConical,
    },
  ];

  const allItems = [...workspaceItems, ...managementItems];

  const renderDesktopGroup = (title: string, items: NavItem[]) => (
    <div className="mb-6">
      <div className="px-4 mb-2 text-[11px] font-display font-bold tracking-wider uppercase text-[#6F7F77] dark:text-[#86998F]">
        {title}
      </div>
      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-2 pl-3.5 pr-3 py-2.5 text-left text-[13.5px] font-semibold transition-colors cursor-pointer border-l-[3px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#018752] ${
                active
                  ? 'border-[#018752] dark:border-[#2FB06A] bg-[#E6F3ED] dark:bg-[#173326] text-[#006A40] dark:text-[#6EE09F]'
                  : 'border-transparent text-[#34453D] dark:text-[#C5D3CB] hover:bg-[#F4F6F5] dark:hover:bg-[#1D2A24]'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active
                      ? 'text-[#018752] dark:text-[#2FB06A]'
                      : 'text-[#6F7F77] dark:text-[#86998F]'
                  }`}
                />
                <span className="truncate whitespace-nowrap">{item.label}</span>
              </span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-[#018752] dark:bg-[#2FB06A] text-white dark:text-[#0F1613] text-[11px] font-display font-bold tabular-nums shrink-0">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop 220px sidebar */}
      <aside
        aria-label="Primary navigation"
        className="hidden lg:flex lg:flex-col w-[220px] shrink-0 bg-white dark:bg-[#16201B] border-r border-[#DDE4E0] dark:border-[#24342C] min-h-[calc(100vh-64px)]"
      >
        <nav className="flex-1 py-5">
          {renderDesktopGroup('Workspace', workspaceItems)}
          {renderDesktopGroup('Management', managementItems)}
        </nav>

        <div className="px-4 py-4 border-t border-[#DDE4E0] dark:border-[#24342C] text-[11px] leading-relaxed text-[#6F7F77] dark:text-[#86998F]">
          <div className="font-semibold text-[#34453D] dark:text-[#C5D3CB]">
            GolfPM Assist · demo build
          </div>
          <div>Prepared by Boston Data Pro</div>
        </div>
      </aside>

      {/* Mobile horizontal tab strip */}
      <nav
        aria-label="Primary navigation"
        className="lg:hidden bg-white dark:bg-[#16201B] border-b border-[#DDE4E0] dark:border-[#24342C] overflow-x-auto"
      >
        <div className="flex items-center min-w-max px-2">
          {allItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'border-[#018752] dark:border-[#2FB06A] text-[#006A40] dark:text-[#6EE09F] bg-[#E6F3ED]/60 dark:bg-[#173326]/60'
                    : 'border-transparent text-[#4C5C54] dark:text-[#B3C2BA]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.shortLabel}</span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-[#018752] dark:bg-[#2FB06A] text-white dark:text-[#0F1613] text-[10px] font-display font-bold tabular-nums">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
