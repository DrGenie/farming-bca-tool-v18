SOIL CRC BCA Tool — Technical Note (v16 release)
================================================

Scope: v16 is a UX/accessibility/clarity release. No scientific calculation,
discounting rule, cost-summation, aggregation, ranking, comparison or sensitivity
formula was changed. verify.js (run with node) reproduces the established figures
exactly (Manure T11 NPV $6,639.01/ha, BCR 2.056; control T00 $4,094.41/ha, BCR
1.627; 12 treatments) and confirms full dataset replacement and the state-machine
wiring. All checks pass.

What changed in the code
- assistant panel markup (index.html): reordered to header+badges, intro
  sentence, "About this assistant" collapse, large messages area, four primary
  prompts, collapsed "More prompts", sticky input, footer. Three badges only.
- styles.css: response area `flex:1 1 0; min-height:0; overflow-y:auto` with
  bottom padding (the min-height:0 is what makes a flex child scroll instead of
  pushing the composer out); sticky opaque `.bca-inputbar`; full-screen mobile
  panel via 100dvh and safe-area padding; sticky ranking Rank+Treatment columns;
  compact-view column hiding; segmented toggle, external-AI and brief-audit
  styles.
- assistant.js: three-badge logic keyed off tool state (analysisValid/analysisRun/
  dataLoaded/treatmentsRanked); distinct re-run messages (new data vs settings vs
  none) selected from `staleReason`/`analysisRun`; "More prompts" auto-collapses
  after use; all `[data-action]` chips disabled during generation.
- app.js:
  * Navigation: removed `viewResultsFromDataTop`; `updateDataNextStep` and
    `setResultsGate` enable "Continue to results" only on
    `dataLoaded && dataValidated`; "Open report" / exports / ranking CSV gate on
    `resultsAreCurrent()`.
  * Results banner now expresses the four explicit states and offers an inline
    Run button; upload confirmation includes source label, load time, validation
    status and an explicit "previous results cleared / re-run required" note.
  * Ranking CSV (`rankingCsv`), compact/detailed toggle wiring, sensitivity
    selected-treatment line, named scenarios and Reset to defaults.
  * Tool state adds `staleReason`, `settingsVersion`, `settingsSignature`; ranking
    and sensitivity remain withheld whenever results are not current, so the
    assistant cannot quote stale numbers.

Deferred / optional (documented, not implemented)
- Tornado / ranked-driver sensitivity chart (explicitly optional). The numeric
  sensitivity table and per-scenario outputs are unchanged.
- Per-scenario ranking-reordering display was not added; scenario metrics are
  shown per the existing calculation.

Limitations / testing scope
- Automated tests run in Node (no browser/jsdom): they cover calculation parity,
  dataset replacement and state-machine wiring, plus an HTML/JS element-ID
  cross-check. The DOM-interaction items in TEST_CHECKLIST.md should be walked
  through once in a browser before go-live.
- The Cloudflare Worker was not changed; the Gemini key remains a server secret
  and no secret appears in any frontend file.


----------------------------------------------------------------------
SOIL CRC BCA Tool — Technical Note (v13.1 corrective release)
=============================================================

1. Root cause of the spreadsheet-replacement problem
----------------------------------------------------
The calculations were never the problem. The defect was in state ownership.

- There was a single `state` object, but it held only data and the last
  selections; it had no concept of "which dataset is active" or "are the
  displayed results still valid". There was no dataset version and no reset.
- `handleWorkbook` mutated `state` in place and then immediately called
  `runAnalysis(false)`. It did not clear the previous selections
  (`selectedTreatment`, `selectedControl`, `sideA`, `sideB`), the previous
  `lastRun`, or the previous `sensitivity`. On a new upload those carried over.
- On a failed upload, only `cleanedRows`, `grouped` and `ranking` were emptied.
  The previously rendered ranking table, charts, interpretation and report
  stayed on screen, so the tool showed old results while claiming the upload had
  failed — an ambiguous, mixed state.
- Changing a setting never invalidated the displayed results, so outputs could
  be read under settings they were not computed with.
- `window.getBcaToolState()` always serialised `state.ranking` and
  `state.sensitivity`, so the Analysis Assistant could quote numbers from a
  dataset that was no longer active.

Net effect: parts of the UI and the assistant could keep using stale or
sample-data values after a new workbook was loaded.

