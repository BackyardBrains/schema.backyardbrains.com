"""Build static/star-inperson/img/face_blindfold_{R,L}.png (2026-09-30).

Source: the open-eyed face (static/star-inperson/img/face_open_R.png, a byte copy of
static/star/img/BlankFaceLookingRight (1).png) plus the hand-drawn band blindfold from
static/star/img/BlindfoldDrawingRight.png (384x480, same head drawing at lower resolution).
Only the blindfold (filled band over the eye + strap to the ear) is taken from the drawing,
upscaled to 1080x1350 and laid over the open face, so the open and blindfold images differ
only by the blindfold: every opaque pixel of the open face stays opaque, and the head outline,
nose, mouth and ear stay pixel-identical. L is the exact mirror of R.

Usage (repo root): python3 tools/make_blindfold.py [path/to/BlindfoldDrawingRight.png]
"""
import sys
import numpy as np
from PIL import Image

DRAWING = sys.argv[1] if len(sys.argv) > 1 else 'static/star/img/BlindfoldDrawingRight.png'
OPEN_R = 'static/star-inperson/img/face_open_R.png'
BAND_ROWS = (350, 666)      # rows (1080x1350 px) that contain the band and strap; outside them nothing changes
BAND_COLS = (150, 960)
LINE_TOL = 3                # drawing ink within this many px of an open-face line is the shared head drawing
CLOSE_R = 7                 # closing radius that fills the band around the (covered) open eye lines


def shift_or(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


def erode(m, r):
    return ~shift_or(~m, r)


def main():
    op = Image.open(OPEN_R).convert('RGBA')
    dr = Image.open(DRAWING).convert('RGBA').resize(op.size, Image.LANCZOS)
    o, d = np.asarray(op).copy(), np.asarray(dr)
    open_ink, draw_ink = o[..., 3] > 32, d[..., 3] > 32
    added = draw_ink & ~shift_or(open_ink, LINE_TOL)             # blindfold-only ink
    box = np.zeros_like(added)
    box[BAND_ROWS[0]:BAND_ROWS[1], BAND_COLS[0]:BAND_COLS[1]] = True
    mask = erode(shift_or(added & box, CLOSE_R), CLOSE_R) & box   # fill gaps around covered eye lines
    mask &= shift_or(draw_ink, 1)                                  # never paint outside the drawn blindfold
    # the solid band itself (drawing fully opaque, wider than any line): paint all of it, so no open-face
    # pixel (e.g. the anti-aliased pupil edge) shows through the blindfold
    band = shift_or(erode(d[..., 3] == 255, 6), 6) & box
    mask |= shift_or(band, 6) & draw_ink       # reaches the head outline, as in the drawing
    # alpha-composite the drawing over the open face inside the mask; alpha can only increase
    da = d[..., 3:4] / 255.0
    oa = o[..., 3:4] / 255.0
    out_a = da + oa * (1 - da)
    rgb = np.where(out_a > 0, (d[..., :3] * da + o[..., :3] * oa * (1 - da)) / np.maximum(out_a, 1e-6), 0)
    comp = np.concatenate([rgb, out_a * 255], axis=2).round().astype(np.uint8)
    res = o.copy()
    res[mask] = comp[mask]
    res[..., 3] = np.maximum(res[..., 3], o[..., 3])
    R = Image.fromarray(res, 'RGBA')
    R.save('static/star-inperson/img/face_blindfold_R.png', optimize=True)
    R.transpose(Image.FLIP_LEFT_RIGHT).save('static/star-inperson/img/face_blindfold_L.png', optimize=True)
    print('added pixels:', int(mask.sum()))


if __name__ == '__main__':
    main()
