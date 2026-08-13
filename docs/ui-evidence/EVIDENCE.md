# Dev panel UI evidence

Screenshot suite for the unflag dev panel: normal-mode states, stress-mode states at 300 features, and the pre-redesign captures that motivated the large-data redesign. Captured 2026-08-12 against `examples/support-desk` (`capture.mjs` in this directory is the reproducible harness; see its header for env setup).

## Measurements

| Measurement (300 features) | Old panel | Redesigned panel |
|---|---|---|
| Trigger click to panel interactive | ~1908 ms | **29 ms** |
| Textareas mounted with all rows collapsed | 10 | **0** |
| Heavy JSON edit round (native setter + validate) | froze the page main thread on one keystroke | 166 ms (includes a fixed 150 ms settle wait; ~16 ms of work) |
| Filter typing (8 chars) | n/a (no filter existed) | ~47 ms |
| Panel scroll | ~30fps | compact rows, no jank observed |
| Console errors | none | none (one benign favicon 404) |

## Normal mode

### App initial state (panel closed)
![app initial](./01-app-initial.png)

### Panel open: compact rows, counts line, filter
![panel compact clean](./02-panel-compact-clean.png)

### Row expanded (accordion detail-on-demand)
![row expanded](./03-row-expanded.png)

### Enum override applied: badge + "would be" line
![enum override](./04-enum-override.png)

### Explain expanded (provenance with copy)
![explain expanded](./05-explain-expanded.png)

### Boolean override via toggle
![boolean override](./06-boolean-override.png)

### JSON override applied (validated on blur)
![json override](./07-json-override.png)

### Invalid JSON rejected at the control
![json invalid](./08-json-invalid.png)

### Filtered list with updated counts
![filtered](./09-filtered.png)

### Clear all overrides restores resolved state
![clear all](./10-clear-all.png)

## Stress mode (300 features)

### Panel open at top: 300 features, compact rows
![stress compact top](./11-stress-compact-top.png)

### Filter narrowing 300 features instantly
![stress filtered](./12-stress-filtered.png)

### Heavy feature expanded (500-item JSON payload)
![stress heavy expanded](./13-stress-heavy-expanded.png)

### Override applied on a deep row under load
![stress override](./14-stress-override-under-load.png)

## Before the redesign (old always-mounted panel)

These are the captures that motivated the Task 14 redesign: every row's full controls mounted eagerly, ten 35KB textareas live in the DOM, and a single keystroke into one of them froze the page main thread hard enough to hang the automation driver for its full 30-minute timeout.

### Old panel at 300 features
![before panel top](./before-9-stress-panel-top.png)

### Old panel scrolled deep into the list
![before scrolled](./before-10-stress-scrolled.png)

### Old heavy JSON textarea (the one that froze on a keystroke)
![before heavy json](./before-11-stress-heavy-json.png)

### Old override under load
![before override](./before-12-stress-override-under-load.png)
