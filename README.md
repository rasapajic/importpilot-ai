# ImportPilot AI

Za kompletno Windows lokalno demo okruženje, proveru Docker infrastrukture i
browser checklist koristite [LOCAL_DEMO.md](LOCAL_DEMO.md).

## Feedback & Analytics Layer

Project Outcome, recommendation feedback i completion promene čuvaju se kao
append-only tenant-scope istorija. Outcome snapshot pamti decision status koji
je važio u trenutku unosa, pa kasnija regeneracija preporuke ne menja istorijske
accuracy metrike.

Interni usage analytics računa broj projekata, ponude po projektu, prosečno
vreme do prve odluke, korišćenje pregovaračkih poruka i upload dokumenata.
Recommendation accuracy prati signale `READY_TO_BUY -> BOUGHT`,
`NEGOTIATE_FIRST -> NEGOTIATED` i `DO_NOT_BUY -> BOUGHT`.

Nema eksternog analytics servisa, tracking kolačića, AI poziva niti beleženja
privatnog sadržaja dokumenata i pregovaračkih poruka.

ImportPilot AI je platforma za evropske kompanije koje uvoze proizvode iz Kine.
Ovaj repozitorijum trenutno sadrži produkcionu osnovu Faze 1.

## Tehničke odluke

- **Modularni monolit:** jednostavnije postavljanje i održavanje u MVP fazi.
- **Next.js App Router:** frontend i serverski API dele jednu aplikaciju.
- **PostgreSQL i Prisma:** relacioni model, tipski bezbedni upiti i ponovljive migracije.
- **MinIO:** privatno S3-kompatibilno skladište za buduće ponude dobavljača.
- **Validacija okruženja:** aplikacija odmah prijavljuje nedostajuću ili neispravnu konfiguraciju.
- **Organizacije od početka:** svi budući poslovni podaci mogu biti izolovani po kompaniji.
- **Serverske sesije:** browser čuva samo neprozirni `HttpOnly` token, a baza njegov SHA-256 hash.
- **Argon2id:** lozinke se hash-uju algoritmom namenjenim zaštiti korisničkih lozinki.
- **Multi-tenant autorizacija:** svaka važeća sesija mora imati aktivno članstvo u organizaciji.
- **Audit i rate limit:** auth događaji se beleže, a pokušaji prijave i registracije ograničavaju kroz PostgreSQL.
- **EUR prikaz za Evropu:** originalne valute i obračuni ostaju nepromenjeni, dok UI koristi označeni referentni FX snapshot za EUR prikaz i poređenje. Ako kurs nije dostupan, prikazuje se samo originalna valuta.

## Preduslovi

- Node.js 24
- Docker sa Docker Compose dodatkom

## Pokretanje demo verzije

Demo je namenjen prvom upoznavanju sa proizvodom i može se pokrenuti za nekoliko
minuta:

```sh
docker compose up -d postgres minio minio-init
npm install
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

Otvorite `http://localhost:3000/login` i prijavite se:

```text
Email: owner@tradepilot.local
Lozinka: TradePilot-Dev-2026
```

Seed je idempotentan i kreira tri projekta sa po tri ponude:

```text
[DEMO] Električni čajnici — READY_TO_BUY
  tri uporedive EUR ponude sa jasnim uslovima

[DEMO] LED radne lampe — NEGOTIATE_FIRST / različite valute
  dve EUR i jedna USD ponuda, uz nedostatke za pregovore

[DEMO] Mini grejalice — DO_NOT_BUY
  visok rizik dobavljača i neodrživa ekonomika
```

Seed koristi isti landed-cost, scoring i decision engine kao aplikacija. Ako
engine ne proizvede očekivana tri statusa, seed se prekida sa jasnom greškom.
Demo seed je onemogućen kada je `NODE_ENV=production`.

## Lokalni razvoj

1. Napravite `.env` kopiranjem vrednosti iz `.env.example`.
2. Pokrenite PostgreSQL i MinIO:

   ```sh
   docker compose up postgres minio minio-init
   ```

3. Instalirajte zavisnosti i primenite migraciju:

   ```sh
   npm install
   npm run db:generate
   npm run db:migrate:deploy
   ```

