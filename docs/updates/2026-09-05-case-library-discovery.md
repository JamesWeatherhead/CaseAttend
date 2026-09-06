# Find a case with search and independent filters

The library replaces the mixed, horizontally scrolling filter strip with labeled **Case type** and **Curriculum tag** controls. Search and both filters work together. The default includes every case, including the 16 built-in cases without curriculum tags and imported cases with unfamiliar categories. Existing exact, pipe-delimited curriculum tags remain authoritative; no case tags, difficulty, clinical content, or review records are rewritten.

Search now matches words in any order and normalizes whitespace, punctuation, case, accents, X-ray aliases, and letter/number boundaries. Short and numeric words match exactly; longer words match word prefixes. It indexes title, vignette, domain, subtitle, category, and its display label once per loaded catalog. It excludes teaching notes, answers, internal identifiers, and review data. Results retain the original case object and catalog order and are filtered before pagination.

| Search | Previous built-in results | Updated built-in results |
| --- | ---: | ---: |
| `pain chest` | 0 | 1 |
| `chest   pain` | 0 | 1 |
| `ct head` | 0 | 2 |
| `ct` | 17 substring matches | 2 CT cases |
| `xray` | 0 | 14 X-ray cases |

**Clear search** retains both filters. **Clear all** resets search and filters. Search, both filters, the expanded batch, scroll position, and originating card focus survive a case round trip. Control changes are saved even if browser history or an authoring action leaves without a card click. Restoration waits through failed loads, and a missing originating card returns focus to search.

## Validation

- All 592 tests in 76 files pass, along with app/SDK/example type checks, production build, and whitespace checks.
- Real-catalog tests cover the two CT cases, all 14 X-rays across aliases, word order and whitespace, and untagged-case preservation. Imported-case tests cover Unicode, numeric boundaries, unknown categories, hidden-field exclusion, and exact object identity.
- UI regressions cover independent filtering, search-only clearing, full reset and focus, search before pagination, both filters with an expanded 24-case batch, non-click navigation, missing-card fallback, and restoration after a failed load.
- Browser comparisons confirmed the prior search failures and their fixes. At 390px the two labeled selectors are visible together; at 320px they stack. Controls measure 48px high, with no horizontal page overflow.
- Browser Back/Forward testing changed a query after returning from a case, reopened that case through Forward, then returned with the latest query and both filters intact. When the old card no longer matched, focus returned to search.
- The production preview found all 14 built-in X-rays, expanded the results, opened a case from the added results, and restored the expanded list, active filters, query, and case-card focus. A visible-card round trip retained the measured 1,919px library scroll position.

This is a discovery and navigation change. No live model call or clinical-content approval was performed, and it does not claim a traffic increase or improved learning outcomes.
