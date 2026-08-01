const fs = require("node:fs");
const path = require("node:path");

const topics = [
  ["password reset", "My password reset email is missing after replacing my laptop"],
  ["login access", "I cannot sign in even though the credentials are correct"],
  ["activation", "A newly invited employee account is still pending activation"],
  ["billing invoice", "The latest invoice has the wrong company billing details"],
  ["refund payment", "A duplicate payment needs a human-reviewed refund investigation"],
  ["shipping", "The delivery tracking status has not changed and the package is delayed"],
  ["product information", "Please explain the product capabilities and multilingual support"],
  ["business inquiry", "We are evaluating the company and would like an overview of its services"],
  ["new export process", "Two scheduled exports need distinct names so neither report is overwritten"],
  ["ambiguous", "Something is wrong and I need help but I do not know which account or process is involved"]
];
const customers = ["Ayu", "Budi", "Chandra", "Dewi", "Eka"];
const companies = ["Orchid", "Kestrel", "Nusantara", "Pioneer", "Atlas"];
const rows = [];

for (let category = 0; category < topics.length; category += 1) {
  for (let index = 0; index < 10; index += 1) {
    const language = index < 5 ? "en" : "id";
    const ordinal = String(index + 1).padStart(2, "0");
    const [topic, english] = topics[category];
    const indonesian = `Halo, saya ${customers[index % customers.length]} dari ${companies[category % companies.length]}. Mohon bantuan untuk ${topic} pada kasus TODO-062B-${String(category + 1).padStart(2, "0")}-${ordinal}.`;
    const message = language === "en"
      ? `Hello, I am ${customers[index % customers.length]} from ${companies[category % companies.length]}. ${english}. This is TODO-062B-${String(category + 1).padStart(2, "0")}-${ordinal}.`
      : indonesian;
    rows.push({ message, category: topic, language });
  }
}

if (rows.length !== 100 || new Set(rows.map((row) => row.message)).size !== 100) {
  throw new Error("TODO-062B fixture must contain 100 unique rows.");
}

const escape = (value) => `"${String(value).replace(/"/g, '""')}"`;
const outputPath = path.join(__dirname, "..", "tmp", "TODO-062B-developer-bulk.csv");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, ["message", ...rows.map((row) => escape(row.message))].join("\n") + "\n", "utf8");
console.log(JSON.stringify({ outputPath, rows: rows.length, english: 50, indonesian: 50, categories: 10 }, null, 2));
