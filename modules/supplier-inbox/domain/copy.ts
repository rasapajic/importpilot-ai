import type { Locale } from "@/modules/i18n/translations";
import { resolveLocale } from "@/modules/i18n/translations";

type Copy = {
  openInbox: string;
  title: string;
  back: string;
  receivingOff: string;
  receivingOnSynthetic: string;
  extractorNote: string;
  gmailNote: string;
  marketplaceNote: string;
  empty: string;
  original: string;
  serbian: string;
  attachments: string;
  download: string;
  downloadBlocked: string;
  fields: string;
  review: string;
  unreviewed: string;
  costNote: string;
  followUp: string;
  unsent: string;
  activity: string;
  delayed: string;
  confirm: string;
  confirmBlocked: string;
  accept: string;
  reject: string;
  acknowledge: string;
  noOrder: string;
  senderTrust: string;
  scan: string;
};

const copy: Record<Locale, Copy> = {
  en: {
    openInbox: "Supplier inbox",
    title: "Supplier inbox",
    back: "Back to project",
    receivingOff:
      "Inbound mail is off. JAKOV360_INBOUND_MAIL_ENABLED is not true, so this screen does not receive supplier email.",
    receivingOnSynthetic:
      "Synthetic ingestion is enabled in this process. No live mail provider, DNS record, or Gmail inbox read is connected.",
    extractorNote:
      "Quote fields come from the deterministic fixture extractor, not a production model. They stay unreviewed until a person accepts each field.",
    gmailNote:
      "Gmail send-only cannot read replies. This milestone does not request gmail.readonly or gmail.metadata. A supplier who answers the visible From and ignores Reply-To is not captured automatically.",
    marketplaceNote:
      "Alibaba, Made-in-China, and 1688 chats are not collected. A manual import is a separate, still-unbuilt step.",
    empty: "No supplier replies are stored for this project.",
    original: "Original",
    serbian: "Serbian",
    attachments: "Attachments",
    download: "Download",
    downloadBlocked: "Download unavailable until the malware scan is clean",
    fields: "Parsed quote fields",
    review: "Review status",
    unreviewed: "Unreviewed",
    costNote:
      "Nothing on this screen is written into the landed-cost calculation. Confirming written evidence is not a purchase and is not an accepted order.",
    followUp: "Follow-up draft",
    unsent: "Not sent. A new approval of this exact text is required before any send, and this milestone still does not send mail.",
    activity: "Activity",
    delayed: "Ingestion is delayed after failed delivery attempts. The original RFQ was not resent and was not marked failed.",
    confirm: "Confirm written evidence",
    confirmBlocked: "Confirmation is unavailable",
    accept: "Accept field",
    reject: "Reject field",
    acknowledge: "Acknowledge unverified sender",
    noOrder: "This is not an order.",
    senderTrust: "Sender trust",
    scan: "Malware scan",
  },
  sr: {
    openInbox: "Sanduče dobavljača",
    title: "Sanduče dobavljača",
    back: "Nazad na projekat",
    receivingOff:
      "Prijem pošte je isključen. JAKOV360_INBOUND_MAIL_ENABLED nije true, pa ovaj ekran ne prima poštu dobavljača.",
    receivingOnSynthetic:
      "Sintetički prijem je uključen u ovom procesu. Nema živog poštanskog provajdera, DNS zapisa ni čitanja Gmail sandučeta.",
    extractorNote:
      "Polja ponude dolaze iz determinističkog fixture ekstraktora, ne iz proizvodnog modela. Ostaju nepregledana dok osoba ne prihvati svako polje.",
    gmailNote:
      "Samo slanje preko Gmail-a ne može da čita odgovore. Ova faza ne traži gmail.readonly ni gmail.metadata. Dobavljač koji odgovori na vidljivi From i zanemari Reply-To ne ulazi automatski.",
    marketplaceNote:
      "Četovi na Alibaba, Made-in-China i 1688 se ne prikupljaju. Ručni uvoz je poseban korak i još nije napravljen.",
    empty: "Za ovaj projekat nema sačuvanih odgovora dobavljača.",
    original: "Original",
    serbian: "Srpski",
    attachments: "Prilozi",
    download: "Preuzmi",
    downloadBlocked: "Preuzimanje nije dostupno dok malware provera nije čista",
    fields: "Pročitana polja ponude",
    review: "Status pregleda",
    unreviewed: "Nepregledano",
    costNote:
      "Ništa sa ovog ekrana ne ulazi u obračun ukupnog troška. Potvrda pisanog dokaza nije kupovina i nije prihvaćena porudžbina.",
    followUp: "Nacrt dodatnog pitanja",
    unsent: "Nije poslato. Pre slanja treba novo odobrenje tačnog teksta, a ova faza i dalje ne šalje poštu.",
    activity: "Aktivnost",
    delayed: "Prijem kasni posle neuspešnih pokušaja. Prvobitni upit nije ponovo poslat i nije označen kao neuspeo.",
    confirm: "Potvrdi pisani dokaz",
    confirmBlocked: "Potvrda nije dostupna",
    accept: "Prihvati polje",
    reject: "Odbij polje",
    acknowledge: "Potvrdi da je pošiljalac neproveren",
    noOrder: "Ovo nije porudžbina.",
    senderTrust: "Poverenje u pošiljaoca",
    scan: "Malware provera",
  },
  de: {
    openInbox: "Lieferantenposteingang",
    title: "Lieferantenposteingang",
    back: "Zurück zum Projekt",
    receivingOff:
      "Eingehende Post ist aus. JAKOV360_INBOUND_MAIL_ENABLED ist nicht true, daher empfängt dieser Bildschirm keine Lieferantenpost.",
    receivingOnSynthetic:
      "Synthetischer Empfang ist in diesem Prozess an. Kein echter Mailanbieter, kein DNS-Eintrag und kein Gmail-Lesen ist verbunden.",
    extractorNote:
      "Angebotsfelder kommen aus dem deterministischen Fixture-Extraktor, nicht aus einem Produktionsmodell. Sie bleiben ungeprüft, bis eine Person jedes Feld annimmt.",
    gmailNote:
      "Nur Gmail-Senden kann keine Antworten lesen. Dieser Meilenstein fordert weder gmail.readonly noch gmail.metadata an. Eine Antwort an die sichtbare From-Adresse ohne Reply-To wird nicht automatisch erfasst.",
    marketplaceNote:
      "Chats auf Alibaba, Made-in-China und 1688 werden nicht eingesammelt. Ein manueller Import ist ein separater, noch nicht gebauter Schritt.",
    empty: "Für dieses Projekt sind keine Lieferantenantworten gespeichert.",
    original: "Original",
    serbian: "Serbisch",
    attachments: "Anhänge",
    download: "Herunterladen",
    downloadBlocked: "Download gesperrt, bis der Malware-Scan sauber ist",
    fields: "Gelesene Angebotsfelder",
    review: "Prüfstatus",
    unreviewed: "Ungeprüft",
    costNote:
      "Nichts auf diesem Bildschirm wird in die Landed-Cost-Berechnung geschrieben. Bestätigtes Schriftdokument ist kein Einkauf und kein angenommener Auftrag.",
    followUp: "Rückfrageentwurf",
    unsent: "Nicht gesendet. Vor dem Senden braucht es eine neue Freigabe dieses genauen Textes, und dieser Meilenstein sendet weiterhin keine Post.",
    activity: "Aktivität",
    delayed: "Der Empfang ist nach fehlgeschlagenen Zustellversuchen verzögert. Die ursprüngliche Anfrage wurde nicht erneut gesendet und nicht als fehlgeschlagen markiert.",
    confirm: "Schriftlichen Nachweis bestätigen",
    confirmBlocked: "Bestätigung nicht verfügbar",
    accept: "Feld annehmen",
    reject: "Feld ablehnen",
    acknowledge: "Ungeprüften Absender zur Kenntnis nehmen",
    noOrder: "Dies ist kein Auftrag.",
    senderTrust: "Absendervertrauen",
    scan: "Malware-Scan",
  },
};

