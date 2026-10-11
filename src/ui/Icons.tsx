// Every glyph renders a 1.75px stroke whatever its size.
const I = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={(1.75 * 24) / size} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export const IconStore = () => <I d="M4 9h16l-1.2 10.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8L4 9zm4 0V7a4 4 0 0 1 8 0v2" />;
export const IconMarket = () => <I d="M4 8h13l-3-3M20 16H7l3 3" />;
export const IconLibrary = () => <I d="M7 4h11a2 2 0 0 1 2 2v11M4 8h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />;
export const IconStudio = () => <I d="M12 3v12m0-12-4 4m4-4 4 4M5 15v3a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3" />;
export const IconProfile = () => <I d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20.5a7 7 0 0 1 14 0" />;
export const IconLeft = () => <I d="M15 5l-7 7 7 7" size={20} />;
export const IconRight = () => <I d="M9 5l7 7-7 7" size={20} />;
export const IconClose = () => <I d="M6 6l12 12M18 6 6 18" size={20} />;
export const IconExternal = () => <I d="M14 4h6v6m0-6-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" size={16} />;
export const IconWallet = () => <I d="M19 8V6a1 1 0 0 0-1-1H6.5a2.5 2.5 0 0 0 0 5H19a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V7.5M16 14h.5" />;
export const IconFingerprint = () => <I d="M4.5 10a8 8 0 0 1 15 0M7 12a5 5 0 0 1 10 0v1.5c0 1.8-.3 3.4-.9 4.8M12 12v2.5c0 2.2-.6 4.1-1.6 5.5M9.5 13.5c0 2.3-.5 4.1-1.4 5.3" />;
export const IconEye = () => <I d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />;
export const IconPause = () => <I d="M9 6v12M15 6v12" size={16} />;
export const IconPlay = () => <I d="M8 5.5v13l10.5-6.5L8 5.5z" size={16} />;
