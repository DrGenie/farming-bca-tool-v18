SOIL CRC Benefit-Cost Analysis Tool - Deployment Instructions (v18)
==================================================================

The tool is a static website: HTML, CSS, JavaScript and a few asset files. It
needs no build step and no server. The only optional backend is the AI Analysis
Assistant, which uses a small Cloudflare Worker (see BACKEND_SETUP.md); the rest
of the tool works fully offline-capable in the browser.


1. Files to publish (place at the repository root)
--------------------------------------------------
Required for the tool:
- index.html
- app.js
- styles.css
- assistant.js
- guide.html
- logo_uon_primary.svg      (the approved University of Newcastle logo)
- logo_soil_white.png       (SOIL CRC logo, header/footer)
- logo_soil_crc.png         (SOIL CRC logo used in reports)
- BCA_Trial_data.xlsx       (sample dataset offered in the app)
- BCA_template.xlsx         (blank template for users)

Optional / supporting:
- BCA_test_data_2.xlsx      (a second sample dataset)
- README.md, CHANGELOG.md, VALIDATION_GUIDE_v18.md,
  REGRESSION_CHECKLIST_v18.md, TECHNICAL_NOTE.md, TEST_CHECKLIST.md
- worker/                   (only if you deploy the assistant)

The regression scripts (verify.js, calc_check.js, chart_test.js,
control_test.js, _extract.js, baseline_calc.json) and the two
sample_report_*.html files are for development and review. They are harmless to
publish but are not needed by the live site; you may keep them in the repo or
omit them from the published branch.


2. Publish on GitHub Pages
--------------------------
1. Commit all the required files to your repository, at the root.
2. In GitHub: Settings -> Pages -> Build and deployment.
   Source = "Deploy from a branch"; Branch = main (or your branch);
   Folder = / (root); Save.
3. Wait for the green check, then open
   https://YOURNAME.github.io/REPO/
4. All asset links are relative (for example app.js?v=18-1 and
   logo_uon_primary.svg), so the site works correctly from the project
   sub-path that GitHub Pages uses. Do not convert them to absolute paths.


3. Cache-busting after future changes
-------------------------------------
index.html loads styles.css, app.js and assistant.js with a version query
string (currently ?v=18-1). Browsers cache by full URL, so when you publish a
change, bump the suffix (for example ?v=18-2) on the files you changed so users
fetch the new versions instead of a cached copy. The visible version label
(Version 2026.18) and the feedback contact line are in index.html.


4. Verifying a deployment
-------------------------
After the site is live:
- Load the page and confirm the header shows the approved UON logo and the
  "Version 2026.18" badge.
- Upload BCA_Trial_data.xlsx, run the analysis, and confirm the five figures and
  the ranking and sensitivity tables render without overlapping or clipped text.
- Generate the HTML/PDF and Word reports and confirm the logo, figures, tables
  and Part B typography are correct.
- Optionally run the automated checks locally (see REGRESSION_CHECKLIST_v18.md).


5. Updating the logo in future
------------------------------
The approved logo is logo_uon_primary.svg. To replace it, swap that file
(keeping the same name) or update the references in index.html (header and
footer) and the REPORT_LOGO_UON / EMBEDDED_WORD_LOGOS.uon constants in app.js.
The Word/.doc export rasterises the SVG to PNG automatically at export time, so
no separate PNG needs to be maintained.
