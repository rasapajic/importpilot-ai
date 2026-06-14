# Processing workers

Next.js request handleri samo potvrđuju upload i kreiraju `ProcessingJob`.

Budući zasebni worker procesi će preuzimati pipeline po fazama:

1. `OCR_EXTRACTION` čita privatni objekat i proizvodi strukturisani OCR izlaz.
2. `AI_EXTRACTION` koristi OCR izlaz za ekstrakciju podataka ponude.
3. `PROJECT_ANALYSIS` proizvodi rezultat analize projekta.

Nijedan processor još nije implementiran. Svi worker-i moraju koristiti
`JobQueue` interfejs za retry i dead-letter ponašanje i nikada ne smeju
obrađivati dokument unutar Next.js HTTP zahteva.

## Supplier offer extraction ugovor

`PreparedSupplierOfferWorker` implementira trodelni ugovor:

```text
extractText(file)
extractSupplierOffer(text)
saveExtractionResult(result)
```

Prve dve metode eksplicitno odbijaju izvršavanje dok OCR i AI provider nisu
konfigurisani. `saveExtractionResult` prihvata samo rezultat koji prolazi strogu
Zod šemu, proverava tenant/project/file vezu i zatim atomski čuva ponudu i
označava fajl završenim.
