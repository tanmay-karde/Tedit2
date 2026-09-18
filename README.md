# Tedit (Python / Flask edition)

Same idea as the HTML-only version  upload a photo, pick a target
file size, get back a compressed image that lands close to it 
but the actual compression runs in Python via Pillow instead of
the browser's canvas API.

## How it works

`app.py` binary-searches the JPEG/WebP `quality` parameter (5–95)
until the encoded size lands within ~8% of your target. If the
image still can't hit the target even at the lowest quality
(common when the target is very small relative to the photo's
resolution), it shrinks the image dimensions by 25% and searches
again up to 6 rounds.

## Setup

You need Python 3.9+ installed. Then, from this folder:

```bash
python -m venv venv
source venv/bin/activate        # on Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:5000** in your browser.

## Project structure

```
tedit-python/
├── app.py              # Flask app + compression logic
├── requirements.txt
├── templates/
│   └── index.html      # upload UI
└── static/
    ├── style.css        # paper/ink theme
    └── app.js           # talks to /compress endpoint
```

## Notes for the report

- PNG input gets converted to RGB before saving as JPEG/WebP 
  PNG is lossless so it can't be squeezed to an arbitrary target
  the same way.
- The `quality` parameter controls DCT quantization coarseness
  under the hood lower quality means coarser quantization of
  8×8 pixel blocks, which is the actual mechanism behind the
  size/quality tradeoff.
- Binary search converges in ~8 steps instead of a linear scan,
  which is worth mentioning if you're discussing algorithmic
  complexity (O(log n) vs O(n) quality search).
