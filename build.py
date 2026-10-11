#!/usr/bin/env python3
"""Build a portable static mathematics catalogue using Python's standard library."""
import html
import json
import re
import shutil
from pathlib import Path
from string import Template
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
SITE = json.loads((ROOT / "content/site.json").read_text(encoding="utf-8"))
ROADMAP = json.loads((ROOT / "content/roadmap.json").read_text(encoding="utf-8"))
LEVELS = SITE["levels"]


def esc(value):
    return html.escape(str(value), quote=True)


def paragraphs(items):
    return "".join(f"<p>{esc(item)}</p>" for item in items)


def safe_link(url):
    parts = urlsplit(url)
    if parts.scheme == "https" and parts.netloc:
        return url
    if parts.scheme or parts.netloc or "\\" in url or parts.query:
        raise ValueError(f"Unsupported link: {url}")
    path = Path(parts.path)
    if path.is_absolute() or ".." in path.parts or not parts.path:
        raise ValueError(f"Invalid local link: {url}")
    if not (ROOT / "public" / path).is_file():
        raise ValueError(f"Missing material: {path}")
    return url


def validate(problem, path):
    def require(condition, message):
        if not condition:
            raise ValueError(f"{path.name}: {message}")
    require(isinstance(problem, dict), "expected an object")
    require(problem.get("schema_version") == 1, "schema_version must be 1")
    for key in ("id", "title", "topic", "level"):
        require(isinstance(problem.get(key), str) and problem[key].strip(), f"missing {key}")
    require(bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", problem["id"])), "invalid id")
    require(problem["level"] in LEVELS, "unknown level")
    require(type(problem.get("minutes")) is int and problem["minutes"] > 0, "minutes must be positive")
    for key in ("tags", "statement", "mistakes"):
        require(isinstance(problem.get(key), list) and all(isinstance(s, str) and s.strip() for s in problem[key]), f"{key} must be a list of text")
    require(bool(problem["statement"]), "empty statement")
    solution = problem.get("solution")
    require(isinstance(solution, dict), "missing solution")
    require(isinstance(solution.get("steps"), list) and bool(solution["steps"]) and all(isinstance(s, str) and s.strip() for s in solution["steps"]), "missing steps")
    require(isinstance(solution.get("answer"), str) and bool(solution["answer"].strip()), "missing answer")
    require(isinstance(problem.get("source"), str), "source must be text")
    for key in ("materials", "theory"):
        require(isinstance(problem.get(key), list), f"missing {key}")
        for link in problem[key]:
            require(isinstance(link, dict) and isinstance(link.get("title"), str) and bool(link["title"].strip()), "invalid link title")
            if key == "materials":
                require(isinstance(link.get("url"), str), "material needs url")
            if "url" in link:
                require(isinstance(link["url"], str), "url must be text")
                safe_link(link["url"])
    if "python" in solution:
        require(isinstance(solution["python"], str), "python must be text")


def render_card(p):
    materials = "".join(f'<a class="material" href="{esc(safe_link(m["url"]))}" target="_blank" rel="noopener">↗ {esc(m["title"])}</a>' for m in p["materials"])
    if not materials:
        materials = '<p class="muted">PDF пока не добавлен.</p>'
    theory = "".join('<li>' + (f'<a href="{esc(safe_link(t["url"]))}" target="_blank" rel="noopener">{esc(t["title"])}</a>' if "url" in t else esc(t["title"])) + '</li>' for t in p["theory"])
    code = f'<h4>Проверка на Python</h4><pre><code>{esc(p["solution"]["python"])}</code></pre><p class="muted">Код показан для локального запуска; сайт его не исполняет.</p>' if "python" in p["solution"] else ""
    tags = "".join(f'<span class="tag">{esc(t)}</span>' for t in p["tags"])
    search = " ".join([p["title"], p["topic"], *p["tags"], *p["statement"]]).lower()
    return f'''<article class="problem" id="{esc(p['id'])}" data-level="{esc(p['level'])}" data-topic="{esc(p['topic'])}" data-search="{esc(search)}">
      <div class="card-meta"><span class="level {esc(p['level'])}">{esc(LEVELS[p['level']])}</span><span>{p['minutes']} мин · {esc(p['topic'])}</span></div>
      <h3><a href="#{esc(p['id'])}">{esc(p['title'])}</a></h3>
      <div class="tags">{tags}</div>
      <section class="statement"><h4>Условие</h4>{paragraphs(p['statement'])}</section>
      <div class="materials">{materials}</div>
      <details class="solution"><summary>Решение и ответ <span class="summary-icon" aria-hidden="true">＋</span></summary><div class="details-body">{paragraphs(p['solution']['steps'])}<p class="answer"><strong>Ответ:</strong> {esc(p['solution']['answer'])}</p>{code}</div></details>
      <details><summary>Типичные ошибки <span class="summary-icon" aria-hidden="true">＋</span></summary><div class="details-body">{paragraphs(p['mistakes']) or '<p>Пока не добавлены.</p>'}</div></details>
      <details><summary>Теория и что почитать <span class="summary-icon" aria-hidden="true">＋</span></summary><div class="details-body"><ul>{theory}</ul></div></details>
      <p class="source">{esc(p['source'])}</p>
      <label class="completion"><input type="checkbox" data-completed="{esc(p['id'])}"> Задача решена</label>
    </article>'''


def render_learning_path(stages, counts, starters):
    rendered = []
    for number, stage in enumerate(stages, start=1):
        links = "".join(
            f'<li><a href="#{esc(starters[topic["name"]])}" data-roadmap-topic="{esc(topic["name"])}">{esc(topic["name"])} <span>{counts[topic["name"]]}</span></a></li>'
            for topic in stage["topics"]
        )
        rendered.append(
            f'<li class="roadmap-stage"><span class="stage-number">Этап {number}</span>'
            f'<h3>{esc(stage["title"])}</h3><p>{esc(stage["description"])}</p><ul>{links}</ul></li>'
        )
    return "".join(rendered)


def build():
    problems = []
    seen = set()
    for path in sorted((ROOT / "content/problems").rglob("*.json")):
        p = json.loads(path.read_text(encoding="utf-8"))
        validate(p, path)
        if p["id"] in seen:
            raise ValueError(f"Duplicate id: {p['id']}")
        seen.add(p["id"])
        problems.append(p)
    if not problems:
        raise ValueError("No problems found")
    topics = sorted({p["topic"] for p in problems})
    topic_counts = {topic: sum(p["topic"] == topic for p in problems) for topic in topics}
    starter_by_topic = {}
    for stage in ROADMAP["stages"]:
        for topic in stage["topics"]:
            name = topic["name"]
            if name in starter_by_topic:
                raise ValueError(f"Duplicate roadmap topic: {name}")
            card = next((p for p in problems if p["id"] == topic["start_card"]), None)
            if not card or card["topic"] != name:
                raise ValueError(f"Invalid roadmap starter for topic: {name}")
            starter_by_topic[name] = card["id"]
    if set(starter_by_topic) != set(topics):
        missing = sorted(set(topics) - set(starter_by_topic))
        unknown = sorted(set(starter_by_topic) - set(topics))
        raise ValueError(f"Roadmap topics do not match catalog (missing={missing}, unknown={unknown})")
    document = Template((ROOT / "templates/index.html").read_text(encoding="utf-8")).substitute(
        cards="\n".join(render_card(p) for p in problems),
        count=len(problems),
        topics="".join(f'<option value="{esc(t)}">{esc(t)}</option>' for t in topics),
        topic_index="".join(
            f'<a href="#{esc(starter_by_topic[t])}" data-roadmap-topic="{esc(t)}">{esc(t)} <span>{topic_counts[t]}</span></a>'
            for t in topics
        ),
        roadmap=render_learning_path(ROADMAP["stages"], topic_counts, starter_by_topic),
        levels="".join(f'<option value="{key}">{esc(label)}</option>' for key, label in LEVELS.items()),
        title=esc(SITE["title"]), brand=esc(SITE["brand"]), author=esc(SITE["author"]),
        telegram_url=esc(safe_link(SITE["telegram_url"])),
        portfolio_url=esc(safe_link(SITE["portfolio_url"])),
        coffee_url=esc(safe_link(SITE["coffee_url"])),
    )
    # Validate everything before touching the output. Only this generated directory is owned by the build.
    out = ROOT / "dist"
    if out.is_symlink():
        raise ValueError("dist must not be a symlink")
    if out.exists():
        shutil.rmtree(out)
    out.mkdir()
    shutil.copytree(ROOT / "assets", out / "assets")
    shutil.copytree(ROOT / "public", out, dirs_exist_ok=True)
    (out / "index.html").write_text(document, encoding="utf-8")
    (out / ".nojekyll").touch()
    print(f"Built {len(problems)} problems → {out / 'index.html'}")


if __name__ == "__main__":
    build()
