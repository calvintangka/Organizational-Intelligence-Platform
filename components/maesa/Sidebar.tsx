"use client";

export type ActiveView = "home" | "tickets" | "cases" | "knowledge" | "dashboard" | "organization" | "settings";

interface SidebarProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  orgName: string;
  darkMode: boolean;
  accentColor: string;
}

function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(37, 99, 235, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function HomeIcon({ active, darkMode, accent }: { active: boolean; darkMode: boolean; accent: string }) {
  const color = active ? (darkMode ? "#fff" : accent) : "#667085";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.5 6.3 8 1.7l6.5 4.6v7.2a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V6.3Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M5.7 14.5V9.7h4.6v4.8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TicketIcon({ active, darkMode, accent }: { active: boolean; darkMode: boolean; accent: string }) {
  const color = active ? (darkMode ? "#fff" : accent) : "#667085";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.5" fill={active ? color : "none"} stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function KnowledgeIcon({ active, darkMode, accent }: { active: boolean; darkMode: boolean; accent: string }) {
  const color = active ? (darkMode ? "#fff" : accent) : "#667085";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m8 1.8 6.2 6.2L8 14.2 1.8 8 8 1.8Z" fill={active ? color : "none"} stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function DashboardIcon({ active, darkMode, accent }: { active: boolean; darkMode: boolean; accent: string }) {
  const color = active ? (darkMode ? "#fff" : accent) : "#667085";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="10" height="10" stroke={color} strokeWidth="1.5" />
      <rect x="6" y="6" width="4" height="4" fill={active ? color : "none"} stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

function OrgIcon({ active, darkMode, accent }: { active: boolean; darkMode: boolean; accent: string }) {
  const color = active ? (darkMode ? "#fff" : accent) : "#667085";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.8" stroke={color} strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.3" fill={active ? color : "none"} stroke={color} strokeWidth="1.3" />
    </svg>
  );
}

function CasesIcon({ active, darkMode, accent }: { active: boolean; darkMode: boolean; accent: string }) {
  const color = active ? (darkMode ? "#fff" : accent) : "#667085";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke={color} strokeWidth="1.5" />
      <path d="M5 3V1.5h6V3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2 7h12" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

function SettingsIcon({ active, darkMode, accent }: { active: boolean; darkMode: boolean; accent: string }) {
  const color = active ? (darkMode ? "#fff" : accent) : "#667085";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.4" stroke={color} strokeWidth="1.5" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const NAV_ITEMS: { id: ActiveView; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "tickets", label: "Tickets" },
  { id: "cases", label: "Cases" },
  { id: "knowledge", label: "Knowledge" },
  { id: "dashboard", label: "Dashboard" },
  { id: "organization", label: "Organization" },
  { id: "settings", label: "Settings" },
];

function NavIcon({ id, active, darkMode, accent }: { id: ActiveView; active: boolean; darkMode: boolean; accent: string }) {
  if (id === "home") return <HomeIcon active={active} darkMode={darkMode} accent={accent} />;
  if (id === "tickets") return <TicketIcon active={active} darkMode={darkMode} accent={accent} />;
  if (id === "cases") return <CasesIcon active={active} darkMode={darkMode} accent={accent} />;
  if (id === "knowledge") return <KnowledgeIcon active={active} darkMode={darkMode} accent={accent} />;
  if (id === "dashboard") return <DashboardIcon active={active} darkMode={darkMode} accent={accent} />;
  if (id === "organization") return <OrgIcon active={active} darkMode={darkMode} accent={accent} />;
  return <SettingsIcon active={active} darkMode={darkMode} accent={accent} />;
}

export function Sidebar({ activeView, onNavigate, orgName, darkMode, accentColor }: SidebarProps) {
  const accent = accentColor;
  return (
    <aside className={`m-4 flex w-[calc(100%-2rem)] flex-shrink-0 flex-col rounded-[24px] border md:m-6 md:h-[calc(100vh-48px)] md:w-[236px] ${darkMode ? "bg-[#111827] border-[#24344d]" : "bg-white border-slate-200"}`}>
      <div className="px-6 pb-4 pt-6 md:pb-7">
        <h1 className={`text-2xl font-bold leading-tight ${darkMode ? "text-white" : "text-[#111827]"}`}>{orgName}</h1>
        <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${darkMode ? "bg-[#1e3048] text-blue-200" : "bg-[#EEF4FF] text-[#2563EB]"}`}>
          Powered by OIP
        </span>
      </div>

      <nav className="flex gap-2 overflow-x-auto px-4 pb-4 md:flex-1 md:flex-col md:gap-3 md:overflow-y-auto md:px-4 md:pb-0">
        {NAV_ITEMS.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              style={
                active
                  ? { backgroundColor: hexToRgba(accent, darkMode ? 0.32 : 0.12), color: darkMode ? "#fff" : accent }
                  : undefined
              }
              className={`flex min-w-fit items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors md:w-full ${
                active
                  ? ""
                  : darkMode
                  ? "text-[#A7B1C2] hover:bg-[#1e3048] hover:text-white"
                  : "text-[#667085] hover:bg-slate-50 hover:text-[#111827]"
              }`}
            >
              <NavIcon id={item.id} active={active} darkMode={darkMode} accent={accent} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto hidden p-6 md:block">
        <p className={`text-xs font-semibold ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Learning engine</p>
        <p className={`mt-2 text-xs leading-4 ${darkMode ? "text-slate-500" : "text-slate-500"}`}>
          Trust-driven / Versioned / Provenance-first
        </p>
      </div>
    </aside>
  );
}
