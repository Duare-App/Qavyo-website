"""Turn the supplied logo.png into a header-ready asset.

The source is a red wordmark sitting on a solid black field with a lot of
padding, which would render as a black box in the site's white header. This
crops it to the mark and rebuilds it with a transparent background.

The background is pure black and the mark is pure red, so luminance doubles as
a clean alpha channel — that keeps the antialiased edges soft instead of the
hard, haloed edges a colour-key would leave behind.

Run: python make_logo.py
"""

from PIL import Image

# The source lives outside Qavyo-images/ because that directory is where the
# build downloads remote assets — a fetched file sharing this basename would
# otherwise overwrite the original artwork.
SRC = "brand/logo.png"
OUT = "Qavyo-images/qavyo-logo.png"
TARGET_HEIGHT = 80  # header logo slot is ~40px; 2x for retina

img = Image.open(SRC).convert("RGB")
r, g, b = img.split()

# Everything below depends on the artwork being a light mark on a dark field.
# Fed a logo on a white background it would happily produce an inverted, mostly
# opaque rectangle, so check the assumption rather than emit something broken.
corners = [img.getpixel(p) for p in
           [(0, 0), (img.width - 1, 0), (0, img.height - 1), (img.width - 1, img.height - 1)]]
if max(sum(c) for c in corners) > 3 * 90:
    raise SystemExit(
        f"{SRC}: expected a dark background, but the corners are light "
        f"{corners}. This script keys the mark out of a dark field; a logo on a "
        f"light background needs the alpha derived the other way round."
    )

# Luminance-as-alpha. The mark is red, so the red channel carries the shape.
# The "black" field is not pure black — it carries sensor grain — so everything
# below the floor is forced fully transparent and the rest is stretched back
# over the full range, which keeps the antialiased edges intact.
FLOOR = 40
alpha = r.point(lambda v: 0 if v < FLOOR else round((v - FLOOR) * 255 / (255 - FLOOR)))

# Recolour every pixel to the logo's red, letting alpha define the shape.
sample = img.crop((0, 0, img.width, img.height)).getcolors(img.width * img.height)
brightest = max(sample, key=lambda c: c[1][0] + c[1][1] + c[1][2])[1]
solid = Image.new("RGB", img.size, brightest)
out = solid.convert("RGBA")
out.putalpha(alpha)

# Crop away the padding.
bbox = out.getbbox()
if bbox is None:
    raise SystemExit(f"{SRC}: nothing survived the alpha threshold — the mark is "
                     f"too dark to separate from its background.")
out = out.crop(bbox)

# If the crop barely shrank the image, the threshold did not actually separate
# anything and the "logo" would just be the whole frame.
if (bbox[2] - bbox[0]) > img.width * 0.97 and (bbox[3] - bbox[1]) > img.height * 0.97:
    raise SystemExit(f"{SRC}: the mark could not be separated from its background "
                     f"(crop kept the whole frame). Check FLOOR, currently {FLOOR}.")

# Scale to the height the header actually uses.
ratio = TARGET_HEIGHT / out.height
out = out.resize((round(out.width * ratio), TARGET_HEIGHT), Image.LANCZOS)

# The stylesheet sizes the logo into boxes cut for the original 6997x1837
# artwork. Padding to that same ratio means this drops into every existing slot
# without letterboxing or restyling.
SOURCE_RATIO = 6997 / 1837
target_width = round(TARGET_HEIGHT * SOURCE_RATIO)
if target_width > out.width:
    padded = Image.new("RGBA", (target_width, TARGET_HEIGHT), (0, 0, 0, 0))
    padded.paste(out, ((target_width - out.width) // 2, 0))
    out = padded

out.save(OUT, "PNG", optimize=True)
print(f"{OUT}  {out.width}x{out.height}  ratio={out.width / out.height:.2f}  colour={brightest}")

# Favicons need a square, so they use the Q on its own rather than the full
# wordmark, taken from the tight crop before any padding was added.
mark = Image.open(SRC).convert("RGB").split()[0]
mark = mark.point(lambda v: 0 if v < FLOOR else round((v - FLOOR) * 255 / (255 - FLOOR)))
glyph = Image.new("RGB", mark.size, brightest).convert("RGBA")
glyph.putalpha(mark)
glyph = glyph.crop(glyph.getbbox())

# The Q ends at the first fully empty column — the gap before the wordmark.
# Slicing at a fixed square would clip the Q's tail, which overhangs to the
# right of the bowl.
cols = [glyph.crop((x, 0, x + 1, glyph.height)).getchannel("A").getextrema()[1]
        for x in range(glyph.width)]
gap = next(x for x in range(1, len(cols)) if cols[x] == 0 and cols[x - 1] > 0)
glyph = glyph.crop((0, 0, gap, glyph.height))

# Centre it on a transparent square so the icon is not distorted.
side = max(glyph.width, glyph.height)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.paste(glyph, ((side - glyph.width) // 2, (side - glyph.height) // 2))
glyph = square

for name, size in [("qavyo-favicon-16.png", 16),
                   ("qavyo-favicon-32.png", 32),
                   ("qavyo-touch-icon.png", 180)]:
    icon = glyph.resize((size, size), Image.LANCZOS)
    icon.save(f"Qavyo-images/{name}", "PNG", optimize=True)
    print(f"Qavyo-images/{name}  {size}x{size}")