export function inboxCopy(locale: string): Copy {
  return copy[resolveLocale(locale)];
}

const fieldLabels: Record<string, Record<Locale, string>> = {
  unit_price_at_quantity: { en: "Price for the ordered quantity", sr: "Cena za naručenu količinu", de: "Preis für die bestellte Menge" },
  price_tiers: { en: "Price tiers", sr: "Cenovni razredi", de: "Preisstaffeln" },
  currency: { en: "Currency", sr: "Valuta", de: "Währung" },
  model: { en: "Model", sr: "Model", de: "Modell" },
  diopter_mix: { en: "Diopter and variant mix", sr: "Dioptrija i varijante", de: "Dioptrien und Varianten" },
  moq: { en: "MOQ", sr: "Minimalna količina", de: "Mindestmenge" },
  incoterm: { en: "Incoterm", sr: "Incoterm", de: "Incoterm" },
  named_place: { en: "Named place", sr: "Imenovano mesto", de: "Benannter Ort" },
  lead_time: { en: "Lead time", sr: "Rok isporuke", de: "Lieferzeit" },
  packaging: { en: "Packaging", sr: "Pakovanje", de: "Verpackung" },
  country_of_origin: { en: "Country of origin", sr: "Zemlja porekla", de: "Ursprungsland" },
  certificates: { en: "Certificates", sr: "Sertifikati", de: "Zertifikate" },
  quote_validity: { en: "Quote validity", sr: "Važenje ponude", de: "Angebotsgültigkeit" },
  payment_terms: { en: "Payment terms", sr: "Uslovi plaćanja", de: "Zahlungsbedingungen" },
  untrusted_instruction: { en: "Instruction found in the message", sr: "Uputstvo pronađeno u poruci", de: "Anweisung im Nachrichtentext" },
};

export function quoteFieldLabel(fieldKey: string, locale: string): string {
  return fieldLabels[fieldKey]?.[resolveLocale(locale)] ?? fieldKey;
}
