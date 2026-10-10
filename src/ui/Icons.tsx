const I = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export const IconStore = () => <I d="M4 9h16l-1.2 10.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8L4 9zm4 0V7a4 4 0 0 1 8 0v2" />;
export const IconMarket = () => <I d="M4 8h13l-3-3M20 16H7l3 3" />;
export const IconLibrary = () => <I d="M7 4h11a2 2 0 0 1 2 2v11M4 8h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />;
export const IconStudio = () => <I d="M12 3v12m0-12-4 4m4-4 4 4M5 15v3a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3" />;
export const IconProfile = () => <I d="M12 3l7 7-7 11-7-11 7-7zm-7 7h14" />;
export const IconLeft = () => <I d="M15 5l-7 7 7 7" size={20} />;
export const IconRight = () => <I d="M9 5l7 7-7 7" size={20} />;
export const IconClose = () => <I d="M6 6l12 12M18 6 6 18" size={20} />;
export const IconCheck = () => <I d="M5 12.5l4.5 4.5L19 7.5" size={18} />;
export const IconExternal = () => <I d="M14 4h6v6m0-6-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" size={16} />;
