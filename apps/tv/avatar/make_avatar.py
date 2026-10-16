"""Builds Huddle's player characters in Blender and renders them as 3D-shaded cutout sprites (one PNG per body part per player).
The TV app (and the phone's sim preview) rig these sprites to MediaPipe's 33 landmarks in real time.

Run:  /Applications/Blender.app/Contents/MacOS/Blender -b -P apps/tv/avatar/make_avatar.py -- <out_dir>
Output: <out_dir>/p<N>_<part>.png and <out_dir>/parts.json (sprite sizes + anchor geometry in pixels).
"""
import bpy, bmesh, json, math, os, sys
from mathutils import Vector

OUT = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
os.makedirs(OUT, exist_ok=True)
PPU = 900  # render pixels per metre
PAD = 0.06  # metres of padding around each part

PLAYERS = [  # shirt = player color (matches PLAYER_COLORS), plus a varied look per player
    {"shirt": "#E69F00", "skin": "#C68863", "hair": "#3B2416", "shorts": "#1F2A44", "bun": False},
    {"shirt": "#56B4E9", "skin": "#F1C9A5", "hair": "#D9B25F", "shorts": "#2B2B2B", "bun": False},
    {"shirt": "#009E73", "skin": "#7A4B2A", "hair": "#141010", "shorts": "#33334D", "bun": False},
    {"shirt": "#CC79A7", "skin": "#E0AC7E", "hair": "#1E1512", "shorts": "#2A2240", "bun": True},
]

# Body proportions (metres). Anchor-to-anchor lengths match how the TV measures each bone.
L = {"upper_arm": 0.30, "forearm": 0.26, "hand": 0.17, "thigh": 0.43, "shin": 0.42, "torso": 0.50, "neck": 0.22}
SHOULDER_W = 0.36
HEAD_W, HEAD_H = 0.20, 0.25
SHOE_W, SHOE_H = 0.13, 0.11


def hex_rgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c] + [1]  # sRGB -> linear


