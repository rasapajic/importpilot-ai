# ImportPilot 1.0 — Release, Backup & Rollback Runbook

Ovaj dokument je release gate za produkciju. Produkcioni deploy se ne smatra završenim dok svi obavezni koraci nisu potvrđeni.

## 1. Pre-deploy gate

Obavezno pre svakog produkcionog deploy-a:

1. CI na tačnom release commit-u je zelen: lint, typecheck, svi unit + DB integration testovi i production build.
2. `npm run check:production-config` vraća `IMPORTPILOT_PRODUCTION_CONFIG PASS` u ciljnom produkcionom okruženju.
3. `/api/health` trenutne produkcije vraća HTTP 200 i `database: "ok"`.
4. Napravljen je svež PostgreSQL backup i zabeležen SHA-256/checksum.
5. Napravljen je backup privatnog object-storage bucket-a ili je potvrđena versioning/snapshot politika provajdera.
6. Zabeležen je trenutno aktivni application commit/tag radi brzog rollback-a.

## 2. PostgreSQL backup

Koristiti custom-format dump zato što omogućava selektivni i paralelni restore.

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="importpilot-predeploy-$(date +%Y%m%d-%H%M%S).dump"
```

Posle dump-a obavezno napraviti checksum i sačuvati ga zajedno sa backup-om:

```bash
sha256sum importpilot-predeploy-*.dump
```

Backup mora biti van istog runtime/storage failure domena kao produkciona baza. Backup koji nikada nije testiran restore-om ne smatra se dovoljnim dokazom oporavka.

## 3. Restore test

Periodično i pre 1.0 release-a uraditi restore u praznu, privremenu bazu:

```bash
createdb importpilot_restore_test
pg_restore \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --dbname="postgresql://.../importpilot_restore_test" \
  importpilot-predeploy-YYYYMMDD-HHMMSS.dump
```

Zatim pokrenuti najmanje: Prisma connectivity check, broj migracija, login/session smoke test i čitanje jednog projekta sa ponudama. Privremenu bazu posle provere obrisati.

## 4. Migracije

Pre deploy-a:

```bash
npx prisma migrate status
```

U produkciji se primenjuje samo:

```bash
npm run db:migrate:deploy
```

Nikada ne koristiti `prisma migrate dev`, `db push`, ručno menjanje schema tabela ili destructive reset nad produkcionom bazom.

Migracije tretirati kao forward-only. Ako nova aplikacija ne radi, prvo rollback-ovati application image/commit. Restore baze je poslednja mera i koristi se samo kada je migracija promenila/oštetila podatke na način koji starija aplikacija ne može bezbedno da čita.

## 5. Object storage

Privatni bucket mora ostati private. Pre 1.0 potvrditi jednu od sledećih politika:

- provider snapshot/versioning; ili
- periodični server-side sync u odvojeni backup bucket/account.

Backup mora obuhvatiti originalne uploadovane dokumente i product-image objekte koji su potrebni postojećim projektima. Ne koristiti public-read kao backup mehanizam.

## 6. Deploy redosled

1. Zaključati release commit/tag.
2. Potvrditi backup baze i object storage-a.
3. Primeni migracije.
4. Deploy aplikaciju.
5. Deploy/verify Search Provider i URL Import Provider sa odgovarajućim tokenima.
6. Proveri `/api/health`.
7. Izvrši smoke checklist iz sledećeg odeljka.
8. Tek nakon smoke PASS označiti release kao uspešan.

## 7. ImportPilot 1.0 smoke checklist

Obavezno proveriti na produkciji:

- email registracija i prijava;
- Google prijava i povezivanje sa postojećim nalogom istog verifikovanog email-a;
- logout i ponovna prijava;
- korisnik iz jedne organizacije ne može čitati projekat/ponudu druge organizacije;
- kreiranje projekta;
- URL preview i import konkretne ponude;
- jedan kontrolisani LIVE supplier-search zahtev;
- ponovno otvaranje projekta koristi sačuvane/cache rezultate bez automatskog plaćenog search poziva;
- landed-cost računica ostaje `NEEDS_REVIEW` dok transport/carinska stopa nisu potvrđeni; za zemlju bez versioned country profila potreban je i ručno potvrđen VAT (`MANUAL_OVERRIDE`);
- recommendation/decision ekran se otvara bez beskonačnog spinner-a;
- upload/download privatnog dokumenta;
- `/api/health` ostaje 200 posle smoke testa.

## 8. Application rollback

Ako health ili smoke test ne prođe:

1. zaustaviti dalji rollout;
2. vratiti prethodni poznato-dobar application image/commit;
3. ne vraćati bazu automatski;
4. proveriti `/api/health` i osnovni login/project read;
5. ako je baza kompatibilna sa starom aplikacijom, incident je ograničen na application rollback;
6. ako je dokazano da je migracija oštetila ili nepovratno transformisala podatke, tek tada aktivirati DB restore iz pre-deploy backup-a.

## 9. Incident pravilo

Kod nejasnog stanja ImportPilot mora da pogreši ka bezbednijem ishodu:

- nedostupna baza → health 503, ne lažni `ok`;
- nepotvrđen landed cost → `NEEDS_REVIEW`, ne `CALCULATED`;
- nepoznat supplier/commercial podatak → `null` / nepotvrđeno, ne pretpostavka;
- provider timeout → kontrolisana greška/partial rezultat, ne beskonačan spinner;
- neproverena OAuth email adresa → nema prijave niti account linking-a.
