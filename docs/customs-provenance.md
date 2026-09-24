# Customs Duty Provenance

ImportPilot keeps landed-cost formulas deterministic. Customs duty can be used in
the calculator, but the UI marks the result as waiting for confirmation until the
rate is explicitly confirmed from an official source or by the user.

## Official Sources

- EU imports: European Commission TARIC.
  https://taxation-customs.ec.europa.eu/online-services/online-services-and-databases-customs/eu-customs-tariff-taric_en
- Serbia imports: Serbian Customs TARIS and Customs Tariff documents.
  https://carina.rs/sr/privreda/tarifski-poslovi/taris.html
  https://www.carina.rs/en/documents.html

## MVP Rule

- `suggested`: the HS code or duty rate is only a suggestion. The calculation is
  useful for orientation, but the total is shown as not confirmed.
- `official`: the rate was checked against an official tariff source. The
  calculation can be displayed as confirmed when the other cost inputs are also
  confirmed.
- `manual`: the user entered the rate manually. The calculation stays explainable
  and auditable, but ImportPilot should still encourage checking the official
  tariff before purchase.

The next smallest reliable integration is not scraping these pages. It is adding
a tariff lookup adapter that stores source, HS code, origin country, checked
timestamp and the exact duty-rate provenance next to the calculation.
