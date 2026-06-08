import re
from dataclasses import dataclass

from markdownify import markdownify

SHORT_THRESHOLD = 500

_STRIP_TAGS = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.DOTALL | re.IGNORECASE)


@dataclass(frozen=True)
class ConvertResult:
    markdown: str
    char_count: int
    is_short: bool


def html_to_markdown(html: str, short_threshold: int = SHORT_THRESHOLD) -> ConvertResult:
    cleaned = _STRIP_TAGS.sub("", html)
    md = markdownify(cleaned, heading_style="ATX").strip()
    n = len(md)
    return ConvertResult(markdown=md, char_count=n, is_short=n < short_threshold)
