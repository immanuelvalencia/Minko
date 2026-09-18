# Minko

An interactive 3D video viewer inspired by Hermann Minkowski's space-time perspective.
A clip is decoded into a single spatiotemporal frame stack — width and height are the
picture, depth is time — and drawn as one solid
block you can orbit, scrub and move through.

There are no discrete frame planes. The whole clip is uploaded as a 3D texture and
raymarched, so trilinear filtering interpolates *along the time axis* exactly as it
does across x and y. A pixel moving through the clip draws a continuous streak
through the block rather than a dotted line of separate quads. That is the point of
the thing: you see the flow of pixels, not a stack of stills.

Next.js 16 (App Router) + React 19 + Three.js.

## Running it

```
npm install
npm run dev        # http://localhost:3000
```

`npm run build` for a production build, `npm run typecheck` for types only.
Requires Node 20.9+.

## Included demos

The opening screen includes two small built-in MP4 demos in `public/demos/`:
**Kinetic Bounce** and **DVD Corner Chase**. They are loaded locally by the app and
provide quick motion-path examples for evaluating the frame-stack view.

## Opening screen

Minko opens with a short animated space-time scene while the viewer initializes.
It transitions into the viewer automatically. A brief synthesized cue plays when
the browser permits audible autoplay; otherwise the opening remains silent.

## Deploying

Vercel detects Next.js with no configuration — framework preset, build command and
output directory are all inferred.

```
vercel          # first deploy of a new project is always production
vercel --prod   # every deploy after that
```

Or import the repo in the dashboard for a deploy on every push.

Note there are deliberately no `Cross-Origin-Opener-Policy` /
`Cross-Origin-Embedder-Policy` headers. Nothing here needs cross-origin isolation,
and turning it on is a good way to break third-party resources in production while
everything still works locally.

## Layout

```
app/
  layout.tsx          document shell and metadata
  page.tsx            server component, renders the client wrapper
  globals.css
components/
  MinkoClient.tsx       'use client' + dynamic(ssr:false) boundary
  Minko.tsx             clip lifecycle, playback clock, engine refs
  VolumePanel.tsx       generated from VOLUME_CONTROLS
  EffectsPanel.tsx      generated from EFFECTS
  ExportDialog.tsx
  Overlays.tsx          dropzone, progress, error, notice
  config.ts             control tables and defaults
lib/
  extractor.js          file -> probe -> RGBA volume
  volume.js             3D texture + raymarching shader
  effects.js            screen-space post pass
  export.js             frame-accurate cinematic recording
  viewer.js             renderer, camera, orbit controls
```

React owns the chrome and never the frame. The engine classes in `lib/` run their
own animation loop and live in refs, so a re-render can't rebuild them, and the
render loop never waits on React.

Two consequences of that split are worth knowing before you touch either side:

**The canvas is created imperatively** inside the boot effect rather than rendered
by React. A WebGL context belongs to its canvas element for that element's
lifetime, so under StrictMode's double mount in development the second `Viewer`
would otherwise be handed the first one's disposed context. A fresh element per
mount avoids it entirely; `Viewer.dispose()` also calls `forceContextLoss()`.

**The playhead lives in a ref**, and React state is only updated when the whole
frame number changes. Mirroring a 60 fps value into state directly would re-render
the tree every frame for no visible benefit.

`lib/` is plain JavaScript, not TypeScript. That is deliberate: those modules carry
the shader and extraction work that has actually been verified in a real WebGL2
context, and retyping them would have thrown that away for no functional gain.
Converting them is a clean follow-up, not a prerequisite.

## Extraction

`probeVideo` loads the file into a `<video>` and measures the real frame rate from
`requestVideoFrameCallback` presentation timestamps, snapping to a broadcast rate
(23.976, 29.97, …) when it lands within 2%. Files with no duration in the container
— anything recorded by `MediaRecorder`, including screen recordings — are pushed
past their end to force the decoder to settle on a real length.

`extractVolume` then steps `currentTime` to the midpoint of each frame interval and
draws the settled frame into a canvas. This is slower than a WebCodecs pipeline but
needs no demuxer, works with every format the browser can play, and lands on every
frame rather than whatever the compositor happened to present. Budget roughly
10–40 ms per frame.

## The memory budget

The frame stack is capped at **256 MB** (`VOLUME_BUDGET_BYTES` in `components/config.ts`).
Depth is fixed by the clip — one slice per frame — so slice resolution absorbs the
budget:

| frames | slice size | frame stack |
|--------|-----------|--------|
| 120    | 640×360 (source) | 111 MB |
| 1,200  | 315×177   | 268 MB |
| 5,000  | 241×135, sampled to 2,048 slices | 267 MB |

Slices are never upscaled past the source. `MAX_3D_TEXTURE_SIZE` (2,048 on most
GPUs) caps the frame count; beyond that, slices are sampled evenly across the whole
timeline rather than truncating it. Whenever either compromise applies, the app says
so in a notice bar rather than quietly degrading.

The upload dialog orders **Frame detail** from Light (up to 512 slices) to Balanced
(up to 1,024) to Full detail (up to the GPU limit). Every preset spans the entire
source duration; lower slice counts reduce processing time and memory use but do
not preserve every source frame. The dialog warns about local processing costs.
For clips over 2 minutes, open **Enable longer videos** and acknowledge the
disclaimer before processing.

