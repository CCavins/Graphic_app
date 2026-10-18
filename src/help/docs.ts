import { MANUAL, type HelpTopic } from './manual'

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The same list/paragraph rules the in-app Help uses. */
export function bodyHtml(lines: string[]): string {
  const out: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const tag = list.ordered ? 'ol' : 'ul'
    out.push(`<${tag}>${list.items.map((item) => `<li>${escape(item)}</li>`).join('')}</${tag}>`)
    list = null
  }
  for (const line of lines) {
    const bullet = line.match(/^- (.*)$/)
    const numbered = line.match(/^\d+\. (.*)$/)
    if (bullet || numbered) {
      const ordered = !!numbered
      if (list && list.ordered !== ordered) flush()
      if (!list) list = { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1])
    } else {
      flush()
      out.push(`<p>${escape(line)}</p>`)
    }
  }
  flush()
  return out.join('\n')
}

function topicHtml(topic: HelpTopic): string {
  return `<section id="${topic.id}" class="topic" data-text="${escape(`${topic.title} ${topic.summary} ${topic.body.join(' ')} ${topic.keywords ?? ''}`.toLowerCase())}">
<h3>${escape(topic.title)}</h3>
<p class="summary">${escape(topic.summary)}</p>
${bodyHtml(topic.body)}
</section>`
}

/** A single self-contained HTML page of the whole manual with a client-side filter box. */
export function renderDocsPage(appHref = '../'): string {
  const nav = MANUAL.map(
    (section) => `<li><a href="#${section.id}">${escape(section.title)}</a><ul>${section.topics.map((topic) => `<li><a href="#${topic.id}">${escape(topic.title)}</a></li>`).join('')}</ul></li>`,
  ).join('\n')
  const body = MANUAL.map(
    (section) => `<section id="${section.id}" class="part">
<h2>${escape(section.title)}</h2>
${section.topics.map(topicHtml).join('\n')}
</section>`,
  ).join('\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Measured – User manual</title>
<style>
:root { color-scheme: light; --accent: #2f5d9e; --muted: #5d6b7a; --line: #d9dee5; }
body { margin: 0; font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1c2430; background: #f5f7fa; }
header { position: sticky; top: 0; z-index: 2; display: flex; gap: 16px; align-items: center; padding: 10px 20px; background: white; border-bottom: 1px solid var(--line); }
header h1 { font-size: 18px; margin: 0; }
header a { color: var(--accent); }
header input { margin-left: auto; width: min(360px, 50vw); height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; font: inherit; }
.page { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 24px; max-width: 1100px; margin: 0 auto; padding: 20px; }
nav { position: sticky; top: 62px; align-self: start; max-height: calc(100vh - 80px); overflow: auto; font-size: 13px; }
nav ul { list-style: none; padding-left: 0; margin: 0; }
nav > ul > li { margin-bottom: 10px; }
nav > ul > li > a { font-weight: 600; }
nav ul ul { padding-left: 12px; }
nav a { color: inherit; text-decoration: none; display: block; padding: 2px 0; }
nav a:hover { color: var(--accent); }
main h2 { margin: 28px 0 8px; font-size: 22px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
main h2:first-child { margin-top: 0; }
.topic { background: white; border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; margin: 12px 0; }
.topic h3 { margin: 0 0 4px; font-size: 16px; }
.summary { margin: 0 0 8px; color: var(--muted); }
.topic p, .topic ul, .topic ol { margin: 6px 0; }
.topic[hidden], .part[hidden] { display: none; }
.none { color: var(--muted); display: none; }
kbd { font: 12px/1 ui-monospace, Menlo, monospace; background: #eef2f7; border-radius: 4px; padding: 2px 5px; }
@media (max-width: 760px) { .page { grid-template-columns: 1fr; } nav { position: static; max-height: none; } header input { width: 100%; } header { flex-wrap: wrap; } }
</style>
</head>
<body>
<header>
<h1>Measured – User manual</h1>
<a href="${escape(appHref)}">Back to the app</a>
<input id="q" type="search" placeholder="Filter topics…" aria-label="Filter topics">
</header>
<div class="page">
<nav aria-label="Contents"><ul>
${nav}
</ul></nav>
<main>
<p class="none" id="none">No topics match.</p>
${body}
</main>
</div>
<script>
(function () {
  var q = document.getElementById('q');
  var none = document.getElementById('none');
  var topics = Array.prototype.slice.call(document.querySelectorAll('.topic'));
  var parts = Array.prototype.slice.call(document.querySelectorAll('.part'));
  q.addEventListener('input', function () {
    var terms = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
    var shown = 0;
    topics.forEach(function (el) {
      var text = el.getAttribute('data-text') || '';
      var ok = terms.every(function (t) { return text.indexOf(t) !== -1; });
      el.hidden = !ok;
      if (ok) shown++;
    });
    parts.forEach(function (part) {
      part.hidden = !part.querySelector('.topic:not([hidden])');
    });
    none.style.display = shown ? 'none' : 'block';
  });
})();
</script>
</body>
</html>
`
}
