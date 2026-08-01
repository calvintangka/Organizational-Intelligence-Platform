const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const { classifyBusinessIntent } = require(path.join(root, "lib", "businessInquiry.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { draftBusinessInquiryResponse } = require(path.join(root, "lib", "drafting.ts"));
const { seedOrganizationProfiles } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));

const profile = seedOrganizationProfiles.find((item) => item.id === "profile-maesa-tech");
assert.ok(profile, "Maesa Tech profile must be present");

const businessCases = [
  ["product_information", "What does your product do?"],
  ["product_information", "Can you send product details?"],
  ["product_information", "Saya ingin informasi tentang produk Anda."],
  ["company_information", "Tell me about your company and what services you provide."],
  ["company_information", "Perusahaan Anda bergerak di industri apa?"],
  ["general_business_inquiry", "We're interested in learning about your solution."],
  ["general_business_inquiry", "Kami sedang mengevaluasi vendor dan ingin tahu lebih banyak."],
];

for (const [expected, text] of businessCases) {
  const result = classifyBusinessIntent(text);
  assert.equal(result.inquiryType, "business_inquiry", text);
  assert.equal(result.intent, expected, text);
}

const operationalCases = [
  "I forgot my password and cannot log in.",
  "Kode aktivasi saya gagal.",
  "Why was I charged twice for billing?",
  "Saya punya pertanyaan tentang faktur.",
  "Saya tidak bisa login ke akun.",
  "My shipping delivery is delayed.",
  "Saya ingin meminta pengembalian dana.",
];
for (const text of operationalCases) {
  assert.equal(classifyBusinessIntent(text).inquiryType, "operational_support", text);
}

const operationalRegressionMatrix = [
  ["Password Reset", "I need a password reset because I cannot log in.", "Saya perlu reset kata sandi karena tidak bisa masuk."],
  ["Activation", "My activation code fails.", "Kode aktivasi saya gagal."],
  ["Billing", "I have a billing charge question.", "Saya punya pertanyaan tentang tagihan."],
  ["Invoice", "My invoice is incorrect.", "Faktur saya salah."],
  ["Login", "I cannot log in.", "Saya tidak bisa login."],
  ["Shipping", "My shipment is delayed.", "Pengiriman saya terlambat."],
  ["Refund", "I want a refund.", "Saya ingin pengembalian dana."]
];
for (const [label, english, indonesian] of operationalRegressionMatrix) {
  assert.equal(classifyBusinessIntent(english).inquiryType, "operational_support", `${label} English`);
  assert.equal(classifyBusinessIntent(indonesian).inquiryType, "operational_support", `${label} Indonesian`);
}

const collision = classifyBusinessIntent("I need product information because the activation code fails.");
assert.equal(collision.inquiryType, "operational_support", "operational symptom must beat product vocabulary");

const ticket = {
  id: "probe-ticket",
  ticketId: "MT-PROBE-060",
  customerName: "Demo User",
  subject: "Product information",
  description: "What does your product do? My name is Ryan Sherling and I work at Indeed Inc.",
  category: "General",
  status: "new",
  createdAt: new Date().toISOString()
};
const understanding = understandForProfile(ticket, profile);
assert.equal(understanding.businessClassification.inquiryType, "business_inquiry");
assert.equal(understanding.businessClassification.intent, "product_information");
const draft = draftBusinessInquiryResponse(ticket, understanding, profile, "en");
assert.equal(draft.source, "deterministic");
assert.match(draft.draftResponse, /Ryan Sherling/);
assert.match(draft.draftResponse, /Indeed Inc\./);
assert.match(draft.draftResponse, /AI productivity platform/);
assert.match(draft.draftResponse, /customer support dashboard/);
assert.doesNotMatch(draft.draftResponse, /https?:\/\//i);
assert.doesNotMatch(draft.draftResponse, /https?:\/\/|\$\d|please find attached/i);

const indonesianDraft = draftBusinessInquiryResponse(ticket, understanding, profile, "id");
assert.match(indonesianDraft.draftResponse, /Halo/);
assert.match(indonesianDraft.draftResponse, /Profil organisasi|menawarkan produk/i);
assert.match(indonesianDraft.draftResponse, /Ryan Sherling/);

console.log("TODO-060 business inquiry probe: PASS");