4. Pokrenite aplikaciju:

   ```sh
   npm run dev
   ```

Aplikacija je dostupna na `http://localhost:3000`, a zdravstvena provera na
`http://localhost:3000/api/health`.

Registracija je dostupna na `http://localhost:3000/register`, prijava na
`http://localhost:3000/login`, a zaštićena kontrolna tabla na
`http://localhost:3000/dashboard`.

Za razvojnu proveru kompletnog supplier-search toka, dok aplikacija i provider
rade lokalno, pokrenite:

```powershell
npm run diagnose:supplier-search
```

Uspešni supplier-search odgovori čuvaju se u PostgreSQL cache-u. Ako live
provider nije dostupan, aplikacija vraća poslednji provereni rezultat za isti
normalizovani upit, količinu i ciljnu zemlju i označava ga kao keširan.

Provereni provider fixture ili normalizovani JSON može se ručno učitati u
lokalni cache za MVP demo:

```powershell
npm run cache:import-supplier-fixture -- --file services/importpilot-search-provider/tests/fixtures/made-in-china-product-name-search.html --provider made-in-china --query "punjac za telefon typ c" --quantity 100 --target-country RS
```

Podržani `--provider` formati su `alibaba`, `made-in-china` i `json`. Komanda
validira normalizovane rezultate i nikada ne čuva raw HTML.

Komanda proverava env konfiguraciju, provider health/auth/search i aplikacioni
supplier-search API bez ispisivanja tokena.

## Kompletno Docker okruženje

```sh
docker compose up --build
```

Docker Compose prvo proverava PostgreSQL i MinIO, zatim primenjuje migracije i
tek onda pokreće aplikaciju.

## Provere kvaliteta

```sh
npm run lint
npm run typecheck
npm run build
```

## Bezbednost

Vrednosti u Docker Compose fajlu služe samo za lokalni razvoj. U produkciji se
moraju zameniti tajnama iz sistema za upravljanje tajnama. MinIO bucket je
privatan, a poslovni podaci će biti vezani za organizaciju.

## Tok autentifikacije

### Registracija

`POST /api/auth/register` validira zahtev i rate limit, hash-uje lozinku pomoću
Argon2id algoritma, a zatim u jednoj transakciji kreira korisnika, organizaciju,
`OWNER` članstvo, sesiju i audit događaj. Email verifikacija još nije uključena.

### Prijava i sesije

`POST /api/auth/login` proverava rate limit po IP adresi i email adresi. Uspešna
prijava kreira novu, nezavisnu sesiju, zbog čega korisnik može biti prijavljen
na više uređaja. Browser dobija samo nasumični `HttpOnly`, `SameSite=Lax`
cookie; PostgreSQL čuva njegov SHA-256 hash.

Sesije imaju apsolutni rok od 30 dana. Token stariji od jednog dana rotira se
atomskim ažuriranjem pri prolasku kroz zaštićenu rutu. Rotacija ne produžava rok
sesije i bezbedna je kada stignu paralelni zahtevi. Istekle sesije se odbijaju i
uklanjaju pri proveri.

### Odjava i autorizacija

`POST /api/auth/logout` briše samo trenutnu sesiju i njen cookie, bez prekidanja
drugih aktivnih sesija. Zaštićene stranice i API rute proveravaju sesiju i
članstvo u aktivnoj organizaciji na serveru. Uloge su `OWNER`, `ADMIN` i
`MEMBER`.

Registracija, uspešna i neuspešna prijava i odjava beleže se u append-only
`audit_events` tabeli. Lozinke i session tokeni se nikada ne beleže.

## Development seed

Nakon primene migracija:

```sh
npm run db:seed
```

Seed kreira razvojnu organizaciju, owner korisnika i uzorak sesije. Komanda
ispisuje razvojni email, lozinku i session cookie. Seed se ne pokreće automatski
u produkciji.

## Auth metrike

Zaštićeni endpoint `GET /api/metrics` dostupan je samo `OWNER` i `ADMIN`
članovima i vraća Prometheus tekstualni format:

