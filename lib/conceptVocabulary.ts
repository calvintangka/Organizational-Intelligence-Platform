/**
 * TODO-058 Phase E — concept-level business vocabulary.
 *
 * The existing `businessVocabulary` is a flat list of WORDS, which is inherently
 * language-specific: an organization would have to re-enter every term for every
 * language it supports, and Organizational Memory would drift apart per
 * language. A concept carries one language-neutral id plus every surface form
 * that means it, so "invoice", "faktur", "factura", and "請求書" all resolve to
 * the single concept `invoice` and therefore to the same organizational memory.
 *
 * This module owns concept normalization and alias resolution only. Wiring
 * concepts into canonical matching and retrieval is Phase C/D and is
 * deliberately NOT done here — see docs/TODO-058-LANGUAGE-NEUTRAL-DESIGN.md.
 */
import type { BusinessConcept, OrganizationProfile } from "@/types";
import { foldForMatching } from "@/lib/textNormalization";

/**
 * Built-in concepts for the core support domains, seeded across the supported
 * languages. An organization inherits these and may add its own; organization
 * concepts win on id collision so a business can always override a default.
 */
export const BUILT_IN_CONCEPTS: BusinessConcept[] = [
  {
    id: "login",
    label: "Login",
    aliases: [
      "login", "log in", "sign in", "signin", "log on",
      "masuk", "login akun",
      "iniciar sesion", "inicio de sesion", "acceder",
      // Reflexive verbs conjugate the pronoun ("me/te/se/nous connecter"), so the
      // bare infinitive is the reliable alias rather than one pronoun form.
      "connexion", "connecter", "identifier",
      "anmelden", "anmeldung", "einloggen",
      "entrar", "fazer login", "iniciar sessao",
      "accedere", "accesso",
      "ログイン", "サインイン",
      "로그인",
      "登录", "登入"
    ]
  },
  {
    id: "password",
    label: "Password",
    aliases: [
      "password", "passcode",
      "kata sandi", "sandi",
      "contrasena", "clave",
      "mot de passe",
      "passwort", "kennwort",
      "senha",
      "parola", "parola d accesso",
      "パスワード",
      "비밀번호", "암호",
      "密码", "密碼"
    ]
  },
  {
    id: "account",
    label: "Account",
    aliases: [
      "account",
      "akun",
      "cuenta",
      "compte",
      "konto",
      "conta",
      "conto", "account utente",
      "アカウント",
      "계정",
      "账户", "帳戶", "账号"
    ]
  },
  {
    id: "invoice",
    label: "Invoice",
    aliases: [
      "invoice", "bill",
      "faktur", "tagihan",
      "factura",
      "facture",
      "rechnung",
      "fatura",
      "fattura",
      "請求書",
      "청구서", "인보이스",
      "发票", "發票"
    ]
  },
  {
    id: "payment",
    label: "Payment",
    aliases: [
      "payment", "charge", "billing",
      "pembayaran", "bayar",
      "pago",
      "paiement",
      "zahlung",
      "pagamento",
      "支払い", "決済",
      "결제", "지불",
      "付款", "支付"
    ]
  },
  {
    id: "subscription",
    label: "Subscription",
    aliases: [
      "subscription", "plan",
      "langganan",
      "suscripcion",
      "abonnement",
      "abo",
      "assinatura",
      "abbonamento",
      "サブスクリプション", "定期購読",
      "구독",
      "订阅", "訂閱"
    ]
  },
  {
    id: "refund",
    label: "Refund",
    aliases: [
      "refund", "money back",
      "pengembalian dana", "refund dana",
      "reembolso",
      "remboursement",
      "erstattung", "ruckerstattung",
      "rimborso",
      "返金",
      "환불",
      "退款"
    ]
  },
  {
    id: "error",
    label: "Error",
    aliases: [
      "error", "failure", "fails",
      "kesalahan", "galat", "gagal",
      "error de", "fallo",
      "erreur", "echec",
      "fehler",
      "erro", "falha",
      "errore",
      "エラー", "失敗",
      "오류", "에러",
      "错误", "錯誤", "失败"
    ]
  },
  {
    id: "access_denied",
    label: "Access denied",
    aliases: [
      "access denied", "locked out", "cannot access", "permission denied",
      "akses ditolak", "tidak bisa akses", "terkunci",
      "acceso denegado", "no puedo acceder", "bloqueado",
      "acces refuse", "je ne peux pas acceder", "verrouille",
      "zugriff verweigert", "gesperrt",
      "acesso negado", "nao consigo acessar", "bloqueado",
      "accesso negato", "non riesco ad accedere", "bloccato",
      "アクセス拒否", "ロックアウト",
      "액세스 거부", "접근 거부",
      "拒绝访问", "訪問拒否"
    ]
  },
  {
    id: "device_replacement",
    label: "Device replacement",
    aliases: [
      "new device", "new phone", "replaced my phone", "device replacement", "new laptop", "changed devices",
      "perangkat baru", "ganti perangkat", "mengganti perangkat", "ponsel baru", "hp baru",
      "nuevo dispositivo", "cambie de dispositivo", "telefono nuevo",
      "nouvel appareil", "change d appareil", "nouveau telephone",
      "neues gerat", "gerat gewechselt", "neues handy",
      "novo dispositivo", "troquei de aparelho", "celular novo",
      "nuovo dispositivo", "cambiato dispositivo", "nuovo telefono",
      "新しいデバイス", "機種変更", "端末を変更",
      "새 기기", "기기 변경", "휴대폰 교체",
      "新设备", "更换设备", "换了手机"
    ]
  },
  {
    id: "delivery_delay",
    label: "Delivery delay",
    aliases: [
      "delivery delay", "delayed delivery", "package is late", "shipment delayed", "not delivered", "late delivery",
      "keterlambatan pengiriman", "pengiriman terlambat", "paket terlambat", "belum sampai",
      "retraso en la entrega", "envio retrasado", "paquete retrasado", "no ha llegado",
      "retard de livraison", "livraison en retard", "colis en retard",
      "lieferverzogerung", "lieferung verspatet", "paket verspatet",
      "atraso na entrega", "entrega atrasada", "encomenda atrasada",
      "ritardo nella consegna", "consegna in ritardo", "pacco in ritardo",
      "配達遅延", "配送が遅れ", "荷物が届かない",
      "배송 지연", "배송이 늦어", "택배 지연",
      "配送延迟", "快递延误", "包裹延迟"
    ]
  },
  {
    id: "duplicate_record",
    label: "Duplicate record",
    aliases: [
      "duplicate record", "duplicate records", "duplicated entry", "duplicate entries", "created twice", "double entry",
      "data duplikat", "duplikat", "catatan ganda", "terduplikasi", "dua kali",
      "registro duplicado", "registros duplicados", "entrada duplicada",
      "enregistrement en double", "doublon", "doublons",
      "doppelter datensatz", "duplikat eintrag", "doppelte eintrage",
      "registro duplicado", "registros duplicados", "entrada duplicada",
      "record duplicato", "record duplicati", "voce duplicata",
      "重複レコード", "重複データ", "二重登録",
      "중복 레코드", "중복 데이터", "중복 등록",
      "重复记录", "重复数据", "重复条目"
    ]
  },
  {
    id: "permission",
    label: "Permission",
    aliases: [
      "permission", "permissions", "role", "access rights", "privileges",
      "izin", "hak akses", "peran",
      "permiso", "permisos", "rol", "derechos de acceso",
      "permission", "autorisation", "role", "droits d acces",
      "berechtigung", "berechtigungen", "rolle", "zugriffsrechte",
      "permissao", "permissoes", "papel", "direitos de acesso",
      "autorizzazione", "autorizzazioni", "ruolo", "diritti di accesso",
      "権限", "アクセス権", "ロール",
      "권한", "접근 권한", "역할",
      "权限", "访问权限", "角色"
    ]
  },
  {
    id: "report_export",
    label: "Reporting and export",
    aliases: [
      "report", "reporting", "export", "dashboard", "csv export", "download report",
      "laporan", "ekspor", "unduh laporan", "dasbor",
      "informe", "reporte", "exportar", "exportacion", "panel",
      "rapport", "exporter", "exportation", "tableau de bord",
      "bericht", "exportieren", "export", "ubersicht",
      "relatorio", "exportar", "exportacao", "painel",
      "rapporto", "esportare", "esportazione", "cruscotto",
      "レポート", "エクスポート", "ダッシュボード",
      "보고서", "내보내기", "대시보드",
      "报表", "报告", "导出", "仪表板"
    ]
  },
  {
    id: "verification_code",
    label: "Verification code",
    aliases: [
      "verification code", "one time password", "otp", "two factor", "2fa", "mfa",
      "kode verifikasi", "kode otp",
      "codigo de verificacion",
      "code de verification",
      "bestatigungscode", "verifizierungscode",
      "codigo de verificacao",
      "codice di verifica",
      "確認コード", "認証コード", "ワンタイムパスワード",
      "인증 번호", "인증코드",
      "验证码", "驗證碼"
    ]
  }
];

