from enum import Enum
from typing import Optional


class Action(Enum):
    INSERT = "insert"
    REFETCH = "refetch"
    SKIP = "skip"


def decide(stored_file_created_at: Optional[str], incoming_file_created_at: str) -> Action:
    # Both values are UTC ISO-8601 with a trailing Z, so lexicographic
    # comparison is equivalent to chronological comparison.
    if stored_file_created_at is None:
        return Action.INSERT
    if incoming_file_created_at > stored_file_created_at:
        return Action.REFETCH
    return Action.SKIP
