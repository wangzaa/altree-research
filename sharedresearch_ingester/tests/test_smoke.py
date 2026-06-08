import pytest

import db as dbmod
import ingester


@pytest.mark.integration
def test_end_to_end_6862(tmp_path):
    db_path = str(tmp_path / "smoke.db")
    universe = tmp_path / "uni.json"
    universe.write_text('[{"ticker":"6862","name":"MINATO","updated":null}]', encoding="utf-8")

    assert ingester.main(["resolve", "--db", db_path, "--universe", str(universe)]) == 0
    assert ingester.main(["poll", "--db", db_path, "--universe", str(universe)]) == 0
    assert ingester.main(["fetch", "--db", db_path, "--limit", "1"]) == 0

    d = dbmod.Database(db_path)
    row = d.conn.execute(
        "SELECT content_md FROM reports WHERE content_md IS NOT NULL LIMIT 1").fetchone()
    d.close()
    assert row is not None and row["content_md"]
