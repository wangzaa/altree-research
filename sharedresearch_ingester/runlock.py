import fcntl


def acquire_lock(path):
    """Take a non-blocking exclusive flock. Returns the open file object on
    success (keep it alive for the run), or None if another holder has it."""
    f = open(path, "w")
    try:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        return None
    return f


def release_lock(f):
    try:
        fcntl.flock(f.fileno(), fcntl.LOCK_UN)
    finally:
        f.close()
