SOIL CRC Benefit-Cost Analysis Tool - Data Compatibility and Validation Guide (v18)
==================================================================================

This guide explains what data the tool accepts, how it interprets that data, and
how it validates it. It is written for analysts preparing a workbook and for
reviewers checking that the tool behaves correctly on a new dataset.


1. What the tool accepts
------------------------
- File type: an Excel workbook (.xlsx). The first worksheet that contains the
  required headers is used; the sheet does not have to be the first tab and the
  header row does not have to be the first row.
- Any number of treatments (two or more), in any row order. Treatments may have
  short codes or long descriptive names.
- Any number of replicates per treatment. Replicates of the same treatment are
  averaged.
- Values may be positive, zero, negative, very large or very small. Outputs such
  as net present value, the difference from the control, gross profit margin and
  return on investment are shown for negative as well as positive results.
- Project description fields (project name, collaborators, funding agency,
  summary, methodology) are optional. If a field is missing it is simply omitted
  from the report rather than blocking the analysis.

The tool does not contain any hard-coded crop, treatment or amendment names. The
analysis is driven entirely by the uploaded workbook and the settings on the
Data and Results tabs.


2. Required and recognised columns
----------------------------------
Required (by header name, case-insensitive; common aliases are accepted):
- Treatment ID
- Amendment Name (the treatment label shown in figures and tables)
- Crop yield (t/ha)  - alias: Crop_yield_ton_per_ha
- The direct-cost components that make up total direct costs.

Recognised optional columns:
- Replicate ID (used to detect duplicated records and to average replicates)
- Practice Change Label (e.g. "No change", "Soil amendment")
- "Is Control" (TRUE/FALSE, 1/0, Yes/No)

Direct costs are summed from the recognised total cost components only (for
example total labour and total machinery), never from both a total and its
sub-components, so costs are not double-counted. This summation is unchanged from
previous versions and was re-verified in this release.


3. How the control is identified
--------------------------------
The control treatment is detected dynamically, independent of its row position,
the number of treatments, or how it is named. A treatment is treated as the
control if any of the following hold, in priority order:
1. an "Is Control" column is truthy for that treatment;
2. its Treatment ID is the zero treatment (T0, T00, T000, ...);
3. its Amendment Name is, or contains, a recognised control term
   (for example Control, Baseline, Untreated, Nil, Standard practice,
   Business as usual, No amendment);
4. its Practice Change Label marks a no-change / control practice.

If more than one treatment is detected as a control, the tool reports this and
lets you choose which control to use as the reference on the Results tab. If no
control is present, the comparison-against-control and the difference-from-control
column are unavailable and the tool says so.


4. Validation messages
----------------------
Validation never silently changes your data. When something looks wrong the tool
reports what is wrong, where it is, and how to fix it, and (where possible) still
lets you proceed. Checks include:
- missing required worksheet, header row or columns;
- empty dataset / no treatments;
- duplicated treatment records (the same Treatment ID and Replicate ID twice);
- non-numeric values in numeric columns;
- unexpected negative inputs (negative yield or negative total direct costs);
- no control treatment;
- multiple control treatments;
- invalid control coding (an "Is Control" cell that is not a recognised
  true/false value);
- malformed sensitivity scenarios (a blank or non-numeric discount rate, or a
  grain price that is not greater than zero).

Sensitivity scenarios with an invalid discount rate or price are flagged with a
warning rather than being computed from a substituted value.


5. State is cleared on every upload
-----------------------------------
Each new upload increments the dataset version and clears all derived state from
the previous dataset (rows, groups, ranking, sensitivity, selectors, workbook and
sheet names, and the "results are current" flag). Results must be re-run for the
new dataset before they are shown or exported, so figures, tables and the report
can never mix data from two workbooks.


6. How to sanity-check a new dataset
------------------------------------
- Confirm the treatment count and names in the ranking table match your workbook.
- Confirm the control shown on the Results tab is the treatment you intended.
- Confirm Figure 3's caption names that same control.
- Confirm negative results (if any) appear with their minus sign, fully visible,
  and that no figure or table text overlaps or is clipped.
- Re-upload a different workbook and confirm none of the previous treatments,
  names or values remain.