def material(name, color, rough=0.55, sss=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = hex_rgb(color)
    b.inputs["Roughness"].default_value = rough
    if sss and "Subsurface Weight" in b.inputs:
        b.inputs["Subsurface Weight"].default_value = sss
    return m


OUTLINE = bpy.data.materials.new("outline")
OUTLINE.use_nodes = True
OUTLINE.node_tree.nodes.clear()
_o = OUTLINE.node_tree.nodes.new("ShaderNodeOutputMaterial")
_e = OUTLINE.node_tree.nodes.new("ShaderNodeEmission")
_e.inputs["Color"].default_value = (0.02, 0.02, 0.04, 1)
OUTLINE.node_tree.links.new(_e.outputs[0], _o.inputs[0])
OUTLINE.use_backface_culling = True


def finish(obj, mat, outline=0.008):
    obj.data.materials.append(mat)
    obj.data.materials.append(OUTLINE)
    for p in obj.data.polygons:
        p.use_smooth = True
    if outline:
        s = obj.modifiers.new("outline", "SOLIDIFY")  # inverted-hull cartoon outline
        s.thickness = outline
        s.offset = 1
        s.use_flip_normals = True
        s.material_offset = 1
    return obj


def capsule(name, r_top, r_bot, length, mat, z_top, outline=0.008, flat=(1.0, 1.0)):
    """Tapered capsule from z_top down `length`, radii r_top -> r_bot."""
    bm = bmesh.new()
    seg, rings = 32, 12
    verts = []
    # top hemisphere, body, bottom hemisphere as a lathe profile
    prof = []
    for i in range(rings + 1):
        a = math.pi / 2 * (1 - i / rings)
        prof.append((r_top * math.cos(a), z_top + r_top * math.sin(a) * flat[0]))
    for i in range(1, 8):
        k = i / 8
        prof.append((r_top + (r_bot - r_top) * k, z_top - length * k))
    for i in range(rings + 1):
        a = -math.pi / 2 * i / rings
        prof.append((r_bot * math.cos(a), z_top - length + r_bot * math.sin(a) * flat[1]))
    for r, z in prof:
        ring = [bm.verts.new((r * math.cos(2 * math.pi * j / seg), r * math.sin(2 * math.pi * j / seg) * 0.85, z)) for j in range(seg)]
        verts.append(ring)
    for a, b in zip(verts, verts[1:]):
        for j in range(seg):
            bm.faces.new((a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    return finish(obj, mat, outline)


def rounded_box(name, w_top, w_bot, depth, z_top, z_bot, mat):
    """Tapered, bevelled box (torso/shorts) from z_top down to z_bot."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, (z_top + z_bot) / 2))
    o = bpy.context.active_object
    o.name = name
    o.scale = (1, depth, z_top - z_bot)
    bpy.ops.object.transform_apply(scale=True)
    for v in o.data.vertices:
        v.co.x *= w_top if v.co.z > 0 else w_bot
    b = o.modifiers.new("bevel", "BEVEL"); b.width = 0.07; b.segments = 8
    o.modifiers.new("smooth", "SUBSURF").levels = 2
    return finish(o, mat, 0.01)


def blob(name, size, loc, mat, outline=0.008):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, mat, outline)


def text(name, body, loc, size, mat):
    bpy.ops.object.text_add(location=loc, rotation=(math.radians(90), 0, 0))
    t = bpy.context.active_object
    t.name = name
    t.data.body = body
    t.data.size = size
    t.data.extrude = 0.004
    t.data.align_x = "CENTER"
    t.data.align_y = "CENTER"
    t.data.materials.append(mat)
    return t


def build(p, i):
    """Returns {part: [objects]} for player p, each part centred so its anchors sit on the z axis."""
    skin = material(f"skin{i}", p["skin"], 0.5, 0.15)
    shirt = material(f"shirt{i}", p["shirt"], 0.7)
    shorts = material(f"shorts{i}", p["shorts"], 0.7)
    hair = material(f"hair{i}", p["hair"], 0.45)
    white = material(f"white{i}", "#F4F4F4", 0.6)
    dark = material(f"dark{i}", "#1A1A22", 0.4)
    parts = {}
    h = L["upper_arm"]
    parts["upper_arm"] = [capsule(f"ua{i}", 0.06, 0.056, h * 0.5, shirt, h / 2),  # short sleeve
                          capsule(f"uas{i}", 0.048, 0.042, h, skin, h / 2, 0.006)]
    h = L["forearm"]
    parts["forearm"] = [capsule(f"fa{i}", 0.045, 0.034, h, skin, h / 2)]
    h = L["hand"]
    parts["hand"] = [blob(f"hd{i}", (0.045, 0.03, 0.085), (0, 0, 0.0), skin)]
    h = L["thigh"]
    parts["thigh"] = [capsule(f"th{i}", 0.082, 0.07, h * 0.62, shorts, h / 2),  # shorts end above the knee
                      capsule(f"thk{i}", 0.07, 0.056, h, skin, h / 2, 0.006)]
    h = L["shin"]
    parts["shin"] = [capsule(f"sh{i}", 0.056, 0.04, h, skin, h / 2),
                     capsule(f"sock{i}", 0.044, 0.042, h * 0.22, white, -h * 0.28, 0.006)]
    parts["shoe"] = [blob(f"shoe{i}", (0.06, 0.07, 0.045), (0, 0, 0.012), dark), blob(f"sole{i}", (0.062, 0.072, 0.014), (0, 0, -0.03), white, 0.004)]
    h = L["torso"]
    # flat-topped capsules: gently sloped shoulders at the anchor line, shorts covering the hips
    torso = capsule(f"to{i}", 0.18, 0.135, h * 0.62, shirt, h / 2 - 0.04, 0.01, flat=(0.3, 0.5))
    torso.scale = (1.0, 0.6, 1)
    waist = capsule(f"wa{i}", 0.14, 0.14, h * 0.26, shorts, -h / 2 + 0.16, 0.01, flat=(0.5, 0.35))
    waist.scale = (1.0, 0.62, 1)
    num = text(f"num{i}", str(i + 1), (0, -0.115, h / 2 - 0.2), 0.16, white)
    parts["torso"] = [torso, waist, num]
    h = L["neck"]
    parts["neck"] = [capsule(f"ne{i}", 0.05, 0.055, h, skin, h / 2)]
    head = blob(f"he{i}", (HEAD_W / 2, 0.1, HEAD_H / 2 * 0.9), (0, 0, -0.01), skin)
    cap = blob(f"ha{i}", (HEAD_W / 2 * 1.06, 0.105, HEAD_H / 2 * 0.62), (0, 0.012, 0.045), hair)
    eyes = [blob(f"ey{i}{s}", (0.014, 0.01, 0.019), (s * 0.042, -0.094, 0.0), dark, 0) for s in (-1, 1)]
    brows = [blob(f"br{i}{s}", (0.022, 0.008, 0.006), (s * 0.044, -0.093, 0.032), hair, 0) for s in (-1, 1)]
    smile = bpy.ops.mesh.primitive_torus_add(major_radius=0.032, minor_radius=0.005, location=(0, -0.098, -0.035), rotation=(math.radians(90), 0, 0))
    sm = bpy.context.active_object
    bm = bmesh.new(); bm.from_mesh(sm.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > -0.008], context="VERTS")  # keep the lower arc
    bm.to_mesh(sm.data); bm.free()
    finish(sm, dark, 0)
    extra = [blob(f"bun{i}", (0.05, 0.05, 0.05), (0, 0.02, 0.135), hair)] if p["bun"] else []
    ears = [blob(f"ear{i}{s}", (0.018, 0.012, 0.03), (s * HEAD_W / 2, 0.0, -0.01), skin, 0.005) for s in (-1, 1)]
    parts["head"] = [head, cap, *eyes, *brows, sm, *extra, *ears]
    return parts


def main():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE"
    except TypeError:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    sc.world = bpy.data.worlds.new("w")
    sc.world.use_nodes = True
    bg = next(n for n in sc.world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.55, 0.58, 0.68, 1)
    bg.inputs["Strength"].default_value = 0.35
    # key, fill and rim lights for a soft 3D look
    for name, energy, rot in [("key", 2.2, (50, 0, -35)), ("fill", 0.6, (60, 0, 50)), ("rim", 2.0, (-60, 0, 180))]:
        d = bpy.data.lights.new(name, "SUN")
        d.energy = energy
        d.angle = math.radians(12)
        lo = bpy.data.objects.new(name, d)
        lo.rotation_euler = [math.radians(a) for a in rot]
        sc.collection.objects.link(lo)
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.rotation_euler = (math.radians(90), 0, 0)  # looks along +Y at the character's front

    meta = {"ppu": PPU, "pad": PAD, "shoulderW": SHOULDER_W, "lengths": L, "head": [HEAD_W, HEAD_H], "shoe": [SHOE_W, SHOE_H], "parts": {}}
    all_parts = [build(p, i) for i, p in enumerate(PLAYERS)]
    for i, parts in enumerate(all_parts):
        for o in [o for ps in parts.values() for o in ps]:
            o.location.x += i * 3  # keep players apart while modelling
    sizes = {"torso": (SHOULDER_W + 0.12, L["torso"]), "head": (HEAD_W + 0.04, HEAD_H + 0.06), "shoe": (SHOE_W, SHOE_H),
             "hand": (0.1, L["hand"]), "upper_arm": (0.13, L["upper_arm"]), "forearm": (0.1, L["forearm"]),
             "thigh": (0.17, L["thigh"]), "shin": (0.12, L["shin"]), "neck": (0.12, L["neck"])}
    for i, parts in enumerate(all_parts):
        for part, objs in parts.items():
            for o in bpy.data.objects:
                if o.type in ("MESH", "FONT"):
                    o.hide_render = o not in objs
            w, h = sizes[part]
            w, h = w + 2 * PAD, h + 2 * PAD
            cam.location = (i * 3, -5, 0)
            cam_data.ortho_scale = max(w, h)
            sc.render.resolution_x, sc.render.resolution_y = round(w * PPU), round(h * PPU)
            sc.render.filepath = os.path.join(OUT, f"p{i + 1}_{part}.png")
            bpy.ops.render.render(write_still=True)
            meta["parts"][part] = {"w": sc.render.resolution_x, "h": sc.render.resolution_y}
    with open(os.path.join(OUT, "parts.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print("AVATAR DONE", OUT)


main()
