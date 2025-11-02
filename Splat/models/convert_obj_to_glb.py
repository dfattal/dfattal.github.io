#!/usr/bin/env python3
"""
Convert OBJ file to GLB format
"""
import sys
import os

try:
    import trimesh
except ImportError:
    print("Error: trimesh library not found. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "trimesh[easy]"])
    import trimesh

def convert_obj_to_glb(obj_path, glb_path=None):
    """
    Convert an OBJ file to GLB format

    Args:
        obj_path: Path to input OBJ file
        glb_path: Path to output GLB file (optional, defaults to same name with .glb extension)
    """
    if not os.path.exists(obj_path):
        raise FileNotFoundError(f"OBJ file not found: {obj_path}")

    # Generate output path if not provided
    if glb_path is None:
        glb_path = os.path.splitext(obj_path)[0] + '.glb'

    print(f"Loading OBJ file: {obj_path}")

    # Load the OBJ file
    mesh = trimesh.load(obj_path, force='mesh')

    print(f"Mesh info:")
    print(f"  - Vertices: {len(mesh.vertices)}")
    print(f"  - Faces: {len(mesh.faces)}")

    # Export to GLB
    print(f"Exporting to GLB: {glb_path}")
    mesh.export(glb_path, file_type='glb')

    print(f"✓ Conversion complete!")
    print(f"  Output: {glb_path}")
    print(f"  Size: {os.path.getsize(glb_path) / 1024:.1f} KB")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python convert_obj_to_glb.py <input.obj> [output.glb]")
        sys.exit(1)

    obj_path = sys.argv[1]
    glb_path = sys.argv[2] if len(sys.argv) > 2 else None

    convert_obj_to_glb(obj_path, glb_path)
