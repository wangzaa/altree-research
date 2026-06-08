import runlock


def test_second_acquire_returns_none_then_releases(tmp_path):
    path = str(tmp_path / "x.lock")
    first = runlock.acquire_lock(path)
    assert first is not None
    second = runlock.acquire_lock(path)
    assert second is None          # already held
    runlock.release_lock(first)
    third = runlock.acquire_lock(path)
    assert third is not None        # released, can re-acquire
    runlock.release_lock(third)
