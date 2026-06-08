import time

import requests

DEFAULT_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)
BASE = "https://sharedresearch.jp/api"
RETRY_STATUS = {429, 502, 503, 504}
BACKOFF = [2, 8, 30]


class BlockedError(Exception):
    """Raised on HTTP 403 — we are being blocked; abort the run."""


def build_headers(user_agent=DEFAULT_UA):
    return {
        "User-Agent": user_agent,
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://sharedresearch.jp/en/companies",
        "Origin": "https://sharedresearch.jp",
    }


class SharedResearchClient:
    def __init__(self, session=None, rate_limit=1.0, user_agent=DEFAULT_UA):
        self.session = session or requests.Session()
        self.session.headers.update(build_headers(user_agent))
        self.rate_limit = rate_limit

    def _sleep(self):
        if self.rate_limit:
            time.sleep(self.rate_limit)

    def _get(self, url, accept=None, allow_redirects=False):
        headers = {"Accept": accept} if accept else {}
        for attempt in range(4):
            try:
                r = self.session.get(
                    url, headers=headers, allow_redirects=allow_redirects, timeout=30)
            except requests.exceptions.RequestException:
                if attempt == 3:
                    raise
                time.sleep(BACKOFF[attempt])
                continue
            if r.status_code == 403:
                raise BlockedError(f"403 from {url}")
            if r.status_code in RETRY_STATUS and attempt < 3:
                retry_after = r.headers.get("Retry-After")
                delay = int(retry_after) if (retry_after and retry_after.isdigit()) else BACKOFF[attempt]
                time.sleep(delay)
                continue
            self._sleep()
            return r
        self._sleep()
        return r

    def resolve_ticker(self, ticker):
        r = self._get(f"{BASE}/companies/tick/{ticker}")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()

    def list_projects(self, internal_id):
        r = self._get(f"{BASE}/projects?companyId={internal_id}&locale=en")
        r.raise_for_status()
        return r.json()

    def fetch_report(self, internal_id, file_id, filename):
        url = f"{BASE}/companies/{internal_id}/reports/{file_id}/{filename}"
        r = self._get(url, accept="*/*", allow_redirects=True)
        r.raise_for_status()
        return r.content
