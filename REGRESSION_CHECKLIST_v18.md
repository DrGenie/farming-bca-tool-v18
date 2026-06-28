SOIL CRC Benefit-Cost Analysis Tool - Regression Test Checklist and Results (v18)
================================================================================

This release changes presentation, validation, branding and robustness only. No
benefit-cost calculation was altered. The automated checks below were run after
the changes; all passed. To reproduce, run the listed scripts with Node.js from
the project folder.


A. Automated checks (run and PASSED)
------------------------------------

A1. Calculation parity                                            [PASS]
    Script:  node calc_check.js   (compared against baseline_calc.json)
    What it does: extracts the live calculation pipeline (standardiseRows,
    group, discountSchedule, computeMetrics, ranking and difference-from-control)
    from app.js and dumps the full ranking for the trial dataset, the alternative
    dataset and several edge settings.
    Result: output is identical to the pre-change baseline for every dataset and
    setting. No NPV, BCR, PV, gross profit margin, ROI, difference-from-control,
    discount factor or ranking value changed.

A2. Headline parity and dataset replacement                      [PASS]
    Script:  node verify.js
    Test 1 - trial dataset, default settings: top treatment Manure (T11),
      NPV $6,639.01, BCR 2.056; control T00 NPV $4,094.41, BCR 1.627; 12
      treatments ranked. All assertions pass.
    Test 2 - replacing the trial dataset with the alternative workbook: 3
      treatments, control becomes "Baseline practice" (detected via the T00 ID),
      no trial treatment name or NPV survives into the new dataset. All pass.
    Test 3 - state contract (10 checks): reset runs before parsing, dataset
      version increments, analysis does not auto-run, stale results are withheld
      from exports and the assistant. All pass.

A3. Chart geometry / no overlap, no clipping                     [PASS]
    Script:  node chart_test.js
    Renders the live renderBarChart for all five figures against six edge
    datasets: all-positive, mixed-negative, near-zero, very large, 14 treatments,
    and very long treatment names.
    Checks: every text element lies within the canvas; value labels never overlap
    treatment-name labels; each figure caption is wired.
    Result: 1565 checks, 0 failures.

A4. Real report figures                                          [PASS]
    The five chart SVGs embedded in each generated sample report were re-parsed
    and geometry-checked.
    Result: trial report 840 checks, 0 failures; alternative report 75 checks,
    0 failures.

A5. Dynamic control detection                                   [PASS]
    Script:  node control_test.js
    Six synthetic datasets: control in the last row with a non-T0 ID and a
    control name; control flagged only by an "Is Control" column; a two-treatment
    set with the control identified by the name "Baseline"; control in the middle
    identified by a "No change" label; a dataset with no control; a dataset with
    two controls.
    Result: 0 failures - the correct control (or none / multiple) is identified
    in every case.

A6. Sample report generation                                     [PASS]
    Script:  node report_gen.js
    Builds two complete reports through the live buildReportHtml pipeline:
    - sample_report_trial.html (trial dataset, 10-year constant 5% discounting,
      grain price $500): control "Control", top "Manure".
    - sample_report_alternative.html (alternative dataset, 8-year declining
      discounting 7%/4% switching at year 3, grain price $420): control
      "Baseline practice", top "Seaweed extract".
    Both contain the five canonical figure titles, the control name in the
    Figure 3 caption, proportional report tables with line-broken unit headers,
    the approved SVG logo embedded as a data URI, no references to the old logo,
    and the Part B bold-hardening and page-break rules.


B. Manual / visual checks (recommended before publishing)
---------------------------------------------------------
Open index.html in a browser and, for the trial dataset and at least one of your
own datasets, confirm:

[ ] B1.  Upload, run analysis, and open the Results tab; the treatment count and
         names match the workbook.
[ ] B2.  The control shown matches the intended control, and Figure 3's caption
         names that control.
[ ] B3.  All five figures: titles match the canonical wording; value labels sit
         outside the bars and are fully visible; negative values keep their minus
         sign; long names wrap without colliding; nothing is clipped.
[ ] B4.  Ranking and sensitivity tables: headings are complete (no "Ran/k"),
         units sit cleanly on a second line, numbers stay on one line, columns
         are aligned and decimals consistent.
[ ] B5.  Generate the HTML/PDF report and the Word (.doc) report; check page
         breaks keep figures/tables with their headings, headers repeat across
         pages, only headings are bold, and the UON logo is the approved SVG
         (PNG in the .doc), undistorted.
[ ] B6.  Re-upload a different workbook; confirm none of the previous dataset's
         treatments, names, values, figures or report text remain.
[ ] B7.  Trigger validation cases (no control, two controls, a duplicated
         record, a blank sensitivity price) and confirm the messages are clear
         and that nothing is silently substituted.
[ ] B8.  Print preview / save-to-PDF in Chrome and Edge; confirm layout.


C. Files used by the regression suite
-------------------------------------
- verify.js, calc_check.js, chart_test.js, control_test.js  - the test scripts
- _extract.js                                               - shared, string/
  template/regex-aware code extractor used by the scripts
- baseline_calc.json                                        - frozen calculation
  baseline for parity comparison
- BCA_Trial_data.xlsx, BCA_test_data_2.xlsx                 - test workbooks

Run all automated checks:
    node verify.js && node calc_check.js > /tmp/now.json && \
      diff baseline_calc.json /tmp/now.json && \
      node chart_test.js && node control_test.js
