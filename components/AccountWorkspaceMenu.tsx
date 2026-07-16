"use client";

import { useEffect, useRef, useState } from "react";
import type { OrganizationProfile } from "@/types";

interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface AccountWorkspaceMenuProps {
  user: AuthUser;
  currentOrganization: OrganizationProfile | null;
  organizations: OrganizationProfile[];
  darkMode: boolean;
  accentColor: string;
  onSelectOrganization: (id: string) => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
}

function userInitials(user: AuthUser): string {
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || user.email.slice(0, 2).toUpperCase();
}

export function AccountWorkspaceMenu({
  user,
  currentOrganization,
  organizations,
  darkMode,
  accentColor,
  onSelectOrganization,
  onSignOut,
}: AccountWorkspaceMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const panel = darkMode ? "border-[#2d3f52] bg-[#111827] text-white" : "border-slate-200 bg-white text-[#111827]";
  const muted = darkMode ? "text-slate-400" : "text-slate-500";
  const item = darkMode ? "hover:bg-[#1e3048]" : "hover:bg-slate-50";

  function selectOrganization(id: string) {
    setOpen(false);
    void onSelectOrganization(id);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${user.name} account and workspace menu`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-2xl text-xs font-bold text-white shadow-sm ring-offset-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        style={{ backgroundColor: accentColor }}
      >
        {userInitials(user)}
      </button>

      {open && (
        <div role="menu" aria-label="Account and workspace" className={`absolute right-0 top-14 z-50 w-72 rounded-2xl border p-3 shadow-xl ${panel}`}>
          <div className="border-b border-inherit px-3 pb-3">
            <p className="text-sm font-semibold">{user.name}</p>
            <p className={`mt-0.5 truncate text-xs ${muted}`}>{user.email}</p>
          </div>

          <div className="border-b border-inherit px-3 py-3">
            <p className={`text-[11px] font-bold uppercase tracking-wide ${muted}`}>Current organization</p>
            <p className="mt-1 text-sm font-semibold">{currentOrganization?.name ?? "No organization selected"}</p>
          </div>

          <div className="border-b border-inherit py-2">
            <p className={`px-3 pb-1 text-[11px] font-bold uppercase tracking-wide ${muted}`}>Available organizations</p>
            {organizations.length === 0 ? (
              <p className={`px-3 py-2 text-sm ${muted}`}>No organizations available</p>
            ) : (
              organizations.map((organization) => {
                const active = organization.id === currentOrganization?.id;
                return (
                  <button
                    key={organization.id}
                    type="button"
                    role="menuitem"
                    aria-current={active ? "true" : undefined}
                    onClick={() => selectOrganization(organization.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${item}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: organization.accentColor }} />
                      <span className="truncate">{organization.name}</span>
                    </span>
                    {active && <span className="ml-2 text-xs font-bold" aria-label="Current organization">✓</span>}
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); void onSignOut(); }}
            className={`mt-2 flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold ${item}`}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
