# goo-tether

Gooey symbiote-style drag tether for any HTML element. Grab the element and it
dangles from your pointer on stretchy black goo strands; yank it too far or let
go and the strands snap and it springs home.

Vanilla JS, zero dependencies, MIT licensed. Works with mouse and touch
(Pointer Events), so it runs on Android Chrome out of the box.

**Demo:** open `index.html`, or serve the folder with any static server:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

The demo page auto-plays the effect until you touch it, and the label of the
pill is editable from the bottom toolbar.

## Usage

```html
<script src="goo-tether.js"></script>
<button id="pill">let's collaborate</button>
<script>
  var tether = new GooTether({ color: '#0d0d0d' });
  tether.attach(document.getElementById('pill'));
  // the element's current on-screen position becomes its home
</script>
```

The element is taken over with `position: fixed` and moved via transforms.
Set the goo `color` to match your element so the strands merge into it.

### Options

| Option          | Default | Meaning |
|-----------------|---------|---------|
| `color`         | `#161616` | goo color (match your element) |
| `strands`       | `7`     | number of tendril strands |
| `thickness`     | `18`    | strand width (px) |
| `restLength`    | `210`   | px the element dangles from the pointer |
| `maxStretch`    | `480`   | px before strands tear and regrow |
| `follow`        | `0.055` | spring stiffness while grabbed |
| `grabDamping`   | `0.90`  | velocity kept per frame while grabbed |
| `gravity`       | `0.22`  | pendulum pull while dangling |
| `returnSpring`  | `0.085` | spring stiffness back home on release |
| `returnDamping` | `0.865` | velocity kept per frame while returning |
| `spread`        | `15`    | px between strand roots on the element |
| `tipSpread`     | `9`     | px between strand tips at the pointer |
| `wobble`        | `0.5`   | organic wobble amount (0 disables) |
| `onFrame`       | `null`  | `fn(tip, state)` called every frame; `tip` is the lagging pointer end, handy for attaching a cursor graphic |

### API

- `attach(el)` — wire up an element; its current position becomes home
- `grab(x, y)` / `moveTo(x, y)` / `release()` — programmatic control
- `setHome(x, y)` — move the home anchor
- `destroy()` — remove the overlay and listeners

## How it works

- A full-viewport SVG sits behind the element. Each strand is one stroked
  quadratic-bezier path between a lagging pointer-side endpoint and the
  element. The SVG group carries a goo filter (`feGaussianBlur` + a
  high-contrast `feColorMatrix` on alpha), so strands melt into the blobs at
  each end and into each other where they overlap.
- Every strand endpoint trails the pointer with its own spring constant, so
  the strands fan out and whip instead of moving as one rigid rope.
- While grabbed, the element dangles from the pointer at `restLength` with a
  spring and a touch of gravity — a pendulum, not a rigid follow.
- Stretch past `maxStretch` and strands tear into droplets, then regrow.
  Release, and the free ends recoil with the pointer's last velocity while the
  element springs home with overshoot.

## License

MIT — see [LICENSE](LICENSE).

Inspired by a gooey drag interaction seen in a design-demo video online.
This is an original implementation: no code, assets, or artwork were copied.