## The shader

Density is quoted **per frame-thickness of material** and integrated over each ray
step, which keeps the block's weight identical at every quality setting.

The integration is deliberately isotropic — it does not scale by the ray's component
along the time axis. That would be physically tidy and visually useless: a ray
travelling perpendicular to time crosses zero frames, so the block would vanish the
moment you orbited to look at it side-on.

Frames behind the playhead form the desaturated trail, frames ahead stay as a
fainter shell, and the playhead itself is a bright band at full saturation. That
band is never allowed to be thinner than one marching step, or a coarse march steps
straight over it.

**Orientation:** the default camera sits on the −z side so frame 0 is the near face,
which means world +x runs leftwards across the screen. The shader flips u to
compensate. Change the camera side and that flip has to go.

## Effects

Each effect has its own switch and strength, plus a master switch, under the
**Effects** tab. They split across two shaders by what they need to know.

Inside the raymarch, because they depend on where a sample sits in the clip:

- **Depth haze** dissolves the far end of the block into the void with distance.
- **Motion glow** lights up pixels that are changing, from the difference between
  the slices either side of the sample. It fades out across the playhead band, so
  the frame you are actually reading stays true colour.
- **Motion reveal** turns that difference into opacity, so anything holding still
  becomes transparent and you fly through only the moving part of the clip. It
  deliberately does *not* spare the playhead: sparing it would leave an opaque slice
  blocking the view into everything the effect just opened up.

In the post pass, because they are screen-space:

- **Warp streaks** smear the image radially outward from the centre.
- **Chromatic warp** splits the channels along those same streaks, so the fringing
  reads as speed rather than as a glitch.
- **Vignette** and **film grain**.

Both motion effects share one temporal difference, computed only when one of them
is on. The post pass is skipped entirely when nothing in it is enabled, so effects
cost nothing while switched off.

## Cinema mode and export

**C** hides the chrome and leaves the viewer full-bleed; the cursor and the restore
pill fade out after a few still seconds. **Esc** or **C** brings it back.

**E**, or the Export button, records a cinematic pass to an MP4 video file. Four camera
moves are available: fly through along the time axis, slow orbit, drift in, or hold
the current view. Export length always follows the loaded source video, while frame
rate, resolution and aspect (including 2.39:1) remain selectable. The cinematic
effects switch adds depth haze, motion glow, speed streaks, chromatic separation,
vignette and fine grain for that exported pass only.

Capture is frame-accurate: the canvas is captured at the selected frame rate and
the renderer advances on the same media-clock cadence so the MP4 timeline matches
the source duration. The renderer is switched to the exact output size for
the duration and restored
afterwards, along with the camera and interactive effect settings. MP4 encoding
requires a browser with MediaRecorder MP4 support; the app reports clearly when it
is unavailable instead of downloading a mislabeled file.

## Controls

Space plays and pauses. Arrow keys step a frame, Shift+arrow steps ten. Home and End
jump to the ends. R resets the camera, C toggles cinema mode, E opens the exporter.
Drag to orbit, scroll to zoom, right-drag to pan.

**Block opacity** is per frame, not per block. At 1.0 the first slice a ray meets is
already opaque, which is what makes the near face read as frame 0 and the far face
as the last frame. **Trail opacity** is the same for the region you have played
through, defaulted low so you can see into the block; at 0 the played region
disappears and the current frame becomes the new front face of what remains.
**Fade with distance** thins the oldest frames instead of cutting them.

Block depth spans 0.3 to 80 world units. The slider carries a 0–1 position and the
length is exponential in it, because a linear control would spend nearly all its
travel on lengths nobody picks. Ray quality is unaffected by block length — the
march works in the box's own unit space.

## Status

Verified in a real WebGL2 context: both shaders compile and link, the frame stack renders
with every effect switched on, and a marker stack lands the right way up and the
right way round on screen. The memory-budget maths produces the layouts above, and
extraction decodes a real clip to a correct frame stack (frame rate detected exactly,
slices distinct, timestamps ascending). The TypeScript components typecheck.

Not yet run end-to-end in a browser: the environment this was built in has no route
to npm, so `next dev` has never been executed against it. Run it once and check the
console.

## Next: Supabase

Phase 2 is persistence. Nothing is wired up yet; the seams are:

- `loadFile` in `Minko.tsx` takes a `File`, and `probeVideo` only needs a
  `Blob`, so a clip fetched from storage drops straight in.
- A route handler under `app/api/` is the place for anything needing the service
  role key or rate limiting — which, with no login, is the first thing you will
  want.

Sketch, for a public bucket with no login:

```sql
create table videos (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  duration    double precision,
  fps         double precision,
  width       int,
  height      int,
  frame_count int,
  created_at  timestamptz default now()
);

alter table videos enable row level security;
create policy "anon read"   on videos for select to anon using (true);
create policy "anon insert" on videos for insert to anon with check (true);
```

Storage: one public bucket, objects at `{id}/source.<ext>`. Frames stay client-side
— uploading them would mean thousands of objects per clip for no gain, since the
frame stack has to be rebuilt on the GPU anyway.

The anon key is publishable by design, so `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are fine as public env vars guarded by RLS. Anything
stronger belongs in a route handler with a server-only variable.
