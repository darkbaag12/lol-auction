from rembg import remove
from PIL import Image
import sys

input_path = "C:/Users/darkb/.gemini/antigravity/brain/3a6de8fc-8c67-4b04-a7a8-6e128de66fc5/media__1773198086314.jpg"
output_path = "C:/gyeongmae program-web/frontend/public/exp-logo.png"

try:
    print(f"Loading {input_path}...")
    input_image = Image.open(input_path)
    print("Removing background...")
    output_image = remove(input_image)
    output_image.save(output_path)
    print("Success: Saved to", output_path)
except Exception as e:
    print("Error:", e)
    sys.exit(1)
