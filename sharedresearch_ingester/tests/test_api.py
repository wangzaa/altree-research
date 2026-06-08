import pytest
import requests

import api


class FakeResp:
    def __init__(self, status, json_data=None, content=b"", headers=None):
        self.status_code = status
        self._json = json_data
        self.content = content
        self.headers = headers or {}

    def json(self):
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(str(self.status_code))


class FakeSession:
    def __init__(self, resp):
        self.resp = resp
        self.headers = {}

    def get(self, url, **kwargs):
        return self.resp


def client_with(resp):
    return api.SharedResearchClient(session=FakeSession(resp), rate_limit=0)


def test_resolve_404_returns_none():
    assert client_with(FakeResp(404)).resolve_ticker("9999") is None


def test_resolve_ok_returns_json():
    c = client_with(FakeResp(200, json_data={"_id": "x"}))
    assert c.resolve_ticker("6862") == {"_id": "x"}


def test_403_raises_blocked():
    with pytest.raises(api.BlockedError):
        client_with(FakeResp(403)).list_projects("id")


def test_fetch_report_returns_bytes():
    c = client_with(FakeResp(200, content=b"<html>ok</html>"))
    assert c.fetch_report("cid", "fid", "f.html") == b"<html>ok</html>"
