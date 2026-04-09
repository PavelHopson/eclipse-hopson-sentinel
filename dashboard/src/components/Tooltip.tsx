import type { ReactNode } from 'react';

interface TooltipProps {
  text: string;
  show: boolean;
  children: ReactNode;
}

export function Tooltip({ text, show, children }: TooltipProps) {
  if (!show) return <>{children}</>;
  return (
    <div className="relative group">
      {children}
      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 pointer-events-none">
        <div className="bg-accent/10 border border-accent/20 text-accent text-[11px] px-3 py-2 rounded-lg whitespace-nowrap backdrop-blur-sm shadow-lg max-w-[220px]">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-accent/10 border-l border-b border-accent/20 rotate-45" />
          {text}
        </div>
      </div>
    </div>
  );
}
