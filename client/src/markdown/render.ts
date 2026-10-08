import DOMPurify from "dompurify";
import { Marked } from "marked";
import { escapeHtml, highlightCode } from "./highlight";

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }) {
      const language = lang ? ` language-${escapeHtml(lang)}` : "";
      return `<pre><code class="hljs${language}">${highlightCode(text, lang)}</code></pre>`;
    },
  },
});

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
});

const SANITIZE_OPTIONS = {
  ALLOWED_TAGS: [
    "a",
    "b",
    "blockquote",
    "br",
    "code",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "li",
    "ol",
    "p",
    "pre",
    "span",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ],
  ALLOWED_ATTR: ["href", "class", "align", "target", "rel"],
};

export function renderMarkdown(body: string): string {
  return DOMPurify.sanitize(marked.parse(body, { async: false }), SANITIZE_OPTIONS);
}
