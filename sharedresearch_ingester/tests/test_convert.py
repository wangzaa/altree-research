import convert


def test_strips_scripts_and_keeps_text():
    r = convert.html_to_markdown(
        "<html><body><script>var x=1</script><p>Hello world</p></body></html>"
    )
    assert "Hello world" in r.markdown
    assert "var x=1" not in r.markdown


def test_preserves_table_cells_with_pipes():
    html = (
        "<table><tr><th>FY</th><th>Rev</th></tr>"
        "<tr><td>FY25</td><td>150</td></tr></table>"
    )
    r = convert.html_to_markdown(html)
    for token in ("FY", "Rev", "FY25", "150"):
        assert token in r.markdown
    assert "|" in r.markdown


def test_short_flag_set_for_tiny_content():
    r = convert.html_to_markdown("<p>tiny</p>")
    assert r.is_short is True
    assert r.char_count == len(r.markdown)


def test_short_flag_clear_for_long_content():
    html = "<p>" + ("word " * 200) + "</p>"
    r = convert.html_to_markdown(html)
    assert r.is_short is False


def test_tableless_prose_converts_without_error():
    # The United Arrows teaser case: prose only, no Key Financial Data table.
    html = "<h2>Executive summary</h2><p>Revenue rose 9.1% YoY.</p>"
    r = convert.html_to_markdown(html)
    assert "Executive summary" in r.markdown
    assert "9.1% YoY" in r.markdown
