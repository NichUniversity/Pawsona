"""Render frames of golden_retriever_happy.blend.
[BLEND=other.blend] python3 render_happy.py <outdir> <pct> <frames...|all>"""
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
outdir, pct = sys.argv[1], int(sys.argv[2])
frames = sys.argv[3:]
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, os.environ.get("BLEND", "golden_retriever_happy.blend")))
sc = bpy.context.scene
sc.render.resolution_percentage = pct
sc.cycles.samples = 8
sc.cycles.device = "CPU"
if frames == ["all"]:
    frames = range(sc.frame_start, sc.frame_end + 1)
os.makedirs(outdir, exist_ok=True)
for f in frames:
    f = int(f)
    sc.frame_set(f)
    sc.render.filepath = os.path.join(outdir, f"f{f:03d}.png")
    bpy.ops.render.render(write_still=True)
    print("done", f, flush=True)
