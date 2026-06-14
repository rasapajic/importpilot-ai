# ImportPilot AI — lokalni demo na Windows-u

Ovaj vodič pokreće kompletan ImportPilot demo sa PostgreSQL bazom i privatnim
MinIO skladištem. Komande su namenjene PowerShell-u i pokreću se iz korena
projekta.

## Potrebni alati

- Windows 10 ili Windows 11
- Docker Desktop
- Node.js 24

Instalirajte Docker Desktop sa `https://www.docker.com/products/docker-desktop/`.
Tokom instalacije prihvatite preporučenu WSL 2 konfiguraciju. Pokrenite Docker
Desktop i sačekajte da engine bude spreman.

## Provera Docker instalacije

U novom PowerShell prozoru pokrenite:

```powershell
docker --version
docker compose version
docker info
```

Prve dve komande moraju prikazati verzije. `docker info` mora prikazati podatke
o Docker serveru bez greške o povezivanju sa daemon-om.

## Konfiguracija okruženja

```powershell
Copy-Item .env.example .env
```

Za podrazumevani Docker Compose setup nisu potrebne izmene. Važne vrednosti su:

```text
DATABASE_URL=postgresql://tradepilot:tradepilot@localhost:5432/tradepilot?schema=public
S3_ENDPOINT=http://localhost:9000
S3_PUBLIC_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=tradepilot
S3_SECRET_KEY=change-this-local-secret
```

Ne koristite ove razvojne kredencijale u produkciji.

## Pokretanje PostgreSQL-a i MinIO-a

```powershell
docker compose up -d postgres minio minio-init
```

`postgres` pokreće bazu, `minio` privatno skladište, a `minio-init` kreira
privatni bucket i podešava CORS.

## Provera zdravlja kontejnera

```powershell
docker compose ps
docker compose logs postgres --tail 30
docker compose logs minio --tail 30
docker compose logs minio-init --tail 30
```

Očekivano stanje:

- `postgres`: `running` i `healthy`
- `minio`: `running` i `healthy`
- `minio-init`: završen sa izlaznim kodom `0`

Proverite portove:

```powershell
Test-NetConnection localhost -Port 5432
Test-NetConnection localhost -Port 9000
```

Obe komande treba da prikažu `TcpTestSucceeded : True`.

## Prisma migracije

```powershell
npm install
npm run db:generate
npm run db:migrate:deploy
npx prisma validate
```

## Demo seed

```powershell
npm run db:seed
```

Seed kreira demo organizaciju, owner korisnika, sesiju i tri projekta:

- `[DEMO] Električni čajnici — READY_TO_BUY`
- `[DEMO] LED radne lampe — NEGOTIATE_FIRST / različite valute`
- `[DEMO] Mini grejalice — DO_NOT_BUY`

Seed koristi stvarni calculator, scoring i decision engine. Komanda namerno
prekida izvršavanje ako projekti ne dobiju očekivane statuse.

## Pokretanje aplikacije

```powershell
npm run dev
```

Otvorite:

- ImportPilot: `http://localhost:3000`
- MinIO konzola: `http://localhost:9001`

Za pokretanje kompletne aplikacije unutar Docker-a:

```powershell
docker compose up --build
```

## Demo kredencijali

```text
Email: owner@tradepilot.local
Lozinka: TradePilot-Dev-2026
```

## Browser verifikaciona lista

### Prijava i dashboard

- Prijava demo korisnika uspeva.
- Dashboard prikazuje tri `[DEMO]` projekta.
- Pretraga i status filter rade.

### Demo odluke

- Električni čajnici prikazuju `READY_TO_BUY`.
- LED radne lampe prikazuju `NEGOTIATE_FIRST`.
- Mini grejalice prikazuju `DO_NOT_BUY`.
- Projekat sa lampama jasno odvaja EUR i USD ponude.

### Ponude i istorije

