# Portal visual QA

The RTM dashboard / portal is rendered HTML, so it warrants a visual pass. You don't need a real repo
— generate representative sample dashboards and open them in a browser.

## 1. Generate the samples

```bash
npm run build        # if dist/ is stale
node scripts/preview-rtm.mjs
```

This writes (gitignored) into `preview/`:

| File | What it is |
|------|-----------|
| `rtm-sample.html` | the static report |
| `rtm-portal-sample.html` | the **live** portal (Run button + history) |
| `rtm-portal-readonly-sample.html` | the **git-backed read-only** dashboard |

The fixture covers every case on purpose: ✅ verified, ❌ failing, 🧪 unverified, 📋 specified, ⚠️ drift,
**1 regression** (verified→failing), 1 improvement, and 1 👻 orphan test.

Open any file directly in a browser (`file://…/preview/rtm-portal-sample.html`).

## 2. Checklist

**Layout & content**
- [ ] Title + commit badge (`a1b2c3d4 @main`, "uncommitted" shown because the fixture is dirty).
- [ ] Stat cards: Total, Verified, Failing, Unverified, Specified, Drift, **Regressions**, Coverage.
- [ ] Red **regression banner** lists `PROJ-2 … verified → failing`.
- [ ] Each row shows a colored state pill; the regressed row has a red **"↩ was verified"** marker.
- [ ] Drift rows show ⚠️ next to the key; the **Orphan tests** block lists `PROJ-999`.

**Interaction**
- [ ] Clicking a stat card filters the table to that state; **Regressions** card shows only the regressed row.
- [ ] The search box filters by key/title/status.
- [ ] (Live portal) the **▶ Run** button is present; (read-only) it's replaced by the **● read-only · git-backed** badge and there's no Run button.
- [ ] **History** disclosure lists the recent run snapshots.

**Quality**
- [ ] No layout breakage at a narrow width (~375px) — cards wrap, table scrolls.
- [ ] Browser console has no errors (the only script is the inline filter/run logic).
- [ ] Colors are legible (green/red/amber/grey) and the regression banner reads as an alert.

## 3. Static check (no browser)

A quick sanity check that the renderer emits every element (used in lieu of a browser when one isn't
available): the sample HTML must contain the doctype, the Run button, the regression banner + card, all
state pills, the "↩ was" marker, the orphan block, the history disclosure, the search box, and the
filter script. The renderers are also unit-tested in `test/trace.test.js` / `test/trace.serve.test.js`.
