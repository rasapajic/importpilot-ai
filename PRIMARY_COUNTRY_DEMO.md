# ImportPilot — RS / AT / DE landed-cost demo

Ovaj demo kreira tri projekta sa istim proizvodom, količinom, dobavljačem i troškovima, ali sa različitom ciljnom zemljom:

- Srbija (`RS`) — početna PDV pretpostavka 20%
- Austrija (`AT`) — početna PDV pretpostavka 20%
- Nemačka (`DE`) — početna PDV pretpostavka 19%

Time se u browseru direktno proveravaju country profil, razlaganje troškova, ukupna cena po komadu i marža.

## Pokretanje

Iz korena projekta, na grani `feature/primary-country-demo`:

```powershell
docker compose up -d postgres minio minio-init
npm install
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run db:seed:country-costs
npm run dev
```

Otvorite:

```text
http://localhost:3000/login
```

Demo prijava:

```text
Email: owner@tradepilot.local
Lozinka: TradePilot-Dev-2026
```

## Projekti za proveru

Na dashboardu treba da se pojave:

```text
[DEMO][LANDED-COST][RS] Pametni organizatori
[DEMO][LANDED-COST][AT] Pametni organizatori
[DEMO][LANDED-COST][DE] Pametni organizatori
```

Sva tri projekta koriste iste ulazne vrednosti:

```text
Količina: 100
Cena proizvoda: 10 EUR
Transport unutar Kine: 100 EUR
Međunarodni transport: 800 EUR
Osiguranje: 50 EUR
Carinska stopa: 5%
Špediter/carinjenje: 150 EUR
Inspekcija: 100 EUR
Skladištenje: 80 EUR
Ostalo: 50 EUR
Planirana prodajna cena: 40 EUR
```

## Browser provera

Za svaki projekat:

1. Otvorite projekat.
2. Otvorite `Da li se isplati?`.
3. Kliknite `Prikaži detalje`.
4. Otvorite ponudu dobavljača.
5. Proverite da je prikazan odgovarajući country code i profile version.
6. Proverite razlaganje transporta, osiguranja, carine, PDV-a i špeditera.
7. Kliknite `Izmeni vrednosti za kalkulaciju`.
8. Proverite da su prethodno sačuvane vrednosti vraćene u odgovarajuća polja.
9. Sačuvajte novi scenario i proverite da prethodna kalkulacija nije prepisana.

Očekivanje: RS i AT imaju isti rezultat jer koriste isti početni PDV od 20%. DE ima nešto nižu ukupnu cenu jer country profil koristi početnu pretpostavku od 19%.

## Važna ograničenja

- PDV je početna pretpostavka country profila, ne individualni poreski savet.
- Carinska stopa i tarifni broj nisu automatski pravno potvrđeni.
- Transport i carina moraju ostati vidljive i izmenjive korisničke pretpostavke.
