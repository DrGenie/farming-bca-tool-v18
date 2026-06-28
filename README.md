SOIL CRC Benefit-Cost Analysis Tool
===================================

Version 2026.18 (v18). A web-based benefit-cost analysis decision aid for
agricultural production trials (for example soil amendments on wheat). Open
index.html in a browser or deploy the whole folder to a static host such as
GitHub Pages. No build step or server is required for the tool itself. The
optional AI Analysis Assistant uses a small Cloudflare Worker (see worker/).

What's new in v18 (2026.18)
---------------------------
Report quality, data flexibility, plotting, branding and table release. No
benefit-cost calculation was changed; calculation parity with v16/v15/v13 is
reproduced exactly by the regression suite (see verify.js and the test scripts).
- Figures: a single source of truth (the FIGURES table) now drives every chart
  title, caption, sort order and units, so the five figures are worded
  consistently everywhere. Figure 3 reads "Difference in net present value
  relative to the control ($/ha)" and its caption names the actual control.
- Plotting: bar charts were rewritten so value labels always sit outside the
  bars and within the canvas, treatment names wrap rather than collide, the
  name column and label padding size themselves to the data, a zero line is
  drawn, and the height grows with the number of treatments. No text overlaps,
  including for negative values, and nothing is clipped.
- Data flexibility: the control treatment is detected dynamically (by an
  "Is Control" column, a T0/T00 ID, a control-style name such as Control,
  Baseline or Untreated, or a "no change" practice label) regardless of row
  position, treatment count or naming. All previous-dataset state is cleared on
  every new upload.
- Validation: clearer, more specific messages for missing controls, multiple
  controls, invalid control coding, duplicated treatment records, unexpected
  negative inputs and malformed sensitivity scenarios. Invalid values are
  reported, never silently substituted.
- Tables: report tables use proportional column widths, wrap headings cleanly
  (units on a second line), never break words mid-character, keep numbers on one
  line, and repeat headers across printed pages.
- Branding: the approved University of Newcastle logo (UON_Logo-1.svg) replaces
  the previous logo in the header, footer, web app and reports, with its aspect
  ratio preserved. For the Word/.doc export the SVG is rasterised to PNG at
  export time (RTF cannot embed SVG).
- Narrative: the local report summary is comparison-aware and data-driven; it
  describes the comparison the user has actually set up (side-by-side or against
  the control), names the selected treatment and the control, and notes the
  top-ranked treatment when it differs from the selection.
- Layout: print/PDF page-break rules keep figures, tables and their headings
  together; Part B body text is normal weight with only headings bold.

What's new in v16 (2026.16)
---------------------------
UX and accessibility release; calculations unchanged and regression-tested.
- Analysis Assistant rebuilt so the response area is the largest region, always
  visible, independently scrollable, with a sticky opaque input, three concise
  status badges, a one-line intro, an "About this assistant" collapse, and a
  full-screen mobile panel (100dvh) that keeps the input above the keyboard.
- Removed the duplicate "View results" button; one renamed "Continue to results"
  enables only after data load + essential validation and opens the Results tab.
- Clear four-state Results messaging (no data / loaded not run / stale / current),
  a prominent upload confirmation, and an inline "Run analysis now".
- Ranking table: horizontal scroll, sticky Treatment column, Compact/Detailed
  views and a ranking CSV; absolute vs incremental results explained.
- Collapsible calculation audit with a brief summary; named sensitivity scenarios
  with Reset to defaults; external ChatGPT/Copilot drafting moved to a collapsed
  section, separate from the integrated assistant.
- Version labels corrected to Version 2026.16 / v16 with cache-busted assets.

Deploying to GitHub Pages (frontend)
------------------------------------
1. Put all the website files at the repository root (index.html, app.js,
   styles.css, assistant.js, guide.html, the logos and the .xlsx files).
2. In GitHub: Settings -> Pages -> Build and deployment -> Source = "Deploy from
   a branch"; Branch = main (or your branch), folder = / (root); Save.
3. Wait for the green check, then open
   https://YOURNAME.github.io/REPO/ (for this tool, the v18 URL).
4. After any change, the asset query strings (?v=18-1) force browsers to fetch
   the new files; bump them (e.g. ?v=18-2) when you publish further changes.
5. The tool works with no backend. The optional assistant needs the Cloudflare
   Worker — see BACKEND_SETUP.md.

What's new in v13.1 (2026.13.1)
-------------------------------
A targeted corrective release focused on data integrity. Newly loaded data
(sample or uploaded) now completely replace any previous dataset everywhere:
validation, calculations, treatment selectors, charts, sensitivity, reports and
the Analysis Assistant. Key changes:
- A single source-of-truth state with a dataset version. Every load runs a
  mandatory reset (resetAnalysisForNewDataset) before parsing, so no value from a
  previous dataset can survive.
- Results are bound to the dataset version they were computed from. Loading new
  data or changing settings marks results stale; the tool blocks reports/exports
  and the assistant withholds numbers until you re-run the analysis.
- Loading data no longer auto-runs the analysis: results appear only after you
  click Run Benefit-Cost Analysis, so sample and uploaded data are never mixed.