/** Trim, collapse whitespace, and drop empties from a raw alias list. */
function cleanAliases(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const cleaned = value.trim().replace(/\s+/gu, " ");
    if (!cleaned) continue;
    const key = foldForMatching(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

/** Concept ids are language-neutral slugs so they never encode a language. */
export function normalizeConceptId(value: unknown): string {
  if (typeof value !== "string") return "";
  return foldForMatching(value).replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "");
}

/** Drop malformed rows and collapse duplicate ids, keeping the first occurrence. */
export function normalizeConceptVocabulary(value: unknown): BusinessConcept[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, BusinessConcept>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const candidate = entry as Partial<BusinessConcept>;
    const id = normalizeConceptId(candidate.id ?? candidate.label);
    if (!id) continue;
    const aliases = cleanAliases(candidate.aliases);
    const label = typeof candidate.label === "string" && candidate.label.trim() ? candidate.label.trim() : id;
    const existing = byId.get(id);
    if (existing) {
      byId.set(id, { ...existing, aliases: cleanAliases([...existing.aliases, ...aliases]) });
      continue;
    }
    byId.set(id, { id, label, aliases });
  }
  return [...byId.values()];
}

/**
 * The concepts in force for an organization: built-ins plus the organization's
 * own, with organization entries overriding a built-in of the same id.
 */
