"""Rebuild the play-bow animation from INSIDE Blender, then reload it.

How to use (in golden_retriever_playbow.blend):
  1. Scripting tab -> Text Editor -> Text > Open -> rebuild_from_blender.py
  2. Click the  ▶  (Run Script) button in the Text Editor header.
  3. Wait a few seconds; the file reloads with your changes.

It runs exactly what rebuild_playbow.bat does:
  blender.exe -b -P build_playbow_golden.py   (in this folder)
Output (leg/paw numbers, or an error) is printed to Window > Toggle System Console.
"""
import os
import subprocess

import bpy

here = bpy.path.abspath("//")
script = os.path.join(here, "build_playbow_golden.py")
print("Rebuilding with", script, "...")
r = subprocess.run([bpy.app.binary_path, "-b", "--factory-startup", "-P", script],
                   cwd=here, capture_output=True, text=True)
print(r.stdout[-4000:])
if r.stderr.strip():
    print(r.stderr[-3000:])

if r.returncode == 0 and "saved" in r.stdout:
    def _reload():
        win = bpy.context.window_manager.windows[0]
        with bpy.context.temp_override(window=win):
            bpy.ops.wm.revert_mainfile()
        return None
    bpy.app.timers.register(_reload, first_interval=0.3)
    print("Rebuilt OK - reloading the file.")
else:
    raise RuntimeError("Rebuild failed - open Window > Toggle System Console to see why.")
