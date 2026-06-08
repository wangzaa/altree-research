import ingester


def test_status_on_empty_db(tmp_path, capsys):
    rc = ingester.main(["status", "--db", str(tmp_path / "s.db")])
    out = capsys.readouterr().out
    assert rc == 0
    assert "Companies: 0" in out
    assert "Reports:" in out


def test_financials_command_on_empty_db(tmp_path, capsys):
    rc = ingester.main(["financials", "--db", str(tmp_path / "s.db")])
    out = capsys.readouterr().out
    assert rc == 0
    assert "Financials built for 0 companies" in out
