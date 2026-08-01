const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const { classifyBusinessIntent, businessLessonSignalAliases } = require(path.join(root, "lib", "businessInquiry.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { draftResponse, findMatchingLesson, isCompatibleForDrafting } = require(path.join(root, "lib", "drafting.ts"));
const { generateReflection } = require(path.join(root, "lib", "reflection.ts"));
const { seedOrganizationProfiles } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));

const profile = seedOrganizationProfiles.find((item) => item.id === "profile-maesa-tech");
assert.ok(profile, "Maesa Tech profile must be present");

const cases = [
  {
    intent: "product_information",
    title: "Product Information Inquiry",
    learning: "Could you please send me an overview of Maesa Tech's products?",
    retrieval: "Can you tell me what Maesa Tech's platform does?",
    signals: ["product overview", "product information", "company overview", "platform overview", "organization intelligence", "knowledge platform", "maesa tech"]
  },
  {
    intent: "product_information",
    title: "Product Information Inquiry",
    learning: "Saya ingin mengetahui fungsi utama produk Maesa Tech dan manfaatnya bagi perusahaan.",
    retrieval: "Bisa jelaskan produk Maesa Tech secara singkat?",
    signals: ["informasi produk", "produk maesa", "fungsi produk", "manfaat", "platform", "organisasi"]
  },
  {
    intent: "multilingual_support",
    title: "Multilingual Support Inquiry",
    learning: "Does Maesa Tech support multilingual organizations?",
    retrieval: "Can your platform work for both English and Indonesian support teams?",
    signals: ["multilingual", "language support", "translation", "multiple languages", "english", "indonesian"]
  }
];

for (const testCase of cases) {
  const learningTicket = {
    id: `probe-learning-${testCase.intent}`,
    ticketId: `MT-PROBE-061-${testCase.intent}`,
    customerName: "Probe Customer",
    subject: testCase.title,
    description: testCase.learning,
    category: "General",
    status: "new",
    createdAt: new Date().toISOString()
  };
  const retrievalTicket = { ...learningTicket, id: `${learningTicket.id}-retrieval`, ticketId: `${learningTicket.ticketId}-R`, description: testCase.retrieval };
  const classification = classifyBusinessIntent(`${learningTicket.subject} ${learningTicket.description}`);
  assert.equal(classification.inquiryType, "business_inquiry");
  assert.equal(classification.intent, testCase.intent);

  const learningUnderstanding = understandForProfile(learningTicket, profile);
  const understanding = { ...learningUnderstanding, category: "Business Inquiry", coreProblem: testCase.title, intent: testCase.intent };
  const item = {
    id: `knowledge-business-${testCase.intent}`,
    canonicalProblemId: `canonical-${testCase.intent}`,
    canonicalProblemTitle: testCase.title,
    title: testCase.title,
    problem: "Reviewed business inquiry knowledge",
    problemSummary: "Reviewed business inquiry knowledge",
    approvedAnswer: "Hello {{customerName}}, this is the approved business response for {{organizationName}}.",
    customerResponseTemplate: "Hello {{customerName}}, this is the approved business response for {{organizationName}}.",
    internalGuidance: "Use the approved business lesson.",
    category: "Business Inquiry",
    tags: [...testCase.signals, ...businessLessonSignalAliases(testCase.title, testCase.intent)],
    lessons: [{
      id: `lesson-${testCase.intent}`,
      rootCause: "Reviewed business inquiry knowledge was not previously documented.",
      solution: "Use the approved business lesson.",
      customerResponse: "Hello {{customerName}}, this is the approved business response for {{organizationName}}.",
      signals: [...testCase.signals, ...businessLessonSignalAliases(testCase.title, testCase.intent)],
      createdAt: new Date().toISOString(),
      sourceTicketId: learningTicket.ticketId
    }],
    trustScore: 20,
    timesSeen: 1,
    timesReused: 0,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };

  const matches = retrieveMemory({ ...understanding, originalText: `${retrievalTicket.subject} ${retrievalTicket.description}` }, [item]);
  assert.equal(matches.length, 1, `${testCase.intent} should recall business memory`);
  const lessonMatch = findMatchingLesson(retrievalTicket, item);
  assert.ok(lessonMatch, `${testCase.intent} should match the reviewed lesson`);
  assert.ok(lessonMatch.multiTokenMatches >= 1, `${testCase.intent} needs strong multi-token lesson evidence`);
  assert.equal(isCompatibleForDrafting(understanding, item, retrievalTicket), true);
  const draft = draftResponse(retrievalTicket, understanding, matches[0], profile);
  assert.equal(draft.source, "deterministic");
  assert.deepEqual(draft.basedOnKnowledgeIds, [matches[0].item.id]);
  assert.match(draft.draftResponse, /approved business response/i);

  const reflection = generateReflection(understanding, "A safe reviewed response", null);
  assert.equal(reflection.action, "create_new");
  assert.equal(reflection.isLearningEvent, true);
}

console.log("TODO-061 business memory probe: PASS");
