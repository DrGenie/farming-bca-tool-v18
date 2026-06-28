SOIL CRC BCA Tool - v16 Test Checklist
======================================

v16 automated verification (verify.js, run with: node verify.js)
----------------------------------------------------------------
All checks PASS: calculation parity (Manure T11 NPV $6,639.01/ha, BCR 2.056;
control T00 $4,094.41/ha, BCR 1.627; 12 treatments), full dataset replacement
(sample -> BCA_test_data_2.xlsx, no sample value survives), and state-contract
wiring (reset-before-parse, version bump, no auto-run, currency gating, distinct
new-data and settings re-run messages). An HTML/JS element-ID cross-check passes
(only the dynamically created bca-typing is absent from static markup).

v16 manual checks (browser)
---------------------------
Assistant
- [ ] Open the assistant: header + 3 badges, one intro line, large response area,
      4 primary prompts, collapsed More prompts, sticky input, Clear/Download.
- [ ] Ask a question: your message and the answer appear; "Thinking…" shows in
      the conversation; long answers scroll independently; input never covers
      messages; Copy response and Add to report stay visible.
- [ ] During generation Send and all quick prompts (incl. More) are disabled and
      Stop works; controls restore afterwards.
- [ ] More prompts auto-collapses after a secondary prompt.
- [ ] Mobile: panel is full-screen; input stays above the keyboard; launcher
      hidden while open; closing returns focus to the launcher.
Navigation
- [ ] Data tab top row shows only Download template / Upload workbook / Load
      sample data (no View results).
- [ ] "Continue to results" is disabled until data load AND validation pass;
      enabled it opens Results; on blocking validation it stays disabled with
      "Resolve the validation errors above before continuing."
Results state + tables
- [ ] Banner shows the correct one of the four states; inline Run works.
- [ ] Ranking table scrolls horizontally with sticky Treatment column; Compact
      shows Treatment/NPV/BCR/Difference; Detailed shows all; CSV downloads.
Sensitivity / report
- [ ] Selected treatment shown; scenarios named; Reset to defaults works; update
      blocked when stale.
- [ ] External ChatGPT/Copilot controls live under "External AI drafting"; the
      integrated assistant is separate; AI narrative labelled draft.
Version
- [ ] Header and contact show Version 2026.16; assets load with ?v=16-1.

(Original v13/v13.1 checklist retained below.)



v13.1 automated verification (verify.js, run with: node verify.js)
------------------------------------------------------------------
All 22 checks PASS (run on the delivered files):

TEST 1 - Calculation parity (sample workbook + default settings)
- Reproduces v13 exactly: top Manure (T11) NPV $6,639.01/ha, BCR 2.056; control
  Control (T00) NPV $4,094.41/ha, BCR 1.627; 12 treatments. IDENTICAL to v13.

TEST 2 - Dataset replacement (sample -> BCA_test_data_2.xlsx)
- Workbook 2 has 3 treatments (Baseline practice [control, T00], Seaweed extract,
  Rock dust), different yields and costs. After replacement: 3 treatments not 12;
  no sample treatment name survives; control replaced; the top NPV differs from
  the sample top NPV; no workbook-2 NPV equals any sample NPV. All PASS.

TEST 3 - State-contract checks against the shipped app.js / assistant.js
- resetAnalysisForNewDataset() defined and called BEFORE parsing; datasetVersion
  incremented on every load; handleWorkbook no longer auto-runs; resultsAreCurrent()
  guard defined; getBcaToolState gates hasResults and withholds ranking when stale;
  exports stale-guarded; analysisValid exposed; assistant has a distinct re-run
  message. All PASS.

Note on scope: verify.js exercises the calculation pipeline and statically verifies
the state-machine wiring (the environment has no browser/jsdom). The DOM-flow items
in "Manual checks" below should still be walked through once in a browser before
go-live; they are quick because the logic they depend on is covered above.

New v13.1 manual checks (browser)
---------------------------------
Dataset replacement
- [ ] Load sample data, go to Results, click Run. Note the ranking and "Active
      data source: Included sample dataset".
- [ ] Upload BCA_test_data_2.xlsx. Confirm: the Results tab shows the stale banner
      "New data are loaded ... click Run"; the metric cards, ranking, charts,
      sensitivity and interpretation are cleared; the data-source label switches to
      "Uploaded workbook - BCA_test_data_2.xlsx"; the treatment selectors list only
      Baseline practice / Seaweed extract / Rock dust.
- [ ] Click Run. Confirm all outputs now show only workbook-2 treatments and that
      no sample treatment (Manure, Gypsum, etc.) appears anywhere, including the
      Word/PDF report. Confirm window.getBcaToolState() shows dataSource "upload",
      analysisValid true, and only workbook-2 treatments.
Failed upload
- [ ] Load sample data and run. Attempt to upload a non-workbook (e.g. a .txt or a
      corrupted file). Confirm the tool reports it could not be read, states that no
      dataset is active, clears outputs, and does NOT show the sample results as
      current. (Documented policy: a failed upload clears the dataset.)
