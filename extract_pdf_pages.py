import sys
import json
import fitz

pdf_path = sys.argv[1]
doc = fitz.open(pdf_path)

pages = []
for i, page in enumerate(doc):
    text = page.get_text("text")
    pages.append({
        "page": i + 1,
        "text": text.strip()
    })

print(json.dumps({"pages": pages}, ensure_ascii=False))
