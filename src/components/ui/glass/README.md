# Glass components

Ported from [Ein UI](https://github.com/einui/einui) (`registry/liquid-glass`, `registry/innovative`), MIT licence,
© Ehsan Ghaffar. Adapted for this app:

- React 19 function components (ref as a prop), the repo's code style, relative imports.
- **CSP-safe.** The page runs with `style-src 'self'`, so no Radix part that injects `<style>` elements is used
  (Dialog, Sheet, AlertDialog, Popover, Select, ScrollArea). Dialogs are the native `<dialog>` styled as Ein UI's
  GlassDialog (`.rp-dialog` in `styles/glass.css`); `GlassSelect` keeps the native `<select>`.
- Hover scale and looping animations are switched off under `prefers-reduced-motion`.

| Component | Ein UI source | Used in |
|---|---|---|
| `GlassButton` | liquid-glass/glass-button | Worklist «Novo estudo» |
| `GlassCard` | liquid-glass/glass-card | Worklist counters (glow only on «Relatórios por validar») |
| `GlassInput`, `GlassSelect` | liquid-glass/glass-input, glass-select | Worklist search and filters |
| `GlassSwitch` | liquid-glass/glass-switch | Settings toggles |
| `GlassProgress` | liquid-glass/glass-progress | Findings review progress |
| `GlassTooltip` | liquid-glass/glass-tooltip | Viewer tools, status pills |
| `GlassTimeline` | innovative/glass-timeline | Método → pipeline |
| `GlassDock` | innovative/glass-dock | Phone navigation |

The rest of the app (buttons, cards, chips, tabs, menus, dialogs) gets the same recipe through its own classes in
`styles/glass.css`: translucent white fill, thin white border, top highlight, inner rim, white accents; hue only where it carries clinical meaning.
