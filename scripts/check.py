"""Check generated structure, relative links, and rejection of unsafe content."""
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import build


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.links = []
        self.cards = 0
        self.solutions = 0
        self.roadmap_topics = set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            assert a["id"] not in self.ids, f"Duplicate HTML id: {a['id']}"
            self.ids.add(a["id"])
        if tag == "article":
            self.cards += 1
        if tag == "details":
            assert "open" not in a, "Spoiler is open by default"
            self.solutions += a.get("class") == "solution"
        if "data-roadmap-topic" in a:
            self.roadmap_topics.add(a["data-roadmap-topic"])
        for key in ("href", "src"):
            if key in a:
                self.links.append(a[key])


build.build()
page = Page()
page.feed((ROOT / "dist/index.html").read_text())
expected = len(list((ROOT / "content/problems").rglob("*.json")))
assert page.cards == page.solutions == expected
assert page.roadmap_topics == set(topic["name"] for stage in build.ROADMAP["stages"] for topic in stage["topics"])
assert len(build.ROADMAP["stages"]) >= 3
for link in page.links:
    if link.startswith("https://"):
        continue
    if link.startswith("#"):
        assert link[1:] in page.ids, f"Missing anchor: {link}"
    else:
        assert (ROOT / "dist" / link.split("#")[0]).exists(), f"Missing asset: {link}"
for bad in ("javascript:alert(1)", "//evil.example/test", "../secret.pdf", "/outside.pdf", "materials/missing.pdf"):
    try:
        build.safe_link(bad)
    except ValueError:
        pass
    else:
        raise AssertionError(f"Unsafe/missing link accepted: {bad}")
assert build.esc('<script>"&') == '&lt;script&gt;&quot;&amp;'
assert (ROOT / "index.html").is_file()
assert 'dist/index.html' in (ROOT / "index.html").read_text()
workflow = (ROOT / '.github/workflows/pages.yml').read_text()
assert 'path: dist' in workflow
assert 'pull_request:' in workflow
assert "if: github.event_name != 'pull_request' && github.ref == 'refs/heads/master'" in workflow
print(f"Checks passed: {expected} cards, closed solutions, valid local links, escaped content.")
