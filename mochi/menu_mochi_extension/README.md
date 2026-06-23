# MenuMochi Retro Browser Pet Extension v1.2

MenuMochi is a retro Tamagotchi-style browser pet that now behaves as a single active-tab companion.

## v1.2 additions

- One Mochi instance follows the active tab.
- Old tab gets a tiny farewell before the title/favicon restore.
- New tab gets an arrival line like "Mochi found you!".
- Only the active tab runs animated favicon/title updates.
- Ctrl+Shift+M toggles the page care panel.
- Separation anxiety title lines after 5, 10, 15, 30, and 60 minutes idle.
- Guilt management widget with feed, clean, play, sleep, apology, and diary.
- Draggable page panel.
- Bond levels: Stranger, Acquaintance, Friend, Best Friend, Family.
- Night shift messages after 10pm.
- Boredom stat added.
- Diary logs care, neglect, tab movement, and apology moments.
- Toolbar badge reflects urgent state.

## Install

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer Mode.
3. Click Load unpacked.
4. Select the `menu_mochi_extension` folder.
5. Pin MenuMochi to the toolbar.

## Notes

Chrome and Edge do not allow full custom HTML inside the native tab strip or toolbar. MenuMochi uses the working route: animated favicon, scrolling tab title, toolbar icon badge, popup, and optional in-page widget.