2. State variables and functions corrected
-------------------------------------------
A single source of truth was added to the existing `state` object:
  dataSource ('none'|'sample'|'upload'), datasetVersion, analysisDatasetVersion,
  dataLoaded, dataValidated, settingsApplied, analysisRun, resultsStale.
New/changed functions in app.js:
- `resultsAreCurrent()` — the one guard every consumer uses: results exist AND
  `analysisDatasetVersion === datasetVersion` AND not stale.
- `resetAnalysisForNewDataset()` — clears all derived state and every rendered
  output (metric cards, ranking, comparison, interpretation, audit schedule,
  sensitivity table, chart containers) and empties the selectors. Charts are
  inline SVG written via innerHTML, so replacing the container markup destroys
  the previous chart; there are no retained chart objects to leak.
- `setResultsGate()` / `setActiveDataSourceLabel()` / `markResultsStale()` —
  drive the visible "Active data source" label, the Results stale/empty banner,
  and enable/disable of report/export actions.
- `handleWorkbook(file, name, source)` — now: reset → `datasetVersion += 1` →
  parse → set `dataSource`/`dataLoaded` → essential validation
  (`dataValidated`) → rebuild selectors from the new workbook only → set
  `analysisRun=false`, `resultsStale=true`. It no longer auto-runs.
- `runAnalysis()` — on success stamps `analysisDatasetVersion = datasetVersion`,
  clears `resultsStale`, and refreshes the gate.
- `applySettings()` — sets `settingsApplied`; because it re-runs the analysis
  when data are present, applying settings re-stamps the version. Editing a
  setting input without applying calls `markResultsStale()`.
- `downloadWordReport()` / `openPdfReport()` — blocked when
  `!resultsAreCurrent()`, with a "re-run required" message.
- `getBcaToolState()` — exposes the lifecycle/version fields and `analysisValid`,
  ties `hasResults` to `resultsAreCurrent()`, and withholds `ranking` and
  `sensitivity` when results are not current.
assistant.js: added `NEEDS_RERUN_MSG` and branched the result-action guard so a
loaded-but-stale dataset gets "run the BCA again" rather than "upload first".

3. How stale results are now prevented
---------------------------------------
- Identity: every load gets a new `datasetVersion`. Results are tagged with the
  version they were computed from. A mismatch means "stale".
- Reset-first: nothing from a previous dataset can survive a load because the
  reset runs before parsing and clears both data and DOM.
- No auto-run: results are produced only by an explicit Run, so sample and
  uploaded data cannot appear together in a result.
- Gating: the stale banner, disabled exports, and the withheld assistant payload
  all key off the same `resultsAreCurrent()` guard, so they cannot disagree.

4. How uploaded data propagate everywhere
------------------------------------------
All consumers read from the single `state`: `refreshSelectors` rebuilds the
dropdowns from `state.grouped`; `runAnalysis` computes `state.ranking` from
`state.grouped`; charts, chart tables, interpretation, sensitivity and the report
all read `state.ranking`/`state.sensitivity`; `getBcaToolState` (and therefore the
assistant) reads the same. Because the reset empties all of these and the new
workbook repopulates `state.cleanedRows`/`grouped` before the next run, a single
Run pushes the new data through every output at once.

5. Calculation parity with v13
-------------------------------
None of the calculation, discounting or cost-summation code was touched. The
parity harness in verify.js copies that math verbatim and runs it against the
official sample workbook with default settings, reproducing the v13 figures
exactly (Manure NPV $6,639.01/ha, BCR 2.056; control $4,094.41/ha, BCR 1.627;
12 treatments). The dataset-replacement test confirms a second workbook produces
entirely different outputs with no sample value surviving. State-contract checks
confirm the fixes are wired into the shipped files. All 22 checks pass.

6. Unresolved limitations / notes
---------------------------------
- The automated tests run in Node (no browser/jsdom in the build environment):
  they cover the calculation pipeline and statically verify the state-machine
  wiring. The DOM-interaction items in TEST_CHECKLIST.md should be walked through
  once in a browser before go-live.
- Behaviour change: loading data (including the sample) no longer auto-runs the
  analysis; the user must click Run. This is intentional and is what prevents
  mixed/stale results. Any external automation that assumed results appear on
  load should click Run (or call `window.forceApplySettings()` after a load).
- The Cloudflare Worker (worker/) was not modified; the API key remains a
  server-side secret and no secret appears in any frontend file.
