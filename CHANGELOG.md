# Changelog

All notable changes to NEXCUT AI are documented here.

## Open Beta 0.2.0 - 2026-07-06

### Added

- Subtitle Editor
  - Edit generated subtitle text.
  - Adjust line breaks.
  - Edit subtitle start and end times.
  - Reflect subtitle edits in Preview Studio.

- Subtitle Editor Plus
  - Add new subtitle lines.
  - Delete subtitle lines with confirmation.
  - Show a translation-sync action when translated subtitles exist.

- Creator Style
  - Add Standard and Creator style selection.
  - Add Animation Intensity from 1 to 5.
  - Keep Standard as the default style.

- Creator Style Engine
  - Generate CreatorStyleConfig from selected style and intensity.
  - Prepare export-ready parameters such as zoomStrength, subtitleAnimation, subtitleScale, subtitleSpeed, cutTempo, and emphasisLevel.

- Creator Style Export Integration
  - Pass CreatorStyleConfig from the frontend to export-related API requests.
  - Add debug visibility for the last exported CreatorStyleConfig.

- Creator Style Rendering
  - Apply Creator Style to subtitle burn-in rendering.
  - Adjust subtitle size based on Animation Intensity.
  - Add simple subtitle fade animation for Creator style.

- Creator Style Labels
  - Clarify Standard as the safe, readable default.
  - Clarify Creator as subtitle motion and emphasis.
  - Add labels for intensity: 1 控えめ, 3 バランス, 5 遊び強め.

### Improved

- Workspace UI
  - Reduced unnecessary scrolling in the Short Video Workspace.
  - Improved workflow card layout and step navigation.

- Navigation
  - Added Auth Entry and Workspace Home flows.
  - Connected Workspace Home cards to existing Short Video, AI Music Video, and Convert pages.

- Landing
  - Updated primary CTA toward Auth Entry.
  - Improved Open Beta trust messaging and feedback guidance.

- Auth
  - Added a simple Open Beta entry flow to Workspace Home.
  - Clarified that authentication is simplified during Open Beta.

### Notes

- Standard remains the default Creator Style.
- Creator Style currently affects subtitle burn-in only.
- ffmpeg video effects, zoom effects, sound effects, and advanced animation are not included in this release.
- Translation subtitle regeneration from edited subtitles is prepared as a future improvement but is not connected yet.

## Open Beta 0.1.0

### Added

- Landing page
- Auth Entry MVP
- Workspace Home MVP
- Short Video Workspace
- AI Music Video beta entry
- Video Convert entry
- Guide page
- Feedback guidance