```text
auth_success_total
auth_failed_total
active_sessions
```

## Integracioni testovi

Testovi koriste stvarnu, zasebnu PostgreSQL bazu i pokrivaju registraciju,
prijavu, odjavu, zaštitu dashboarda, uloge, istek sesije, rotaciju cookie-ja i
paralelne sesije.

```sh
# TEST_DATABASE_URL mora pokazivati isključivo na test bazu.
TEST_DATABASE_URL=postgresql://... npm run test:integration
```

Migracije moraju biti primenjene na test bazu pre pokretanja testova. Kada
`TEST_DATABASE_URL` nije postavljen, testovi se bezbedno preskaču.

## Import projekti

Svaki projekat pripada jednoj organizaciji i sadrži naziv, ISO alpha-2 ciljnu
zemlju, količinu, ciljnu maržu, autora i status:

```text
DRAFT → COLLECTING_OFFERS → ANALYZING → READY
```

Dashboard izvršava pretragu, filtere i paginaciju direktno u PostgreSQL-u.
Serverski upiti uvek uključuju `organizationId` iz validirane sesije.

## Ingestion pipeline

Sadržaj fajlova nikada ne prolazi kroz Next.js request handler:

```text
Browser
  → kratkotrajni presigned MinIO PUT URL
  → direktan upload u privatni bucket
  → Next.js potvrda i provera objekta
  → UploadedFile metadata + ProcessingJob u jednoj transakciji
  → budući OCR worker
  → budući AI extraction worker
  → budući analysis rezultat
```

Browser računa SHA-256 checksum. Presigned upload zahteva MIME tip i checksum
metadata, a završni endpoint proverava veličinu, MIME tip, checksum i tenant
prefiks storage ključa pre upisa u bazu.

PostgreSQL queue implementira stabilan `JobQueue` interfejs:

```text
enqueue()
retry()
deadLetter()
```

Poslovi podržavaju zakazani retry, maksimalan broj pokušaja i dead-letter
status. OCR i AI procesori namerno još nisu implementirani; Next.js samo kreira
posao i nikada ne obrađuje dokument unutar HTTP zahteva.

## Supplier offer extraction priprema

`SupplierOffer` čuva strukturisanu ponudu dobavljača i opcionu vezu ka izvornom
fajlu. Budući extraction rezultat mora proći strogu Zod šemu: nepoznata polja se
odbijaju, nedostajuće vrednosti moraju biti eksplicitno `null`, a cena i valuta
moraju biti navedene zajedno.

Korisnik može ručno dodati ponudu bez fajla ili ispraviti ekstraktovanu ponudu.
Korekcija ekstraktovane ponude menja status u `REVIEWED`. Svi CRUD upiti ponovo
proveravaju projekat ili ponudu unutar aktivne organizacije; tenant identifikator
se nikada ne prihvata iz browser zahteva.

## Landed cost formula

Kalkulator je čist TypeScript servis bez AI-a, eksternih API-ja ili promenljivih
izvora podataka. Koristi isključivo podatke ponude, projekta i ručno unete
pretpostavke:

```text
goodsCost = unitPrice × quantity
customsBase = goodsCost + shippingCost
customsDutyAmount = customsBase × customsDutyRate
vatBase = customsBase + customsDutyAmount + inspectionCost + otherCosts
vatAmount = vatBase × vatRate

landedCostTotal =
  goodsCost + shippingCost + customsDutyAmount + vatAmount
  + storageCost + inspectionCost + otherCosts

landedCostPerUnit = landedCostTotal ÷ quantity
breakEvenPrice = landedCostPerUnit
grossMarginPercent =
  ((targetSellingPrice - landedCostPerUnit) ÷ targetSellingPrice) × 100
```

Cena ponude zadržava četiri decimale dok se ne pomnoži količinom. Svi novčani
međurezultati zatim se računaju u celim minor jedinicama pomoću `bigint` i
zaokružuju half-up na dve decimale. Stope podržavaju četiri decimale.

