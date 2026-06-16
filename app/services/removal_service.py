import uuid

from sqlalchemy.orm import Session

from app.models.enums import MatchStatus
from app.models.match import Match

WALKOVER_SCORE = 0


def _opponent_id(match: Match, participant_id: uuid.UUID) -> uuid.UUID:
    if match.participant1_id == participant_id:
        return match.participant2_id
    return match.participant1_id


def count_completed_matches(
    db: Session, group_id: uuid.UUID, participant_id: uuid.UUID
) -> int:
    return (
        db.query(Match)
        .filter(
            Match.group_id == group_id,
            Match.status == MatchStatus.COMPLETED,
            (
                (Match.participant1_id == participant_id)
                | (Match.participant2_id == participant_id)
            ),
        )
        .count()
    )


def delete_all_matches_for_participant(
    db: Session, group_id: uuid.UUID, participant_id: uuid.UUID
) -> int:
    matches = (
        db.query(Match)
        .filter(
            Match.group_id == group_id,
            (
                (Match.participant1_id == participant_id)
                | (Match.participant2_id == participant_id)
            ),
        )
        .all()
    )
    for match in matches:
        db.delete(match)
    return len(matches)


def walkover_remaining_matches(
    db: Session, group_id: uuid.UUID, participant_id: uuid.UUID
) -> int:
    """Award opponents 2 tournament points via a 0–0 completed walkover."""
    matches = (
        db.query(Match)
        .filter(
            Match.group_id == group_id,
            Match.status.in_((MatchStatus.SCHEDULED, MatchStatus.LIVE)),
            (
                (Match.participant1_id == participant_id)
                | (Match.participant2_id == participant_id)
            ),
        )
        .all()
    )
    for match in matches:
        match.status = MatchStatus.COMPLETED
        match.winner_participant_id = _opponent_id(match, participant_id)
        match.winner_score = WALKOVER_SCORE
        match.loser_score = WALKOVER_SCORE
    return len(matches)


def prepare_participant_removal(
    db: Session, group_id: uuid.UUID, participant_id: uuid.UUID
) -> None:
    """
    Before removing a group member:
    - < 2 completed matches: delete all their matches (void standings impact).
    - >= 3 completed matches: walkover remaining scheduled/live (opponent wins 0–0).
    - exactly 2 completed: delete all matches (between the two rules).
    """
    played = count_completed_matches(db, group_id, participant_id)
    if played < 2:
        delete_all_matches_for_participant(db, group_id, participant_id)
    elif played >= 3:
        walkover_remaining_matches(db, group_id, participant_id)
    else:
        delete_all_matches_for_participant(db, group_id, participant_id)
