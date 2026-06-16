import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.enums import CategoryFormat, Gender, ParticipantType
from app.models.group import Group
from app.models.group_player import GroupPlayer
from app.models.group_team import GroupTeam
from app.models.player import Player
from app.models.team import Team
from app.schemas.group_player import GroupPlayerCreate
from app.schemas.group_team import GroupTeamCreate
from app.services import fixture_service, removal_service


def get_group(db: Session, group_id: uuid.UUID) -> Group:
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    return group


def _get_category(db: Session, group: Group) -> Category:
    category = db.query(Category).filter(Category.id == group.category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


def add_player(
    db: Session, group_id: uuid.UUID, data: GroupPlayerCreate
) -> GroupPlayer:
    group = get_group(db, group_id)
    category = _get_category(db, group)

    if category.format != CategoryFormat.SINGLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Players can only be assigned to singles category groups",
        )

    if category.gender not in (Gender.MALE, Gender.FEMALE):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid category for singles player assignment",
        )

    player = db.query(Player).filter(Player.id == data.player_id).first()
    if not player:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    if not player.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Player is not active")
    if player.gender != category.gender:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Player gender does not match category",
        )

    existing = (
        db.query(GroupPlayer)
        .filter(GroupPlayer.group_id == group_id, GroupPlayer.player_id == data.player_id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Player already in this group",
        )

    category_group_ids = [
        g.id for g in db.query(Group).filter(Group.category_id == category.id).all()
    ]
    existing_in_category = (
        db.query(GroupPlayer)
        .filter(
            GroupPlayer.player_id == data.player_id,
            GroupPlayer.group_id.in_(category_group_ids),
        )
        .first()
    )
    if existing_in_category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Player already assigned to a group in this category",
        )

    other_ids = [
        gp.player_id
        for gp in db.query(GroupPlayer).filter(GroupPlayer.group_id == group_id).all()
    ]

    assignment = GroupPlayer(
        group_id=group_id,
        player_id=data.player_id,
        group_position=data.group_position,
    )
    db.add(assignment)
    db.flush()

    fixture_service.generate_missing_fixtures(
        db,
        group,
        data.player_id,
        ParticipantType.PLAYER,
        other_ids,
        matches_per_pair=fixture_service.matches_per_pair_for_category(category),
    )
    db.commit()
    db.refresh(assignment)
    return assignment


def remove_player(db: Session, group_id: uuid.UUID, assignment_id: uuid.UUID) -> None:
    get_group(db, group_id)

    assignment = (
        db.query(GroupPlayer)
        .filter(GroupPlayer.id == assignment_id, GroupPlayer.group_id == group_id)
        .first()
    )
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Player assignment not found"
        )

    removal_service.prepare_participant_removal(
        db, group_id, assignment.player_id
    )
    db.delete(assignment)
    db.commit()


def add_team(db: Session, group_id: uuid.UUID, data: GroupTeamCreate) -> GroupTeam:
    group = get_group(db, group_id)
    category = _get_category(db, group)

    if category.format != CategoryFormat.DOUBLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Teams can only be assigned to doubles category groups",
        )

    team = db.query(Team).filter(Team.id == data.team_id).first()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    if not team.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team is not active")
    if team.category_id != group.category_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team does not belong to this group's category",
        )

    existing = (
        db.query(GroupTeam)
        .filter(GroupTeam.group_id == group_id, GroupTeam.team_id == data.team_id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team already in this group",
        )

    other_ids = [
        gt.team_id
        for gt in db.query(GroupTeam).filter(GroupTeam.group_id == group_id).all()
    ]

    assignment = GroupTeam(
        group_id=group_id,
        team_id=data.team_id,
        group_position=data.group_position,
    )
    db.add(assignment)
    db.flush()

    fixture_service.generate_missing_fixtures(
        db, group, data.team_id, ParticipantType.TEAM, other_ids
    )
    db.commit()
    db.refresh(assignment)
    return assignment


def remove_team(db: Session, group_id: uuid.UUID, assignment_id: uuid.UUID) -> None:
    get_group(db, group_id)

    assignment = (
        db.query(GroupTeam)
        .filter(GroupTeam.id == assignment_id, GroupTeam.group_id == group_id)
        .first()
    )
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Team assignment not found"
        )

    removal_service.prepare_participant_removal(db, group_id, assignment.team_id)
    db.delete(assignment)
    db.commit()
