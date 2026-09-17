from pathlib import Path

path = Path("components/search/simple-supplier-offer-search.tsx")
source = path.read_text()

def replace_once(old: str, new: str, label: str):
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one target, found {count}")
    source = source.replace(old, new, 1)

replace_once(
    "  select: string;\n  selecting: string;\n  cached: string;",
    "  select: string;\n  selected: string;\n  selecting: string;\n  selectionSummary: (count: number) => string;\n  selectionInstructions: string;\n  continueWithSelected: string;\n  continuing: string;\n  cached: string;",
    "copy type",
)

replace_once(
    '    select: "Izaberi ponudu",\n    selecting: "Otvaranje...",',
    '    select: "Dodaj za poređenje",\n    selected: "Dodato za poređenje",\n    selecting: "Dodavanje...",\n    selectionSummary: (count) => `Odabrano za poređenje: ${count}`,\n    selectionInstructions: "Dodajte sve ponude koje želite, pa tek onda nastavite.",\n    continueWithSelected: "Nastavi sa odabranim ponudama",\n    continuing: "Otvaranje sledećeg koraka...",',
    "sr copy",
)
replace_once(
    '    select: "Angebot auswählen",\n    selecting: "Wird geöffnet...",',
    '    select: "Zum Vergleich hinzufügen",\n    selected: "Für den Vergleich hinzugefügt",\n    selecting: "Wird hinzugefügt...",\n    selectionSummary: (count) => `Für den Vergleich ausgewählt: ${count}`,\n    selectionInstructions: "Fügen Sie alle gewünschten Angebote hinzu und fahren Sie erst danach fort.",\n    continueWithSelected: "Mit ausgewählten Angeboten fortfahren",\n    continuing: "Nächster Schritt wird geöffnet...",',
    "de copy",
)
replace_once(
    '    select: "Select offer",\n    selecting: "Opening...",',
    '    select: "Add for comparison",\n    selected: "Added for comparison",\n    selecting: "Adding...",\n    selectionSummary: (count) => `Selected for comparison: ${count}`,\n    selectionInstructions: "Add every offer you want to compare, then continue when your selection is complete.",\n    continueWithSelected: "Continue with selected offers",\n    continuing: "Opening the next step...",',
    "en copy",
)

replace_once(
    '  const [selectingUrl, setSelectingUrl] = useState<string | null>(null);\n  const [fxSnapshot, setFxSnapshot] = useState<FxSnapshot | null>(null);',
    '  const [selectingUrl, setSelectingUrl] = useState<string | null>(null);\n  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);\n  const [selectedOfferIds, setSelectedOfferIds] = useState<string[]>([]);\n  const [advancing, setAdvancing] = useState(false);\n  const [fxSnapshot, setFxSnapshot] = useState<FxSnapshot | null>(null);',
    "selection state",
)

old_function = '''  async function selectOffer(result: SupplierOfferSearchResult) {
    setSelectingUrl(result.productUrl);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/supplier-search/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result),
      });
      const payload = (await response.json().catch(() => null)) as {
        offerId?: string;
        existingOfferId?: string;
        error?: string;
      } | null;
      if (!response.ok && response.status !== 409) {
        throw new Error(payload?.error || text.noResultsText);
      }
      const selectedOfferId = response.ok ? payload?.offerId : payload?.existingOfferId;
      if (!selectedOfferId) throw new Error(payload?.error || text.noResultsText);

      router.push(
        `/projects/${projectId}?selectedOffer=${encodeURIComponent(selectedOfferId)}#workflow-step-decision`,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.noResultsText);
      setSelectingUrl(null);
    }
  }
'''
new_function = '''  async function selectOffer(result: SupplierOfferSearchResult) {
    if (selectedUrls.includes(result.productUrl)) return;
    setSelectingUrl(result.productUrl);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/supplier-search/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result),
      });
      const payload = (await response.json().catch(() => null)) as {
        offerId?: string;
        existingOfferId?: string;
        error?: string;
      } | null;
      if (!response.ok && response.status !== 409) {
        throw new Error(payload?.error || text.noResultsText);
      }
      const selectedOfferId = response.ok ? payload?.offerId : payload?.existingOfferId;
      if (!selectedOfferId) throw new Error(payload?.error || text.noResultsText);

      setSelectedUrls((current) => current.includes(result.productUrl)
        ? current
        : [...current, result.productUrl]);
      setSelectedOfferIds((current) => current.includes(selectedOfferId)
        ? current
        : [...current, selectedOfferId]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.noResultsText);
    } finally {
      setSelectingUrl(null);
    }
  }

  function continueWithSelectedOffers() {
    if (selectedOfferIds.length === 0 || advancing) return;
    setAdvancing(true);
    router.push(`/projects/${projectId}#workflow-step-decision`);
    router.refresh();
  }
'''
replace_once(old_function, new_function, "selectOffer")