- A failed upload clears the dataset and says so; the tool never silently falls
  back to the sample data or shows invalid data as loaded.
- A visible "Active data source" label (Data tab and Results tab) and a Results
  stale/empty banner. The scientific formulas are unchanged and were
  regression-tested against v13 (identical results — see verify.js).

What's new in v13 (2026.13)
---------------------------
Accuracy first: every BCA calculation is unchanged and was verified to match
v12 exactly (see CHANGELOG.md and TEST_CHECKLIST.md). On top of that:
- "How the calculations work (calculation audit)" panel with plain-language
  formulas, units, and the list of cost components that are summed.
- "What these results suggest" panel that interprets NPV, BCR, ROI and the
  control comparison in plain language, with check-assumptions caveats.
- Friendlier, actionable validation messages (what is wrong, where, how to fix,
  whether analysis can continue) plus a "Ready to analyse" indicator.
- Step-by-step progress strip across the workflow with the current step shown.
- Accessibility: accessible data tables and plain-language summaries beside
  every chart, scoped table headers, announced status and current step.
- Simplified Analysis Assistant: four primary quick buttons with the rest under
  a "More prompts" section, a larger scrollable response area, a near
  full-screen sheet on mobile, and a clear "run the BCA first" message when no
  analysis has been run yet.
- "What this tool can and cannot do" section in the Introduction.
- Report section headings render as bold labels (for example
  "Description of Project:") with the user text in a separate, non-bold block.

What's in this release
----------------------
1. New official template, BCA_template.xlsx, which includes the
   "Cost of amendment_per_ha" column. The Data tab "Download template" button
   now serves this file.
2. Recalculated trial dataset, BCA_Trial_data.xlsx. Negative figures were
   removed, the cost of amendment is set to zero, and "Total Farm Costs_per_ha"
   is now a live formula that sums the same direct-cost components the tool
   uses, so the workbook total always matches the tool's internal calculation.
   This file is also what "Load sample data" loads.
3. Wider column and sheet-name support. The tool now reads both the new and the
   original column names (Crop_yield_ton_per_ha, Seed cost_per_ha,
   Marketing_total cost_per_ha and their earlier equivalents) and accepts the
   "BCA Data" / "BCA Trial Data" sheet names as well as the original.
4. Project details are no longer pre-filled. The Name of Project, Collaborators,
   Funding Agency, Project Summary and Methodology fields start empty with
   guidance placeholders, so each user enters their own details.
5. ChatGPT and Copilot report buttons verified. They open chatgpt.com and
   copilot.microsoft.com in a new tab and copy the full prepared prompt to the
   clipboard, with a manual-copy fallback if the browser blocks automatic copy.
6. New AI Analysis Assistant (assistant.js + worker/). A domain-grounded chat
   assistant that reads the live analysis and helps interpret results, compare
   treatments, draft report text and plan sensitivity checks. The model key is
   held only as a Worker secret and is never in the frontend or the repository.

Files
-----
- index.html ............ Main application (7 tabs + AI Assistant)
- styles.css ............ Stylesheet (includes the assistant styling)
- app.js ................ Application logic, parsing, charts, report generation
- assistant.js .......... AI Analysis Assistant frontend (talks only to Worker)
- guide.html ............ Full user guide
- BCA_template.xlsx ..... Official data-entry template (BCA Data + Data_Dictionary)
- BCA_Trial_data.xlsx ... Validated sample dataset (also loaded by "Load sample data")
- logo_uon_white.png / logo_soil_white.png ... White logos (dark header/footer)
- logo_university_newcastle.jpg / logo_soil_crc.png ... Badge logos (report)
- logo1.png / logo2.png .. Legacy logo copies (retained for compatibility)
- worker/ ............... Cloudflare Worker backend for the AI Assistant
- verify.js ............. Automated parity + dataset-replacement + state-contract
                          tests (run: node verify.js)
- BCA_test_data_2.xlsx .. Second, deliberately different workbook used by the
                          dataset-replacement test
- TECHNICAL_NOTE.md ..... Root-cause and fix write-up for the v13.1 release

How the AI Assistant is grounded
--------------------------------
The assistant is domain-grounded, not fine-tuned. It is steered by a fixed
system prompt and a benefit-cost knowledge base inside the Worker, and it is
sent the live tool state (ranking, metrics, settings, project info) with every
request. It uses only those values, does not invent numbers, and does not learn
or retain anything from user questions. Answers are interpretation support, not
financial or agronomic advice, and are marked for review when added to a report.

Deploying
---------
1. Tool: push this folder to a GitHub repository and enable GitHub Pages. The
   tool works immediately; the assistant shows "Backend not set" until step 2.
2. Assistant: deploy the Worker in worker/ and set the GEMINI_API_KEY secret,
   then confirm the Worker URL in assistant.js. Full steps are in
   worker/README_DEPLOY_CHATBOT.md. Set the Worker's ALLOWED_ORIGINS to your
   GitHub Pages origin.

Notes
-----
- Scientific calculations are unchanged: NPV, BCR, gross profit margin, ROI and
  the discounting schedule work exactly as before. Direct costs are summed
  internally from the workbook component fields.
- Word reports export as Word-compatible documents with publication-style
  tables, chart images and a generated date/time stamp.