Settings propagation
- [ ] Run analysis. Change the grain price (do not apply). Confirm the Results
      stale banner appears and Word/PDF export is blocked with "re-run required".
- [ ] Click Apply settings (or Run). Confirm every output updates and the banner
      clears. Repeat for analysis period and discounting mode.
Assistant integrity
- [ ] After uploading new data but before re-running, ask "Explain current result".
      Confirm the assistant replies "New data have been loaded ... run the BCA
      again" and does not quote the previous numbers.


--- Original v13 checklist (retained) ---

Automated verification (jsdom harness, run against the delivered files)
----------------------------------------------------------------------
Calculation parity (verify.js): the sample workbook + default settings reproduce
the v12 results exactly. Full metric snapshot diffed before/after every change:
IDENTICAL.

Headline figures confirmed unchanged from v12:
- Top treatment: Manure (T11) - NPV $6,639.01/ha, BCR 2.056, GPM 51.4%, ROI 105.6%
- Control: Control (T00) - NPV $4,094.41/ha, BCR 1.627
- 12 treatments ranked; sheet "BCA Trial Data"; 48 data rows; 0 validation notes.

Functional suite (test_v13.js) - 24 checks, all passing:
[PASS] progress stepper present (8 steps)
[PASS] ready indicator starts in "waiting"
[PASS] sample data loads; analysis runs; 12 treatments ranked
[PASS] top treatment Manure NPV 6639.01 (calculation parity)
[PASS] ready indicator turns "ready" after a clean load
[PASS] result interpretation populated (ranks highest / NPV / BCR / ROI)
[PASS] chart data tables populated (5 accessible figures)
[PASS] calculation-audit active schedule populated
[PASS] progress strip advances (>=5 steps done)
[PASS] assistant shows exactly 4 primary chips
[PASS] assistant shows exactly 8 secondary chips under "More prompts"
[PASS] primary chip dispatches a backend request and renders the answer
[PASS] "More prompts" chip dispatches (panel-level delegation fix)
[PASS] run-first guard: no backend call when analysis not run
[PASS] run-first guard: shows "upload data and run the BCA first" message
[PASS] ChatGPT button disabled when AI access = none
[PASS] Copilot button disabled when AI access = none
[PASS] ChatGPT button enabled after selecting "I have access to ChatGPT"
[PASS] ChatGPT click opens chatgpt.com
[PASS] Copilot button enabled after selecting "I have access to Copilot"
[PASS] Copilot click opens copilot.microsoft.com
[PASS] Copy prompt builds and stages the full prompt (ranking + settings + details)

Spreadsheets (recalc.py via LibreOffice)
- BCA_template.xlsx: sheets "BCA Data" + "Data_Dictionary"; includes
  "Cost of amendment_per_ha" (col 15); empty template; 0 recalculation errors.
- BCA_Trial_data.xlsx: amendment = 0; 0 negative numeric cells; Total Farm Costs
  recalculated as a live SUM of the tool's 17 components; 48 formulas; 0 errors.
  Workbook totals match the tool's internal sums (T00 $846.00, T11 $813.97,
  T01 $812.08 per ha).

Manual checks recommended before go-live
-----------------------------------------
Data
- [ ] Download template button downloads BCA_template.xlsx.
- [ ] Upload a completed workbook; confirm summary, preview and validation show.
- [ ] Load sample data; confirm "Ready to analyse" turns green.
- [ ] Project details start blank and require user input (no pre-filled defaults).

Settings
- [ ] Change grain price, analysis years, discounting mode, rates, switch year;
      click Apply settings; confirm the schedule label updates.

Results
- [ ] Run analysis; confirm metric cards, ranking, interpretation and audit panel.
- [ ] Compare a treatment against the control; check the difference-vs-control.
- [ ] Switch to side-by-side; pick two treatments; confirm the comparison table.
- [ ] Same-treatment selection shows the warning.
- [ ] All five charts render and have matching data tables.

Sensitivity
- [ ] Edit the three scenarios; click Update sensitivity; confirm the table.

Report
- [ ] "Description of Project:" appears as a bold label; the description text is
      not bold.
- [ ] Select "I have access to ChatGPT"; the ChatGPT button enables; clicking it
      copies the prompt and opens ChatGPT. Repeat for Copilot.
- [ ] Generate local summary; confirm draft-text labelling and disclaimer.
- [ ] Download Word report; open PDF-ready report; confirm charts and tables.

Assistant
- [ ] With no analysis run, a result question replies "upload data and run the
      BCA first".
- [ ] After running, the four primary chips and the eight "More prompts" chips
      all return answers grounded in the live result.
- [ ] Long answers scroll independently; the input stays fixed at the bottom.
- [ ] On a phone, the panel is a near full-screen sheet and does not cover the
      core controls underneath when closed.
- [ ] No API key appears anywhere in the browser (view source / network).

Accessibility / mobile
- [ ] Keyboard-only: tab through upload, settings, run, compare, report.
- [ ] Visible focus states throughout; skip link works.
- [ ] Tables scroll horizontally on a narrow screen without breaking layout.
- [ ] Screen reader announces upload status, ready state and current step.