Stope carine, PDV-a i dodatni troškovi su korisničke pretpostavke; aplikacija ne
poziva carinske ili poreske API-je. Svaki scenario se čuva kao nova kalkulacija
sa statusom `CALCULATED` ili `NEEDS_REVIEW`, tako da istorija ostaje dostupna.

## Supplier Offer Intelligence

Ocena ponude je deterministička, objašnjiva i verzionisana. AI se ne poziva i
ne može menjati score, status ili činjenice. Svako ponovno ocenjivanje kreira
novi `OfferAssessment`; prethodni zapisi ostaju dostupni.

### Supplier risk score

Risk score je `0-100`, gde je manja vrednost bolja:

```text
dobavljač nije verifikovan        do 20
malo godina na platformi          do 10
nizak response rate               do 15
MOQ ne odgovara projektu          do 15
nejasni komercijalni uslovi       do 15
nejasan transport                 do 10
sumnjivo niska cena               do 15
```

Sumnjivo niska cena se ocenjuje samo kada postoje najmanje tri ponude iste
valute. Ponude različitih valuta nisu direktno uporedive bez FX konverzije.
Zemlja dobavljača povećava confidence kada je poznata, ali sama ne dodaje risk
poene bez spoljnog, verzionisanog country-risk izvora.

Nedostajući podaci ne dodaju automatski risk. Oni smanjuju confidence ocene.

### Offer quality score

Quality score je `0-100`, gde je veća vrednost bolja:

```text
landed cost i bruto marža         do 30
jasnoća transporta                do 10
rok isporuke                      do 15
MOQ uklapanje                     do 10
naveden Incoterm                  do 10
dostupnost uzorka                 do 10
jasnoća ponude                    do 15
```

Za nepoznate quality podatke koristi se neutralna srednja vrednost i confidence
se smanjuje.

### Ukupna ocena i preporuka

```text
overallScore =
  offerQualityScore × 60%
  + (100 - supplierRiskScore) × 40%
```

Pravila preporuke:

```text
RECOMMENDED
  overallScore >= 80, risk <= 30, landed cost postoji, nema kritičnih upozorenja

OK_WITH_RISK
  overallScore >= 65 i risk <= 55

NEEDS_NEGOTIATION
  overallScore >= 45

NOT_RECOMMENDED
  overallScore < 45 ili postoji kritično upozorenje
```

Objašnjenje se generiše deterministički isključivo iz score breakdown-a i
poznatih činjenica. Comparison view grupiše ponude po valuti i prikazuje
najbolju ukupnu cenu, najmanji rizik, najbržu isporuku i najbolju maržu za
preprodaju unutar svake valutne grupe.

## Final Project Decision

Project Decision pretvara najnovije landed-cost kalkulacije i assessment-e u
verzionisanu Buy / Don’t Buy odluku. Svako ponovno generisanje kreira novi
`ProjectDecision` snapshot; prethodne odluke i print/PDF izveštaji ostaju
istorijski stabilni.

Primarna uporediva grupa je valuta sa najvećim brojem ponuda. U slučaju istog
broja koristi se stabilan abecedni izbor valute. Ponude drugih valuta i ponude
bez valute označavaju se kao neuporedive i ne učestvuju u izboru najbolje
ukupne ponude.

Statusi:

```text
NEED_MORE_OFFERS
  manje od 3 ponude, manje od 2 ocenjene ponude ili manje od 2 uporedive ponude

DO_NOT_BUY
  najbolja uporediva ponuda ima NOT_RECOMMENDED status

READY_TO_BUY
  najbolja ponuda je RECOMMENDED, risk <= 30, confidence >= 70,
  transport i Incoterm su jasni, uzorak postoji, kalkulacija ne zahteva proveru

NEGOTIATE_FIRST
  postoje popravljivi nedostaci pre kupovine
```

Checklist se generiše isključivo iz poznatih činjenica najbolje ponude:
uzorak, Incoterm, jasnoća transporta, MOQ, landed-cost/carinska provera i broj
uporedivih ponuda. Print-friendly project summary može se štampati ili sačuvati
kao PDF direktno iz browsera, bez dodatne PDF biblioteke.

## Negotiation Assistant

