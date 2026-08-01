const fs = require("node:fs");
const path = require("node:path");

const categories = [
  {
    name: "password reset",
    en: (n, c) => `Hello, I am ${c} from Northstar ${n}. My password reset email never arrives and I cannot regain access to our workspace.`,
    id: (n, c) => `Halo, saya ${c} dari Northstar ${n}. Email reset kata sandi tidak pernah tiba dan saya tidak dapat mengakses workspace kami.`
  },
  {
    name: "login and access",
    en: (n, c) => `Hello, I am ${c} from Cedar ${n}. Our users are unable to sign in to the workspace after the login screen changed.`,
    id: (n, c) => `Halo, saya ${c} dari Cedar ${n}. Pengguna kami tidak dapat masuk ke workspace setelah layar login berubah.`
  },
  {
    name: "account activation",
    en: (n, c) => `Hello, I am ${c} from Summit ${n}. A newly invited administrator cannot activate the account or accept the workspace invitation.`,
    id: (n, c) => `Halo, saya ${c} dari Summit ${n}. Administrator yang baru diundang tidak dapat mengaktifkan akun atau menerima undangan workspace.`
  },
  {
    name: "billing and invoice",
    en: (n, c) => `Hello, I am ${c} from Juniper ${n}. Our latest invoice shows an unexpected billing amount after a subscription seat change.`,
    id: (n, c) => `Halo, saya ${c} dari Juniper ${n}. Faktur terbaru kami menunjukkan jumlah tagihan yang tidak sesuai setelah perubahan seat langganan.`
  },
  {
    name: "refund and payment",
    en: (n, c) => `Hello, I am ${c} from Lantern ${n}. We see a duplicate charge and need a human-reviewed payment and refund investigation.`,
    id: (n, c) => `Halo, saya ${c} dari Lantern ${n}. Kami melihat tagihan ganda dan membutuhkan pemeriksaan pembayaran serta refund oleh manusia.`
  },
  {
    name: "delivery and shipping",
    en: (n, c) => `Hello, I am ${c} from Harbor ${n}. Please tell us when the physical welcome package will be delivered to our office.`,
    id: (n, c) => `Halo, saya ${c} dari Harbor ${n}. Mohon beri tahu kapan paket sambutan fisik akan dikirim ke kantor kami.`
  },
  {
    name: "product information",
    en: (n, c) => `Hello, I am ${c} from Acme ${n}. Could you explain the main OIP products and the benefits for our organization?`,
    id: (n, c) => `Halo, saya ${c} dari Acme ${n}. Bisakah Anda menjelaskan produk utama OIP dan manfaatnya bagi organisasi kami?`
  },
  {
    name: "general business inquiry",
    en: (n, c) => `Hello, I am ${c} from Meridian ${n}. We are evaluating vendors and would like to understand your company and partnership model.`,
    id: (n, c) => `Halo, saya ${c} dari Meridian ${n}. Kami sedang mengevaluasi vendor dan ingin memahami perusahaan serta model kemitraan Anda.`
  },
  {
    name: "export naming collision",
    en: (n, c) => `Hello, I am ${c} from Bluebird ${n}. Two scheduled CSV exports created at the same time receive the same filename and one export replaces the other in our reporting folder.`,
    id: (n, c) => `Halo, saya ${c} dari Bluebird ${n}. Dua ekspor CSV terjadwal yang dibuat bersamaan mendapat nama file sama dan satu ekspor menggantikan yang lain di folder laporan kami.`
  },
  {
    name: "ambiguous or unsupported",
    en: (n, c) => `Hi, I am ${c} from Willow ${n}. Something is not working and we need help with this situation as soon as possible.`,
    id: (n, c) => `Halo, saya ${c} dari Willow ${n}. Ada sesuatu yang tidak berfungsi dan kami membutuhkan bantuan untuk situasi ini secepatnya.`
  }
];

const customers = ["Ayu", "Budi", "Chandra", "Dewi", "Eka"];
const rows = [];
for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex += 1) {
  const category = categories[categoryIndex];
  for (let rowIndex = 0; rowIndex < 10; rowIndex += 1) {
    const language = rowIndex < 5 ? "English" : "Indonesian";
    const customer = customers[rowIndex % customers.length];
    const ordinal = String(rowIndex + 1).padStart(2, "0");
    const organization = `${category.name.replace(/[^a-z0-9]+/gi, "-")}-${ordinal}`;
    const message = language === "English"
      ? category.en(organization, customer)
      : category.id(organization, customer);
    rows.push({
      category: category.name,
      language,
      message: `${message} Case T062-${String(categoryIndex + 1).padStart(2, "0")}-${ordinal}.`
    });
  }
}

if (rows.length !== 100) throw new Error(`Expected 100 rows, got ${rows.length}`);
if (new Set(rows.map((row) => row.message)).size !== rows.length) throw new Error("Fixture messages must be unique");

const csvEscape = (value) => `"${String(value).replace(/"/g, '""')}"`;
const csv = ["message", ...rows.map((row) => csvEscape(row.message))].join("\n") + "\n";
const outputPath = path.join(__dirname, "..", "tmp", "TODO-062-developer-bulk.csv");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, csv, "utf8");
console.log(JSON.stringify({ outputPath, rows: rows.length, categories: categories.map((item) => item.name), languages: { English: 50, Indonesian: 50 } }, null, 2));
