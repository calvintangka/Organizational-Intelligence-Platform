import { seedOrganizationProfiles } from "@/data/seedOrganizationProfiles";
import { findSeedOrganizationProfile, normalizeOrganizationProfile, splitProfileField } from "@/lib/organizationProfile";
import type { CustomerTone, OrganizationProfile } from "@/types";

interface OrganizationProfilePanelProps {
  profile: OrganizationProfile;
  onChange: (profile: OrganizationProfile) => void;
  onReset: () => void;
}

const tones: CustomerTone[] = ["professional", "friendly", "formal", "empathetic"];

export function OrganizationProfilePanel({ profile, onChange, onReset }: OrganizationProfilePanelProps) {
  function update(updates: Partial<OrganizationProfile>) {
    onChange(normalizeOrganizationProfile({ ...profile, ...updates }));
  }

  function updateList(key: keyof Pick<
    OrganizationProfile,
    "products" | "services" | "supportedDomains" | "businessVocabulary" | "outOfScopeTopics" | "supportBoundaries"
  >, value: string) {
    update({ [key]: splitProfileField(value) } as Partial<OrganizationProfile>);
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-trust">
              Organization-aware mode
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-memory">
              Representing: {profile.name}
            </span>
          </div>
          <h2 className="mt-2 text-2xl font-bold text-ink">Organization profile</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Industry: {profile.industry} | Tone: {profile.customerTone} | Auto-resolution threshold: {profile.autoResolutionThreshold}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={profile.id}
            onChange={(event) => onChange(findSeedOrganizationProfile(event.target.value))}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-memory focus:ring-4 focus:ring-blue-100"
          >
            {seedOrganizationProfiles.map((seed) => (
              <option key={seed.id} value={seed.id}>
                {seed.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onReset}
            className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Reset Organization Profile
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Info label="Representing" value={profile.name} />
        <Info label="Industry" value={profile.industry} />
        <Info label="Supported Domains" value={profile.supportedDomains.slice(0, 5).join(", ")} />
        <Info label="Tone" value={profile.customerTone} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Field label="Organization name" value={profile.name} onChange={(value) => update({ name: value })} />
        <Field label="Industry" value={profile.industry} onChange={(value) => update({ industry: value })} />
        <label className="lg:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Company description</span>
          <textarea
            value={profile.description}
            onChange={(event) => update({ description: event.target.value })}
            rows={2}
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-memory focus:ring-4 focus:ring-blue-100"
          />
        </label>
        <ListField label="Products" value={profile.products} onChange={(value) => updateList("products", value)} />
        <ListField label="Services" value={profile.services} onChange={(value) => updateList("services", value)} />
        <ListField label="Supported support domains" value={profile.supportedDomains} onChange={(value) => updateList("supportedDomains", value)} />
        <ListField label="Business vocabulary" value={profile.businessVocabulary} onChange={(value) => updateList("businessVocabulary", value)} />
        <ListField label="Out-of-scope topics" value={profile.outOfScopeTopics} onChange={(value) => updateList("outOfScopeTopics", value)} />
        <ListField label="Support boundaries" value={profile.supportBoundaries} onChange={(value) => updateList("supportBoundaries", value)} />
        <label>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Customer communication tone</span>
          <select
            value={profile.customerTone}
            onChange={(event) => update({ customerTone: event.target.value as CustomerTone })}
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-memory focus:ring-4 focus:ring-blue-100"
          >
            {tones.map((tone) => (
              <option key={tone} value={tone}>
                {tone}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Auto-resolution threshold</span>
          <input
            type="number"
            min={0}
            max={100}
            value={profile.autoResolutionThreshold}
            onChange={(event) => update({ autoResolutionThreshold: Number(event.target.value) })}
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-memory focus:ring-4 focus:ring-blue-100"
          />
        </label>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-800">{value || "Not configured"}</p>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-memory focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function ListField({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <textarea
        value={value.join(", ")}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-memory focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}