Kada poslednja projektna odluka ima status `NEGOTIATE_FIRST`, Negotiation
Assistant pretvara odluku i njen checklist u predlog poruke dobavljacu na
engleskom. Generator je cist i deterministicki
TypeScript servis, bez eksternih AI poziva.

Podrzani tonovi su `FORMAL`, `DIRECT` i `FRIENDLY`. Ton menja samo stil pozdrava,
uvoda i zavrsetka. Ne menja zahteve, brojeve, rizike, score ili preporuku.

Zahtevi se izvode iz poslednjeg `ProjectDecision` snapshot-a:

```text
REQUEST_SAMPLE       -> sample request
CONFIRM_INCOTERM     -> potvrda Incoterm-a i imenovanog mesta/luke
CONFIRM_SHIPPING     -> potvrda transporta, troska i roka
NEGOTIATE_MOQ        -> zahtev za nizi MOQ u odnosu na planiranu kolicinu
status nije READY_TO_BUY -> zahtev za bolju cenu
svaka poruka         -> zahtev za finalnu proforma fakturu
```

Brojevi i cinjenice se kopiraju u `lockedFacts` prilikom generisanja poruke.
Ako podatak ne postoji, generator trazi potvrdu bez izmisljanja ciljne cene,
MOQ-a ili drugih cinjenica. Svako generisanje kreira novi `NegotiationMessage`
sa statusom `PROPOSED`; prethodne verzije ostaju dostupne. Status `SENT` samo
belezi da je korisnik poruku poslao van sistema i ne menja njen sadrzaj.

## Import Document Vault

Svaki projekat ima privatni Document Vault za ponude, proforma fakture,
transportne ponude, slike proizvoda i ostale dokumente. Dokument pripada
projektu i opciono moze biti povezan sa konkretnom ponudom.

Browser direktno uploaduje dokument u privatni MinIO bucket preko kratkotrajnog
potpisanog URL-a. Next.js pre potpisivanja i potvrde upload-a proverava projekat,
organizaciju i opcionu ponudu. Storage kljuc sadrzi organizacioni i projektni
prefiks, ali se nikada ne prihvata kao autorizacioni dokaz.

Download endpoint prvo tenant-scope proverava metapodatke, pa izdaje potpisani
URL koji traje pet minuta. Delete endpoint takodje prvo proverava tenant, zatim
brise objekat iz MinIO-a i njegov PostgreSQL zapis.

Samo dokument tipa `OFFER` zadrzava postojeci OCR/extraction queue tok. Tipovi
`PROFORMA`, `SHIPPING_QUOTE`, `PRODUCT_IMAGE` i `OTHER` se cuvaju bez processing
posla. U ovom koraku nema nove OCR ili AI analize dokumenata.

## Project Timeline

Svaki projekat ima append-only timeline poslovnih događaja: kreiranje projekta,
dodavanje ponude, landed-cost kalkulaciju, assessment, finalnu odluku,
generisanje i slanje pregovaračke poruke, kao i upload i brisanje dokumenta.

Događaj se čuva u istoj PostgreSQL transakciji kao poslovni zapis gde god je to
moguće. Timeline čuva kratak naslov, opis i minimalni JSON snapshot potreban da
istorija ostane razumljiva i nakon kasnijih izmena ili brisanja povezanog
zapisa. Ne čuva storage ključeve, sadržaj poruka ili AI podatke.

Čitanje i filtriranje po tipu događaja uvek proverava projekat unutar aktivne
organizacije. Project stranica prikazuje najnovijih 100 događaja. Timeline nema
AI funkcije i ne menja poslovne odluke.
# Multilingual UI

ImportPilot supports English (`en`), German (`de`) and Serbian Latin (`sr`) through local translation dictionaries. The selector is displayed in the order `EN | DE | SR`; English is the default and the selected language is stored in the `tradepilot_locale` cookie.

User-facing translations and status labels live in `modules/i18n/translations.ts`. Internal database enum values remain unchanged. Add new visible text to the local dictionary and use `getStatusLabel()` when a business status needs an explicit localized label. Unsupported or missing locales fall back to English.

## Supplier Offer Search

