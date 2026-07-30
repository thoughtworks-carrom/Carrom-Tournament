# Finals photos

Add images here and register them in `frontend/src/lib/finals-content.ts`.

## Scoreboard photos (OBS overlay + live score cards)

For each final, add two photos with `scoreboardSide`:

```ts
"mens-singles-final": [
  { file: "finals/mens-singles-final/player-a.jpg", scoreboardSide: "A", title: "Sai Mohan" },
  { file: "finals/mens-singles-final/player-b.jpg", scoreboardSide: "B", title: "Rahul" },
  { file: "finals/mens-singles-final/action-1.jpg", title: "Final moments" },
],
```

Photos **with** `scoreboardSide` appear on the scoreboard. Photos **without** it appear in the gallery below the match.

## YouTube live

Admin pastes the YouTube live URL in the Finals section and clicks **Go Live on YouTube**. No `.env` URL needed.

Run `supabase/patches/add-finals-youtube-settings.sql` once so the URL syncs for all viewers.

## Folders

- `mens-singles-final/`
- `mens-doubles-final/`
- `womens-singles-final/`
- `organisers/`
- `volunteers/`
