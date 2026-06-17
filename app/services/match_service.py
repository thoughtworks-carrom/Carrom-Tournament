import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import MatchStatus
from app.models.match import Match
from app.schemas.match import MatchUpdate


def get_match(db: Session, match_id: uuid.UUID) -> Match:
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    return match


def _score_fields_changed(data: MatchUpdate) -> bool:
    return (
        data.winner_participant_id is not None
        or data.winner_score is not None
        or data.loser_score is not None
    )


def update_match(db: Session, match_id: uuid.UUID, data: MatchUpdate) -> Match:
    match = get_match(db, match_id)
    new_status = data.status if data.status is not None else match.status

    if data.status == MatchStatus.SCHEDULED:
        match.status = MatchStatus.SCHEDULED
        match.winner_participant_id = None
        match.winner_score = None
        match.loser_score = None
        db.commit()
        db.refresh(match)
        return match

    if _score_fields_changed(data) and new_status != MatchStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Winner information can only be set when status is COMPLETED",
        )

    if new_status == MatchStatus.COMPLETED:
        winner_id = (
            data.winner_participant_id
            if data.winner_participant_id is not None
            else match.winner_participant_id
        )
        winner_score = (
            data.winner_score if data.winner_score is not None else match.winner_score
        )
        if winner_id is None or winner_score is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="winner_participant_id and winner_score are required for COMPLETED matches",
            )
        if winner_id not in (match.participant1_id, match.participant2_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="winner_participant_id must be one of the match participants",
            )
        match.winner_participant_id = winner_id
        match.winner_score = winner_score
        if data.loser_score is not None:
            match.loser_score = data.loser_score

    if data.status is not None:
        match.status = data.status

    db.commit()
    db.refresh(match)
    return match