Project pages expose a server-side supplier offer search. The browser sends only
the product query; the application layer inherits quantity and target country
from the tenant-scoped project. Search results are validated with a strict Zod
contract and selected results are stored as `SupplierOffer` records with source
`SEARCH_RESULT` and minimal structured source metadata. Raw HTML is never stored.

Search runs automatically when the offer step opens, using the project product
name, quantity and target country. Configure a real structured provider with:

```env
SUPPLIER_SEARCH_PROVIDER_URL=https://provider.example/search
SUPPLIER_SEARCH_PROVIDER_HEALTH_URL=https://provider.example/health
SUPPLIER_SEARCH_PROVIDER_TOKEN=optional-secret-token
```

ImportPilot sends a server-side `POST` request containing `query`, `quantity`
and `targetCountry`:

```json
{
  "query": "3MP PTZ camera",
  "quantity": 100,
  "targetCountry": "RS"
}
```

The provider must return `{ "results": [...] }` or the result array directly:

```json
{
  "results": [{
    "title": "3MP PTZ Camera",
    "supplierName": "Supplier Ltd",
    "supplierCountry": "CN",
    "price": 25,
    "currency": "USD",
    "minimumOrderQuantity": 50,
    "incoterm": "FOB",
    "productUrl": "https://supplier.example/ptz",
    "imageUrl": "https://supplier.example/ptz.jpg",
    "source": "provider-name"
  }]
}
```

Missing optional fields must be `null` or omitted. Raw HTML and unknown fields
are rejected. Requests include a stable `Idempotency-Key`; temporary network,
timeout, `408`, `429` and `5xx` failures are retried once. Identical validated
searches, including empty results, are cached in memory for 10 minutes.
Responses are limited to 1 MB and 8 seconds.

The optional health URL must accept a server-side `GET` and return any `2xx`
response. In development, `/api/health` and the search UI expose one of:
`Provider connected`, `Provider not configured`, or `Provider error`.
Provider failures never block the project page; the search returns an empty
state and manual URL import remains available.

A standalone reference service is available in
`services/importpilot-search-provider`. Its README documents local startup,
security controls and the source-adapter contract.

### URL import provider

`Uvezi iz linka` performs a server-side, best-effort import from a supplier
product page. Only HTTPS URLs are accepted. Local/private hosts, redirects,
responses larger than 1 MB and responses slower than 8 seconds are rejected.
The provider reads HTML only in memory, extracts JSON-LD and visible metadata,
then discards the HTML. It never persists raw page content.

Because supplier pages differ, every URL import opens a review form. Missing or
incorrect fields must be corrected by the user before the existing
`SEARCH_RESULT` import flow creates the offer. The saved source metadata contains
the product URL, image URL, title and source hostname; scoring logic is unchanged.

If the deployment environment blocks outbound HTTPS from Node.js, configure an
external URL import provider:

```env
URL_IMPORT_PROVIDER_URL=https://provider-domain/preview
URL_IMPORT_PROVIDER_TOKEN=replace-with-a-long-random-token
```

For local testing with the standalone provider service:

```env
URL_IMPORT_PROVIDER_URL=http://localhost:4100/preview
URL_IMPORT_PROVIDER_TOKEN=dev-url-import-token
```

When configured, ImportPilot sends `POST { "productUrl": "https://..." }` with a
Bearer token when provided. The provider should return `{ "preview": { ... } }`
or the preview object directly. The standalone local service lives in
`services/importpilot-url-import-provider`, runs on port `4100`, and returns
`productTitle`, `supplierName`, `price`, `currency`, `minimumOrderQuantity`,
`incoterm`, `productUrl` and `imageUrl`. ImportPilot maps `productTitle` into
the existing internal `title` field, so UI and business logic stay unchanged.

The local port layout is:

- ImportPilot app: `3000`
- Supplier search provider: `4000`
- URL import provider: `4100`

If the external provider fails, the existing manual fallback remains available
and ImportPilot can still prefill a product name from the URL slug.

Deployment instructions are in `DEPLOY_URL_IMPORT_PROVIDER.md`.
For the simplest Render flow, use `DEPLOY_RENDER_STEP_BY_STEP.md`.