export function resolveConceptVocabulary(profile: Pick<OrganizationProfile, "conceptVocabulary">): BusinessConcept[] {
  const organizationConcepts = normalizeConceptVocabulary(profile.conceptVocabulary);
  const byId = new Map<string, BusinessConcept>();
  for (const concept of BUILT_IN_CONCEPTS) byId.set(concept.id, concept);
  for (const concept of organizationConcepts) {
    const builtIn = byId.get(concept.id);
    byId.set(
      concept.id,
      builtIn
        ? { ...concept, aliases: cleanAliases([...builtIn.aliases, ...concept.aliases]) }
        : concept
    );
  }
  return [...byId.values()];
}

/**
 * Flat alias -> concept id lookup, folded for matching. Built once per profile
 * by callers that need repeated lookups.
 */
export function buildConceptIndex(concepts: BusinessConcept[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const concept of concepts) {
    for (const alias of [concept.id, concept.label, ...concept.aliases]) {
      const key = foldForMatching(alias);
      if (!key) continue;
      // First writer wins so a built-in alias is never silently reassigned by a
      // later concept that happens to list the same surface form.
      if (!index.has(key)) index.set(key, concept.id);
    }
  }
  return index;
}

/**
 * Concept ids present in a piece of text, in a language-neutral way.
 *
 * Matching is substring-based on the FOLDED text because CJK writes without
 * spaces, so word-boundary matching (which the existing English signal matcher
 * relies on) cannot work for ja/ko/zh. Latin aliases are still guarded by
 * boundary checks to avoid matching inside a larger word.
 */
export function conceptsInText(text: string, concepts: BusinessConcept[]): string[] {
  const folded = foldForMatching(text);
  if (!folded) return [];
  const found = new Set<string>();
  for (const concept of concepts) {
    for (const alias of [concept.id.replace(/_/gu, " "), ...concept.aliases]) {
      const needle = foldForMatching(alias);
      if (!needle) continue;
      if (!folded.includes(needle)) continue;
      // A needle made only of ASCII letters/digits must not match inside a
      // longer word ("key" inside "monkey"); non-ASCII scripts have no such
      // boundary concept and are accepted on substring presence.
      if (/^[a-z0-9 ]+$/u.test(needle)) {
        const boundary = new RegExp(`(?:^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?=$|[^a-z0-9])`, "u");
        if (!boundary.test(folded)) continue;
      }
      found.add(concept.id);
      break;
    }
  }
  return [...found];
}
