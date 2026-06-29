from PIL import Image
import base64
import json

img = Image.open(r'E:\__img__\544c1e7d-4f0b-42a1-a4c3-b91227692287_0.png')
print(f"Image size: {img.size}")
print(f"Image mode: {img.mode}")

# Save to a known location for analysis
img.save(r'E:\workspace\Toonflow-app\scripts\screenshot.png')
print("Screenshot saved to scripts/screenshot.png")