replace_once(
    '''            const selecting = selectingUrl === result.productUrl;
            return (''',
    '''            const selecting = selectingUrl === result.productUrl;
            const selected = selectedUrls.includes(result.productUrl);
            return (''',
    "render selection state",
)

replace_once(
    '''                <button
                  className="secondary-button"
                  disabled={selecting}
                  onClick={() => void selectOffer(effectiveResult)}
                  type="button"
                >
                  {selecting ? text.selecting : text.select}
                </button>''',
    '''                <button
                  className="secondary-button"
                  disabled={selecting || selected}
                  onClick={() => void selectOffer(effectiveResult)}
                  type="button"
                >
                  {selected ? text.selected : selecting ? text.selecting : text.select}
                </button>''',
    "selection button",
)

replace_once(
    '''        </div>
      )}
    </section>
  );
}''',
    '''        </div>
      )}

      {selectedOfferIds.length > 0 && (
        <div className="empty-state" role="status">
          <p><strong>{text.selectionSummary(selectedOfferIds.length)}</strong></p>
          <p>{text.selectionInstructions}</p>
          <button
            className="primary-button"
            disabled={advancing}
            onClick={continueWithSelectedOffers}
            type="button"
          >
            {advancing ? text.continuing : `${text.continueWithSelected} (${selectedOfferIds.length})`}
          </button>
        </div>
      )}
    </section>
  );
}''',
    "selection footer",
)

path.write_text(source)

test_path = Path("tests/unit/simple-supplier-offer-search.test.tsx")
test_source = test_path.read_text()
old_test = '''  it("opens the exact selected offer directly in the decision step", () => {
    expect(resultsSource).toContain("existingOfferId?: string");
    expect(resultsSource).toContain("selectedOffer=${encodeURIComponent(selectedOfferId)}#workflow-step-decision");
    expect(projectSource).toContain("selectedOffer?: string");
    expect(projectSource).toContain("const focusedOfferId = project.offers.some");
    expect(projectSource).toContain("focusedOfferId={focusedOfferId}");
    expect(projectSource).toContain("Boolean(selectedCalculationOfferId || focusedOfferId)");
  });'''
new_test = '''  it("keeps the simple result list open while multiple offers are selected", () => {
    const selectStart = resultsSource.indexOf("async function selectOffer");
    const continueStart = resultsSource.indexOf("function continueWithSelectedOffers");
    const selectionSource = resultsSource.slice(selectStart, continueStart);
    expect(selectStart).toBeGreaterThanOrEqual(0);
    expect(continueStart).toBeGreaterThan(selectStart);
    expect(selectionSource).toContain("setSelectedOfferIds");
    expect(selectionSource).not.toContain("router.push(");
    expect(selectionSource).not.toContain("router.refresh()");
    expect(resultsSource).toContain('select: "Dodaj za poređenje"');
    expect(resultsSource).toContain('select: "Zum Vergleich hinzufügen"');
    expect(resultsSource).toContain('select: "Add for comparison"');
    expect(resultsSource).toContain("selectedOfferIds.length > 0");
  });

  it("advances to the decision step only through the explicit continue action", () => {
    const continueStart = resultsSource.indexOf("function continueWithSelectedOffers");
    const analysisStart = resultsSource.indexOf("const analysisByUrl", continueStart);
    const continueSource = resultsSource.slice(continueStart, analysisStart);
    expect(continueSource).toContain("selectedOfferIds.length === 0");
    expect(continueSource).toContain("router.push(`/projects/${projectId}#workflow-step-decision`)");
    expect(continueSource).toContain("router.refresh()");
    expect(resultsSource).toContain("text.selectionSummary(selectedOfferIds.length)");
    expect(resultsSource).toContain("text.continueWithSelected");
  });'''
count = test_source.count(old_test)
if count != 1:
    raise SystemExit(f"simple regression test: expected one target, found {count}")
test_path.write_text(test_source.replace(old_test, new_test, 1))
