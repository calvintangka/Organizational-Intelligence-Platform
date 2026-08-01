import type { BusinessIntentClassification } from "@/types/oip";

const OPERATIONAL_SIGNALS = [
  /\b(?:cannot|can't|cant|unable|failed|failure|error|broken|not working|won't|wont|blocked|locked|forgot|reset|declined|charged|duplicate|refund|invoice|billing|shipment|shipping|delivery|tracking|activation code|login|log in|sign in|password|verification code|otp|install|crash|slow|freeze|sync|permission|access denied)\b/i,
  /\b(?:tidak bisa|nggak bisa|gagal|kesalahan|rusak|tidak berfungsi|lupa|reset|ditolak|tertagih|duplikat|pengembalian dana|tagihan|faktur|pengiriman|aktivasi|masuk|kata sandi|kode verifikasi|instal|lambat|macet|sinkronisasi|izin|akses ditolak)\b/i
];

const PRODUCT_SIGNALS = [
  /\b(?:what does|how does|product details|more information|more info|features?|capabilities|product|platform|solution|product introduction|overview|brochure)\b/i,
  /\b(?:produk|detail produk|informasi|fitur|kemampuan|solusi|mengevaluasi|tertarik|ingin tahu|penjelasan|layanan apa)\b/i
];

const COMPANY_SIGNALS = [
  /\b(?:your company|about your company|what services do you provide|what industry do you serve|who are you|organization|company profile)\b/i,
  /\b(?:perusahaan Anda|tentang perusahaan|layanan apa yang disediakan|bergerak di industri apa|profil perusahaan|organisasi Anda)\b/i
];

const GENERAL_SIGNALS = [
  /\b(?:i'd like to know more|i would like to know more|we are evaluating vendors|we're interested|we are interested|general inquiry|business inquiry|partnership|procurement|sales inquiry|press inquiry|investor|career)\b/i,
  /\b(?:saya ingin tahu lebih banyak|kami sedang mengevaluasi vendor|kami tertarik|pertanyaan umum|pertanyaan bisnis|kemitraan|pengadaan|penjualan|pers|investor|karier)\b/i
];

const MULTILINGUAL_SIGNALS = [
  /\b(?:multilingual|multiple languages?|language support|translation|english and indonesian|indonesian and english)\b/i,
  /\b(?:multibahasa|dukungan bahasa|beberapa bahasa|terjemahan|bahasa inggris dan indonesia|bahasa indonesia dan inggris)\b/i
];

const DIRECT_PRODUCT_SIGNALS = [
  /\b(?:what does|how does|product details|more information|more info|features?|capabilities|product|platform|product introduction|overview)\b/i,
  /\b(?:produk|detail produk|informasi|fitur|kemampuan|platform|penjelasan)\b/i
];

function matches(text: string, patterns: RegExp[]): string[] {
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

/** Operational symptoms take precedence over business vocabulary. */
export function classifyBusinessIntent(text: string): BusinessIntentClassification {
  const operationalSignals = matches(text, OPERATIONAL_SIGNALS);
  if (operationalSignals.length > 0) {
    return { inquiryType: "operational_support", intent: "operational_support", confidence: "high", signals: operationalSignals.slice(0, 4) };
  }

  const generalSignals = matches(text, GENERAL_SIGNALS);
  const multilingualSignals = matches(text, MULTILINGUAL_SIGNALS);
  const directProductSignals = matches(text, DIRECT_PRODUCT_SIGNALS);
  if (multilingualSignals.length > 0) {
    return { inquiryType: "business_inquiry", intent: "multilingual_support", confidence: "high", signals: multilingualSignals.slice(0, 4) };
  }
  if (directProductSignals.length > 0) {
    const productSignals = matches(text, PRODUCT_SIGNALS);
    return { inquiryType: "business_inquiry", intent: "product_information", confidence: "high", signals: productSignals.slice(0, 4) };
  }
  if (generalSignals.length > 0) {
    return { inquiryType: "business_inquiry", intent: "general_business_inquiry", confidence: "medium", signals: generalSignals.slice(0, 4) };
  }

  const productSignals = matches(text, PRODUCT_SIGNALS);
  if (productSignals.length > 0) {
    return { inquiryType: "business_inquiry", intent: "product_information", confidence: "high", signals: productSignals.slice(0, 4) };
  }

  const companySignals = matches(text, COMPANY_SIGNALS);
  if (companySignals.length > 0) {
    return { inquiryType: "business_inquiry", intent: "company_information", confidence: "high", signals: companySignals.slice(0, 4) };
  }

  return { inquiryType: "operational_support", intent: "operational_support", confidence: "low", signals: [] };
}

/**
 * Adds bounded retrieval cues for the business lessons used by the live
 * organizational-learning workflow. These are aliases, not new facts; the
 * reviewer-authored signals remain the source of truth.
 */
export function businessLessonSignalAliases(title: string, intent?: string): string[] {
  if (intent === "multilingual_support" || /multilingual/i.test(title)) {
    return ["english indonesian", "multiple languages support"];
  }
  if (intent === "product_information" || /product information/i.test(title)) {
    return ["what does platform do", "platform does", "product overview request", "produk maesa", "produk maesa singkat"];
  }
  if (intent === "company_information" || /company information/i.test(title)) {
    return ["company overview request"];
  }
  return ["general business inquiry"];
}
