# AI Music Director Architecture v1

## Purpose

This document defines how NEXCUT AI Music Video thinks, decides, and directs a music video.

This is an architecture and product philosophy document only.

No code, API integration, Higgsfield integration, music generation, or video generation is included in this phase.

## Vision

NEXCUT AI Music Video is not a settings-heavy MV tool.

The creator should only need to answer one question:

```text
What do you want to create?
```

NEXCUT decides:

```text
How should it be created?
```

The product is not a manual editor. It is an AI Director.

## Core Idea

The user provides intent.

The AI creates direction.

The creator reviews the result.

```text
Creator Intent
-> AI Direction
-> Music / Vocal / Visual Design
-> Preview
-> Export
```

NEXCUT should not expose complex production settings by default. Advanced controls may exist later, but the normal experience should remain simple.

## Layer Architecture

```text
Layer 1  Story Engine
Layer 2  Emotion Engine
Layer 3  Vocal Director
Layer 4  Music Director
Layer 5  MV Director
```

The upper layers understand what the creator wants. The lower layers decide how the final work should feel, sound, and look.

## Layer 1: Story Engine

### Input

- Event
- Lyrics
- Theme
- Memory
- Message
- Mood reference

### Role

The Story Engine turns raw user input into a coherent story.

It identifies:

- Main subject
- Emotional context
- Beginning
- Conflict or movement
- Peak moment
- Ending
- Core message

### Output

```text
Story Concept
Theme
Narrative Arc
Key Moments
Scene Intent
```

The Story Engine answers:

```text
What is this MV about?
```

## Layer 2: Emotion Engine

### Role

The Emotion Engine creates the emotional curve for the whole song and MV.

It maps emotion across sections:

- Verse
- Pre Chorus
- Chorus
- Bridge
- Outro

### Example Emotion Curve

```text
Verse       Quiet / reflective
Pre Chorus  Rising / hopeful
Chorus      Peak / emotional release
Bridge      Tension / memory
Outro       Warm / afterglow
```

### Output

```text
Emotion Graph
Section Mood
Energy Level
Peak Timing
Afterglow Timing
```

The same Emotion Graph is shared by:

- Vocal direction
- Music direction
- MV direction

This keeps the work emotionally consistent.

## Layer 3: Vocal Director

### Default UX

The user does not control this layer.

Vocal direction is fully AI-directed by default.

### Role

The Vocal Director decides how the voice should perform the story.

It designs:

- Intensity
- Breath
- Vibrato
- Emotional pressure
- Softness
- Climax expression
- Recovery after peak

### Output

```text
Vocal Direction
Section Intensity
Breath Notes
Emotional Delivery
Peak Vocal Moment
```

This layer answers:

```text
How should the voice feel?
```

## Layer 4: Music Director

### Default UX

The user does not control this layer.

Music direction is fully AI-directed by default.

### Role

The Music Director decides how the track should support the story and emotion.

It designs:

- BPM
- Build-up
- Instrument structure
- Drop or chorus lift
- Dynamics
- Silence
- Rhythm density
- Ending texture

### Output

```text
Music Direction
BPM
Instrument Plan
Energy Curve
Chorus Design
Bridge Design
Outro Design
```

This layer answers:

```text
How should the music move?
```

## Layer 5: MV Director

### Default UX

The user does not control this layer.

MV direction is fully AI-directed by default.

### Role

The MV Director turns the story, emotion, vocal direction, and music direction into visual direction.

It designs:

- Camera movement
- Lighting
- Scene composition
- Transitions
- Effects
- Visual pacing
- Color tone
- Climax shot
- Ending shot

### Output

```text
MV Direction
Scene Plan
Camera Plan
Lighting Plan
Transition Plan
Effect Plan
Higgsfield Prompt Package
```

This layer answers:

```text
How should the MV be directed?
```

The MV Director prepares structured direction that can be passed to video generation providers such as Higgsfield.

## Advanced Visibility Rule

Layers 3 to 5 should not be visible in the normal UI.

