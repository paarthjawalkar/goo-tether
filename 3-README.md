# goo-tether

A fixed element wrapped in black liquid. Bring a mouse or finger near and the
liquid around the element stretches toward it like a magnet. The element never
moves; move away and the liquid settles back.

Vanilla JS, zero dependencies, MIT licensed. Mouse and touch (Pointer Events).

**Demo:** https://paarthjawalkar.github.io/goo-tether/ (auto-plays until you touch it)

## Usage

```html
<script src="goo-tether.js"></script>
<button id="pill">let's collaborate</button>
<script>
  var tether = new GooTether({ color: '#0d0d0d' });
  tether.attach(document.getElementById('pill'));
</script>
```

Set `color` to match your element. Options: `points`, `chain`, `skin`, `radius`,
`range` (px the pointer can attract from), `reach` (max stretch), `stiffness`,
`damping`, `onFrame(pointer, active)`.

API: `attach(el)`, `setPointer(x, y)`, `clearPointer()`, `destroy()`.

MIT licensed.
