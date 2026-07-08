import uuid

from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.enums import CategoryFormat, MatchStatus, ParticipantType
from app.models.group import Group
from app.models.group_player import GroupPlayer
from app.models.group_team import GroupTeam
from app.models.match import Match
from app.models.player import Player
from app.models.team import Team
from app.schemas.standings import StandingEntry
from app.utils.match_names import resolve_participant_name


WIN_POINTS = 2
LOSS_POINTS = 0
DRAW_POINTS = 1


def calculate_standings(db: Session, group_id: uuid.UUID) -> list[StandingEntry]:
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        return []

    category = db.query(Category).filter(Category.id == group.category_id).first()
    if not category:
        return []

    stats: dict[uuid.UUID, dict] = {}

    if category.format == CategoryFormat.SINGLES:
        assignments = db.query(GroupPlayer).filter(GroupPlayer.group_id == group_id).all()
        for gp in assignments:
            stats[gp.player_id] = {
                "participant_type": ParticipantType.PLAYER,
                "matches_played": 0,
                "wins": 0,
                "losses": 0,
                "tournament_points": 0,
                "score": 0,
            }
    else:
        assignments = db.query(GroupTeam).filter(GroupTeam.group_id == group_id).all()
        for gt in assignments:
            stats[gt.team_id] = {
                "participant_type": ParticipantType.TEAM,
                "matches_played": 0,
                "wins": 0,
                "losses": 0,
                "tournament_points": 0,
                "score": 0,
            }

    completed = (
        db.query(Match)
        .filter(Match.group_id == group_id, Match.status == MatchStatus.COMPLETED)
        .all()
    )

    for match in completed:
        p1, p2 = match.participant1_id, match.participant2_id
        winner = match.winner_participant_id

        for pid in (p1, p2):
            if pid not in stats:
                continue
            stats[pid]["matches_played"] += 1

        if winner is None:
            is_draw = (
                match.winner_score is None and match.loser_score is None
            ) or (
                match.winner_score is not None
                and match.loser_score is not None
                and match.winner_score == match.loser_score
            )
            if is_draw:
                for pid in (p1, p2):
                    if pid in stats:
                        stats[pid]["tournament_points"] += DRAW_POINTS
                        if match.winner_score is not None:
                            stats[pid]["score"] += match.winner_score
            continue

        loser = p2 if winner == p1 else p1

        if winner in stats:
            stats[winner]["wins"] += 1
            stats[winner]["tournament_points"] += WIN_POINTS
            stats[winner]["score"] += match.winner_score or 0

        if loser in stats:
            stats[loser]["losses"] += 1
            stats[loser]["tournament_points"] += LOSS_POINTS
            stats[loser]["score"] += match.loser_score or 0

    standings = [
        StandingEntry(
            participant_id=pid,
            participant_type=data["participant_type"],
            display_name=resolve_participant_name(
                db, pid, data["participant_type"]
            ),
            matches_played=data["matches_played"],
            wins=data["wins"],
            losses=data["losses"],
            tournament_points=data["tournament_points"],
            score=data["score"],
        )
        for pid, data in stats.items()
    ]

    standings.sort(key=lambda s: (-s.tournament_points, -s.wins))
    return standings
