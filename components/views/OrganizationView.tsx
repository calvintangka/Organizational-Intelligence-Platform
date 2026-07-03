"use client";

import { useState } from "react";
import type { CustomerTone, OrganizationProfile } from "@/types";
import { ACCENT_SWATCHES } from "@/components/AccentPicker";
import { initialsFor, normalizeAccentColor } from "@/lib/organizationProfile";

interface OrganizationViewProps {
  profile: OrganizationProfile;
  organizations: OrganizationProfile[];
  onChange: (profile: OrganizationProfile) => void;
  onSelectOrg: (id: string) => void;
  onAddOrg: (profile: OrganizationProfile) => void;
  onDeleteOrg: (id: string) => void;
  darkMode: boolean;
}

const INDUSTRIES = [
  "Software / SaaS",
  "Delivery / Logistics",
  "Logistics",
  "Legal Services",
  "Legal",
  "Healthcare",
  "Finance",
  "Retail",
  "E-commerce",
  "Education",
  "Manufacturing",
  "Hospitality",
  "Telecommunications",
  "Government",
  "Nonprofit",
];

const TONES: CustomerTone[] = ["professional", "friendly", "formal", "empathetic"];

const CUSTOM_INDUSTRY = "__custom__";

function buildNewProfile(input: {
  name: string;
  initials: string;
  accentColor: string;
  industry: string;
  tone: CustomerTone;
}): OrganizationProfile {
  const now = new Date().toISOString();
  const initials = input.initials.trim().toUpperCase().slice(0, 3);
  return {
    id: `org-${Date.now().toString(36)}`,
    name: input.name.trim(),
    industry: input.industry.trim() || "Software / SaaS",
    description: "",
    products: [],
    services: [],
    supportedDomains: [],
    businessVocabulary: [],
    supportedIssueTypes: [],
    outOfScopeTopics: [],
    customerTone: input.tone,
    supportBoundaries: [],
    autoResolutionThreshold: 80,
    escalationRules: [],
    accentColor: normalizeAccentColor(input.accentColor),
    logoInitials: initials.length > 0 ? initials : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function OrganizationView({
  profile,
  organizations,
  onChange,
  onSelectOrg,
  onAddOrg,
  onDeleteOrg,
  darkMode,
}: OrganizationViewProps) {
  const accent = normalizeAccentColor(profile.accentColor);
  const initials = initialsFor(profile);
  const vocabulary = profile.businessVocabulary ?? [];
  const isCustomIndustry = !INDUSTRIES.includes(profile.industry);

  const [vocabInput, setVocabInput] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newOrg, setNewOrg] = useState({
    name: "",
    initials: "",
    accentColor: "#7C3AED",
    industry: "Software / SaaS",
    tone: "professional" as CustomerTone,
  });

  const card = `rounded-2xl border p-5 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`;
  const label = `text-xs font-bold uppercase tracking-wide mb-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`;
  const input = `w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-blue-200 ${darkMode ? "bg-[#111827] border-[#2d3f52] text-white placeholder:text-slate-600" : "bg-white border-slate-200 text-[#111827]"}`;
  const heading = `font-bold ${darkMode ? "text-white" : "text-[#111827]"}`;
  const sub = `text-sm mt-0.5 ${darkMode ? "text-slate-400" : "text-[#667085]"}`;

  const learningPolicies = [
    `Auto-resolution threshold: ${profile.autoResolutionThreshold}`,
    "Reflection required before memory save",
    "Human approval for new knowledge",
    "Provenance required for all responses",
    "Major revisions partially reset trust",
  ];

  function addVocabTerm() {
    const term = vocabInput.trim();
    if (!term) return;
    if (vocabulary.some((t) => t.toLowerCase() === term.toLowerCase())) {
      setVocabInput("");
      return;
    }
    onChange({ ...profile, businessVocabulary: [...vocabulary, term] });
    setVocabInput("");
  }

  function removeVocabTerm(term: string) {
    onChange({ ...profile, businessVocabulary: vocabulary.filter((t) => t !== term) });
  }

  function handleDelete(org: OrganizationProfile) {
    if (organizations.length <= 1) return;
    if (typeof window !== "undefined" && !window.confirm(`Delete "${org.name}"? This removes the organization from the switcher.`)) return;
    onDeleteOrg(org.id);
  }

  function submitNewOrg() {
    if (newOrg.name.trim().length < 2) return;
    onAddOrg(buildNewProfile(newOrg));
    setAddOpen(false);
    setNewOrg({ name: "", initials: "", accentColor: ACCENT_SWATCHES[2], industry: "Software / SaaS", tone: "professional" });
  }

  const newOrgPreviewInitials = initialsFor({ name: newOrg.name || "New Org", logoInitials: newOrg.initials || undefined });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className={`text-3xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Organization</h1>
        <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
          Customize {profile.name} as a white-label learning workspace.
        </p>
      </div>

      {/* Brand identity */}
      <div className={`${card} mb-4`}>
        <h2 className={heading}>Brand identity</h2>
        <p className={sub}>Editing here updates the selected organization everywhere — sidebar, avatars, and switcher.</p>

        <div className="mt-5 flex flex-wrap items-start gap-6">
          {/* Logo block — follows the accent color */}
          <div
            className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-sm"
            style={{ backgroundColor: accent }}
          >
            {initials}
          </div>

          {/* Fields */}
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            <div>
              <p className={label}>Company name</p>
              <input
                className={input}
                value={profile.name}
                onChange={(e) => onChange({ ...profile, name: e.target.value })}
              />
            </div>
            <div>
              <p className={label}>Logo initials</p>
              <input
                className={input}
                value={profile.logoInitials ?? ""}
                placeholder={initials}
                maxLength={3}
                onChange={(e) => onChange({ ...profile, logoInitials: e.target.value.toUpperCase() })}
              />
            </div>
          </div>
        </div>

        {/* Org switcher / management */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <p className={label}>Switch organization</p>
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white transition-colors"
              style={{ backgroundColor: accent }}
            >
              {addOpen ? "Close" : "＋ Add organization"}
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {organizations.map((org) => {
              const active = profile.id === org.id;
              const orgAccent = normalizeAccentColor(org.accentColor);
              return (
                <div
                  key={org.id}
                  className={`group flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "text-white"
                      : darkMode
                      ? "border-[#2d3f52] bg-[#111827] text-slate-300 hover:bg-[#1e3048]"
                      : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  style={active ? { backgroundColor: orgAccent, borderColor: orgAccent } : undefined}
                >
                  <button type="button" onClick={() => onSelectOrg(org.id)} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: active ? "#ffffff" : orgAccent }}
                    />
                    {org.name}
                  </button>
                  {organizations.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Delete ${org.name}`}
                      onClick={() => handleDelete(org)}
                      className={`ml-0.5 rounded-md px-1 text-xs leading-none transition-opacity ${
                        active ? "text-white/80 hover:text-white" : "text-slate-400 hover:text-red-500"
                      }`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className={`mt-2 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
            Select an organization to edit its identity and metadata above and below.
          </p>

          {/* Add organization form */}
          {addOpen && (
            <div className={`mt-4 rounded-2xl border p-4 ${darkMode ? "border-[#2d3f52] bg-[#111827]" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex items-start gap-4">
                <div
                  className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
                  style={{ backgroundColor: normalizeAccentColor(newOrg.accentColor) }}
                >
                  {newOrgPreviewInitials}
                </div>
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className={label}>Company name</p>
                    <input
                      className={input}
                      value={newOrg.name}
                      placeholder="e.g. Nimbus Cloud"
                      onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <p className={label}>Initials (auto)</p>
                    <input
                      className={input}
                      value={newOrg.initials}
                      placeholder={newOrgPreviewInitials}
                      maxLength={3}
                      onChange={(e) => setNewOrg({ ...newOrg, initials: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <div>
                    <p className={label}>Industry</p>
                    <select className={input} value={newOrg.industry} onChange={(e) => setNewOrg({ ...newOrg, industry: e.target.value })}>
                      {INDUSTRIES.map((ind) => (
                        <option key={ind} value={ind}>{ind}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className={label}>Tone of voice</p>
                    <select className={input} value={newOrg.tone} onChange={(e) => setNewOrg({ ...newOrg, tone: e.target.value as CustomerTone })}>
                      {TONES.map((t) => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${darkMode ? "border border-[#2d3f52] text-slate-300 hover:bg-[#1e3048]" : "border border-slate-300 text-slate-600 hover:bg-white"}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitNewOrg}
                  disabled={newOrg.name.trim().length < 2}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: normalizeAccentColor(newOrg.accentColor) }}
                >
                  Create organization
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        {/* Learning policies */}
        <div className={card}>
          <h2 className={heading}>Learning policies</h2>
          <ul className="mt-4 space-y-2.5">
            {learningPolicies.map((policy) => (
              <li key={policy} className="flex items-center gap-2.5">
                <svg className="w-4 h-4 text-[#22C55E] flex-shrink-0" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" fill="#dcfce7" />
                  <path d="M5 8l2 2 4-4" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className={`text-sm ${darkMode ? "text-slate-300" : "text-[#111827]"}`}>{policy}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4">
            <p className={label}>Auto-resolution threshold</p>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="range"
                min={40}
                max={100}
                step={5}
                value={profile.autoResolutionThreshold}
                onChange={(e) => onChange({ ...profile, autoResolutionThreshold: Number(e.target.value) })}
                className="flex-1 accent-[#2563EB]"
              />
              <span className={`text-sm font-bold w-8 ${darkMode ? "text-white" : "text-[#111827]"}`}>
                {profile.autoResolutionThreshold}
              </span>
            </div>
          </div>
        </div>

        {/* Business vocabulary */}
        <div className={card}>
          <h2 className={heading}>Business vocabulary</h2>
          <p className={`${sub} mb-4`}>Terms OIP uses to understand support signals. Add with Enter, remove with ✕.</p>
          <div className="flex flex-wrap gap-2">
            {vocabulary.length === 0 && (
              <span className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>No terms yet — add one below.</span>
            )}
            {vocabulary.map((term) => (
              <span
                key={term}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium ${darkMode ? "bg-blue-900/40 text-blue-300" : "bg-blue-50 text-blue-700"}`}
              >
                {term}
                <button
                  type="button"
                  aria-label={`Remove ${term}`}
                  onClick={() => removeVocabTerm(term)}
                  className={`rounded leading-none transition-colors ${darkMode ? "text-blue-300/70 hover:text-white" : "text-blue-400 hover:text-red-500"}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <input
            value={vocabInput}
            onChange={(e) => setVocabInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addVocabTerm();
              }
            }}
            placeholder="Add a term and press Enter…"
            className={`${input} mt-3`}
          />

          <div className="mt-5">
            <p className={label}>Industry</p>
            <select
              className={input}
              value={isCustomIndustry ? CUSTOM_INDUSTRY : profile.industry}
              onChange={(e) => {
                const v = e.target.value;
                onChange({ ...profile, industry: v === CUSTOM_INDUSTRY ? "" : v });
              }}
            >
              {INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
              <option value={CUSTOM_INDUSTRY}>Other / custom…</option>
            </select>
            {isCustomIndustry && (
              <input
                className={`${input} mt-2`}
                value={profile.industry}
                placeholder="Enter a custom industry"
                onChange={(e) => onChange({ ...profile, industry: e.target.value })}
              />
            )}
          </div>

          <div className="mt-3">
            <p className={label}>Tone of voice</p>
            <select
              className={input}
              value={profile.customerTone ?? "professional"}
              onChange={(e) => onChange({ ...profile, customerTone: e.target.value as OrganizationProfile["customerTone"] })}
            >
              {TONES.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

    </div>
  );
}
