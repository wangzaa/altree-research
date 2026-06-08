from poll_logic import decide, Action


def test_unknown_project_is_insert():
    assert decide(None, "2026-05-13T08:52:00.000Z") == Action.INSERT


def test_newer_created_at_is_refetch():
    assert decide("2026-05-13T08:52:00.000Z", "2026-05-14T00:00:00.000Z") == Action.REFETCH


def test_identical_created_at_is_skip():
    assert decide("2026-05-13T08:52:00.000Z", "2026-05-13T08:52:00.000Z") == Action.SKIP


def test_older_created_at_is_skip():
    assert decide("2026-05-13T08:52:00.000Z", "2026-05-01T00:00:00.000Z") == Action.SKIP