- Svaka ponuda prikazuje landed-cost rezultat.
- Offer Intelligence prikazuje ocenu, rizik, preporuku i assessment istoriju.
- Ponovno ocenjivanje dodaje novu istorijsku procenu.
- Ponovno generisanje finalne odluke čuva novu odluku.

### Negotiation Assistant

- Dostupan je na `NEGOTIATE_FIRST` projektu.
- Formalni, direktni i prijateljski ton menjaju stil poruke.
- Generisana poruka se pojavljuje u istoriji.
- Označavanje poruke kao poslate menja status u `SENT`.

### Document Vault

- Upload PDF-a ili slike uspeva.
- Dokument se pojavljuje u Vault listi.
- Download vraća isti dokument.
- Delete uklanja dokument.
- Timeline prikazuje upload i delete događaje.

### Timeline i PDF

- Project Timeline prikazuje aktivnosti najnovije prvo.
- Filter po tipu događaja radi.
- `Print / PDF` prikazuje sažetak finalne odluke.
- Browser print preview je čitljiv i bez navigacionih kontrola.

### Mobilni prikaz

- U browser developer alatima uključite responsive/mobile prikaz.
- Proverite širinu od približno `390px`.
- Dashboard, ponude, forme, Vault i Timeline ne izlaze van ekrana.
- Dugmad i input polja ostaju dostupni bez horizontalnog skrolovanja.

## Troubleshooting

### Docker nije instaliran

Simptom: PowerShell ne prepoznaje komandu `docker`.

1. Instalirajte i pokrenite Docker Desktop.
2. Zatvorite i ponovo otvorite PowerShell.
3. Ponovite `docker --version` i `docker info`.

### Docker daemon nije pokrenut

Simptomi uključuju `Cannot connect to the Docker daemon`,
`dockerDesktopLinuxEngine` ili neuspešan `docker info`.

1. Pokrenite Docker Desktop.
2. Sačekajte da engine bude spreman.
3. Ako problem ostane, restartujte Docker Desktop.
4. Ponovite `docker info`.

### Port 5432 ili 9000 je zauzet

Pronađite proces:

```powershell
Get-NetTCPConnection -LocalPort 5432,9000 -ErrorAction SilentlyContinue |
  Select-Object LocalPort,State,OwningProcess
Get-Process -Id <OwningProcess>
```

Zaustavite konfliktni servis ili promenite host port u `docker-compose.yml`.
Ako menjate PostgreSQL port, uskladite `DATABASE_URL`. Ako menjate MinIO port,
uskladite `S3_ENDPOINT` i `S3_PUBLIC_ENDPOINT`.

### `DATABASE_URL` nedostaje

Simptom: `Environment variable not found: DATABASE_URL`.

```powershell
Test-Path .env
Get-Content .env
Copy-Item .env.example .env
```

Poslednju komandu koristite samo ako `.env` ne postoji.

### MinIO kredencijali nedostaju

Proverite da `.env` sadrži:

```text
S3_ACCESS_KEY=tradepilot
S3_SECRET_KEY=change-this-local-secret
```

Iste vrednosti moraju postojati u `docker-compose.yml` kao `MINIO_ROOT_USER` i
`MINIO_ROOT_PASSWORD`. Zatim ponovo pokrenite MinIO:

```powershell
docker compose up -d --force-recreate minio minio-init
```

### Seed pada na proveri očekivanih statusa

To znači da je promena calculator/scoring/decision pravila promenila demo
rezultat. Nemojte uklanjati proveru niti ručno menjati status u bazi.

1. Pokrenite `npm test`.
2. Pregledajte promenu poslovnih pravila.
3. Ako je promena namerna, prilagodite samo ulazne činjenice demo ponuda.
4. Ponovo pokrenite `npm run db:seed`.

## Zaustavljanje demo okruženja

Zaustavljanje uz čuvanje podataka:

```powershell
docker compose down
```

Potpuno brisanje lokalnih demo podataka:

```powershell
docker compose down -v
```

Komanda sa `-v` trajno briše lokalne PostgreSQL i MinIO volumene.
