import type { ToneColor } from '../utils/formatters';

interface ToneBadgeProps {
  label: string;
  tone: ToneColor;
  className?: string;
}

const TONE_STYLES: Record<ToneColor, string> = {
  green:
    'bg-[#E6F3ED] text-[#006A40] border-[#BFE0D0] dark:bg-[#163626] dark:text-[#6EE09F] dark:border-[#25543C]',
  blue:
    'bg-[#E6F1FA] text-[#005B99] border-[#BDDCF2] dark:bg-[#142B3E] dark:text-[#7BC4FA] dark:border-[#214563]',
  amber:
    'bg-[#FEF6E0] text-[#946200] border-[#F6DB93] dark:bg-[#33270B] dark:text-[#F8C84A] dark:border-[#574212]',
  red:
    'bg-[#FDECEC] text-[#B42318] border-[#F7C5C2] dark:bg-[#3A1717] dark:text-[#FCA5A5] dark:border-[#5E2424]',
  grey:
    'bg-[#EFF3F1] text-[#4C5C54] border-[#D5DFDA] dark:bg-[#202C26] dark:text-[#B3C2BA] dark:border-[#304038]',
};

export function ToneBadge({ label, tone, className = '' }: ToneBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-md border whitespace-nowrap shrink-0 ${TONE_STYLES[tone]} ${className}`}
    >
      {label}
    </span>
  );
}
