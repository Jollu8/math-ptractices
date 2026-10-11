"""Create a tiny original PDF note with no third-party dependencies (English text)."""
from pathlib import Path


def make_pdf():
    lines = ["OSNOVA / Mathematics practice", "Linear equation: a worked example", "", "Problem: 3(2x - 1) = 4x + 7", "1. Expand: 6x - 3 = 4x + 7", "2. Subtract 4x and add 3: 2x = 10", "3. Divide by 2: x = 5", "Check: both sides equal 27.", "", "Common mistake: 3(2x - 1) is 6x - 3, not 6x - 1.", "Theory: distributive law and equivalent equations.", "", "Original educational note. Not an excerpt from Antonov."]
    def literal(s):
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = ("BT /F1 12 Tf 50 780 Td 20 TL " + " ".join(f"({literal(line)}) Tj T*" for line in lines) + " ET").encode("ascii")
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>", b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream"]
    data = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f"{number} 0 obj\n".encode() + obj + b"\nendobj\n")
    start = len(data)
    data.extend(f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        data.extend(f"{offset:010} 00000 n \n".encode())
    data.extend(f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode())
    path = Path(__file__).resolve().parents[1] / "public/materials/linear-equation.pdf"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    print(f"Created {path.name} ({len(data)} bytes)")


if __name__ == "__main__":
    make_pdf()
