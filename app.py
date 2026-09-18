"""
Tedit — a small Flask app that compresses an uploaded image
down to (roughly) a target file size, using a binary search
over JPEG/WebP quality plus a dimension-shrink fallback for
very small targets.

Run:
    pip install -r requirements.txt
    python app.py

Then open http://127.0.0.1:5000 in your browser.
"""

import io
import os
from flask import Flask, render_template, request, send_file, jsonify
from PIL import Image

app = Flask(__name__)

# how close (as a fraction of the target) counts as "close enough"
TOLERANCE = 0.08
MAX_QUALITY_ITERATIONS = 8
MAX_SCALE_ROUNDS = 6
SCALE_STEP = 0.75


def compress_to_target(img: Image.Image, target_bytes: int, fmt: str = "JPEG"):
    """
    Binary-search the quality parameter to land close to target_bytes.
    If quality alone can't get small enough (common for tiny targets
    like 100KB on a large photo), progressively downscale the image
    and search again.

    Returns (bytes, (width, height), quality_used).
    """
    img = img.convert("RGB")  # JPEG/WebP-without-alpha both want RGB
    scale = 1.0

    best_bytes = None
    best_size = img.size
    best_quality = None

    for _ in range(MAX_SCALE_ROUNDS):
        w = max(1, int(img.width * scale))
        h = max(1, int(img.height * scale))
        resized = img.resize((w, h), Image.LANCZOS)

        lo, hi = 5, 95
        round_best_bytes, round_best_diff, round_best_q = None, float("inf"), None

        for _ in range(MAX_QUALITY_ITERATIONS):
            q = (lo + hi) // 2
            buf = io.BytesIO()
            save_kwargs = {"quality": q, "optimize": True}
            resized.save(buf, format=fmt, **save_kwargs)
            size = buf.tell()
            diff = abs(size - target_bytes)

            if diff < round_best_diff:
                round_best_diff = diff
                round_best_bytes = buf.getvalue()
                round_best_q = q

            if size > target_bytes:
                hi = q
            else:
                lo = q

            if diff / target_bytes < TOLERANCE:
                break

        if round_best_bytes is not None:
            if best_bytes is None or round_best_diff < abs(len(best_bytes) - target_bytes):
                best_bytes = round_best_bytes
                best_size = (w, h)
                best_quality = round_best_q

            # good enough — stop
            if round_best_diff / target_bytes < TOLERANCE:
                break

            # still too big even at low quality -> shrink dimensions and retry
            if len(round_best_bytes) > target_bytes:
                scale *= SCALE_STEP
                continue

        break

    return best_bytes, best_size, best_quality


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/compress", methods=["POST"])
def compress():
    if "photo" not in request.files:
        return jsonify({"error": "no file uploaded"}), 400

    file = request.files["photo"]
    if file.filename == "":
        return jsonify({"error": "no file selected"}), 400

    try:
        target_kb = float(request.form.get("target_kb", 500))
    except ValueError:
        return jsonify({"error": "invalid target size"}), 400

    fmt = request.form.get("format", "JPEG").upper()
    if fmt not in ("JPEG", "WEBP"):
        fmt = "JPEG"

    original_bytes = file.read()
    original_size = len(original_bytes)

    img = Image.open(io.BytesIO(original_bytes))
    target_bytes = int(target_kb * 1024)

    result_bytes, result_dims, quality_used = compress_to_target(img, target_bytes, fmt)

    if result_bytes is None:
        return jsonify({"error": "compression failed"}), 500

    ext = "jpg" if fmt == "JPEG" else "webp"
    mimetype = "image/jpeg" if fmt == "JPEG" else "image/webp"

    base_name = os.path.splitext(file.filename)[0]
    out_name = f"{base_name}-tedit.{ext}"

    # stash some info in headers so the frontend can show before/after stats
    response = send_file(
        io.BytesIO(result_bytes),
        mimetype=mimetype,
        as_attachment=True,
        download_name=out_name,
    )
    response.headers["X-Original-Size"] = str(original_size)
    response.headers["X-Compressed-Size"] = str(len(result_bytes))
    response.headers["X-Width"] = str(result_dims[0])
    response.headers["X-Height"] = str(result_dims[1])
    response.headers["X-Quality-Used"] = str(quality_used)
    response.headers["Access-Control-Expose-Headers"] = (
        "X-Original-Size, X-Compressed-Size, X-Width, X-Height, X-Quality-Used"
    )
    return response


if __name__ == "__main__":
    app.run(debug=True)