```text
Vocal Director
Music Director
MV Director
```

These are AI Director layers, not user settings.

They may appear only under an Advanced mode in the future.

Default UI:

```text
Story
Theme
Director Preset
Generate
Preview
Export
```

Advanced UI, if needed later:

```text
Vocal Direction
Music Direction
MV Direction
Emotion Graph
Peak Engine
```

## Director Presets

Director Presets are not manual settings.

They are high-level creative direction choices.

Initial presets:

- Auto
- Epic
- Emotional
- Cinematic
- Fantasy
- Dark
- Bright
- Anime

### Auto

Recommended default.

The AI chooses the most suitable direction based on the story, lyrics, and emotion.

### Epic

Large scale, dramatic build-up, strong peak moments.

### Emotional

Soft, intimate, memory-driven, human feeling.

### Cinematic

Film-like pacing, controlled camera, atmospheric lighting.

### Fantasy

Dreamlike, symbolic, surreal, magical visual language.

### Dark

Heavy contrast, tension, shadow, serious emotional tone.

### Bright

Hopeful, clean, uplifting, energetic.

### Anime

Stylized, expressive, high-emotion direction.

This preset should remain generic. It must not depend on specific titles, studios, characters, or copyrighted visual identities.

## Emotion Graph

The Emotion Graph is the shared emotional source of truth.

It controls:

- Vocal performance
- Music energy
- MV pacing
- Camera movement
- Lighting intensity
- Transition strength
- Effect timing

Example:

```text
0%    Quiet opening
25%   Emotional rise
50%   Pre-chorus tension
70%   Chorus peak
90%   Release
100%  Afterglow
```

The Emotion Graph prevents disconnected outputs.

The song, voice, and video should feel like one directed work.

## Peak Engine

The Peak Engine identifies and designs the strongest moments.

It decides:

- Chorus peak
- Climax shot
- Emotional release
- Silence before impact
- Final afterglow

The Peak Engine ensures the MV has a memorable center.

It answers:

```text
Where should the viewer feel the strongest emotion?
```

## Provider Relationship

NEXCUT does not need to build every generation model.

NEXCUT owns:

- Story direction
- Emotion design
- Vocal direction
- Music direction
- MV direction
- Workflow
- Preview experience

Providers may generate:

- Music
- Voice
- Video
- Images
- Effects

Providers are replaceable.

Director logic is NEXCUT's asset.

## User Experience

### Beginner

The beginner should only choose what they want to make.

```text
Story
Director Preset
Generate
Preview
Export
```

They should not need to understand BPM, camera language, vocal expression, or prompt engineering.

### Intermediate

The intermediate creator may choose a preset and adjust broad intent.

Examples:

- More emotional
- More cinematic
- Brighter
- Darker

These should remain simple direction controls.

### Advanced

The advanced creator may eventually inspect or adjust deeper AI direction.

Examples:

- Emotion Graph
- Peak timing
- MV scene plan
- Vocal intensity

Advanced controls should never become the default experience.

## What NEXCUT Should Not Do

NEXCUT should not become:

- A settings-heavy MV editor
- A prompt engineering tool
- A manual camera control panel
- A music theory interface
- A video generation provider wrapper only

NEXCUT should hide complexity until the creator needs it.

## Mission

NEXCUT AI Music Director helps creators turn a story, event, lyric, or emotion into a directed music video without needing to manage production complexity.

The mission is:

```text
Help creators express emotion through music and video without forcing them to become editors, composers, directors, or prompt engineers.
```

## Vision

NEXCUT is not just an AI MV generator.

NEXCUT is an AI Director for music expression.

It understands the creator's intent, designs the emotional structure, directs the music and visuals, and guides the creator from idea to finished work.

## Core Philosophy

```text
The creator decides what to make.

The AI decides how to direct it.

The creator reviews the final work.
```

AI creates direction.

The creator keeps control.

Workflow stays simple.

Emotion stays central.

## Final Statement

NEXCUT is not an AI that only generates music videos.

NEXCUT is an AI that directs emotion.
