# Emotion Engine Specification v1

## Purpose

This document defines the Emotion Engine for NEXCUT AI Music Director.

The Emotion Engine is the brain that turns lyrics, story, and theme into an Emotion Graph.

This is a specification document only.

No code, API integration, music generation, vocal generation, MV generation, or UI implementation is included in this phase.

## Core Role

The Emotion Engine answers one question:

```text
How should this work feel over time?
```

It reads:

- Lyrics
- Story
- Theme
- Event
- Mood
- Creator intent

Then it creates:

```text
Emotion Graph
Energy Curve
Peak Design
Afterglow Design
```

The Emotion Graph becomes the shared emotional source of truth for:

- Vocal Director
- Music Director
- MV Director

## Why Emotion Engine Exists

NEXCUT AI Music Video should not generate disconnected parts.

The vocal should not feel separate from the music.

The music should not feel separate from the MV.

The MV should not feel separate from the story.

The Emotion Engine keeps all creative layers aligned.

```text
Story
-> Emotion Graph
-> Vocal Direction
-> Music Direction
-> MV Direction
```

## Supported Emotions

The minimum emotion set is:

- Joy
- Sadness
- Hope
- Love
- Fear
- Anger
- Loneliness
- Excitement
- Nostalgia
- Determination

These are not genre labels.

They are emotional signals used to guide direction.

## Emotion Detection

The Emotion Engine should analyze user input and identify:

- Primary emotion
- Secondary emotion
- Emotional contrast
- Emotional transition
- Hidden tension
- Resolution
- Memory or nostalgia
- Peak emotional moment

Example:

```text
Input:
A story about losing someone, remembering them, and deciding to move forward.

Primary emotion:
Sadness

Secondary emotions:
Love
Nostalgia
Hope
Determination

Likely emotional movement:
Sadness -> Nostalgia -> Hope -> Determination
```

## Emotion Graph Structure

The song is divided into sections:

- Verse
- Pre Chorus
- Chorus
- Bridge
- Outro

Each section has:

```ts
type EmotionSection = {
  section: "verse" | "pre-chorus" | "chorus" | "bridge" | "outro";
  primaryEmotion: string;
  secondaryEmotion?: string;
  emotionScore: number; // 0-100
  energyScore: number; // 0-100
  peakLevel: number; // 0-100
  directionNote: string;
};
```

## Score Definitions

### Emotion Score

Measures the emotional intensity of the section.

```text
0   = emotionally neutral
50  = clear emotion
100 = maximum emotional intensity
```

Emotion Score does not mean volume or speed.

A quiet section can have a high Emotion Score.

### Energy Score

Measures movement, momentum, and musical/visual energy.

```text
0   = still / quiet / minimal
50  = steady movement
100 = high motion / strong musical lift
```

Energy Score affects:

- Instrument density
- Rhythm
- Camera movement
- Transition strength
- Visual motion

### Peak Level

Measures how important the section is as an emotional peak.

```text
0   = no peak
50  = medium highlight
100 = main peak of the work
```

Peak Level is story-dependent.

The Chorus is not always 100.

## Example Emotion Graph

```text
Verse
Emotion: Nostalgia
Emotion Score: 65
Energy Score: 25
Peak Level: 20
Note: Quiet memory, soft vocal, still camera.

Pre Chorus
Emotion: Hope
Emotion Score: 75
Energy Score: 55
Peak Level: 50
Note: Rising tension, brighter harmony, forward movement.

Chorus
Emotion: Determination
Emotion Score: 90
Energy Score: 85
Peak Level: 95
Note: Emotional release, stronger vocal, wide visual scale.

Bridge
Emotion: Sadness
Emotion Score: 85
Energy Score: 30
Peak Level: 70
Note: Pull back, silence, close-up, emotional reflection.

Outro
Emotion: Hope
Emotion Score: 60
Energy Score: 20
Peak Level: 30
Note: Afterglow, soft ending, slow fade.
```

## Peak Engine

The Peak Engine is part of the Emotion Engine.

It designs:

- Main peak
- Secondary peak
- Emotional release
- Silence before impact
- Afterglow
- Contrast
- Pacing

Important rule:

```text
The Chorus is not always the maximum peak.
```

The AI decides the peak based on the story.

Examples:

- A hopeful song may peak in the final Chorus.
- A grief song may peak in the Bridge.
- A cinematic song may peak after silence.
- A romantic song may peak in a quiet Outro.

## Afterglow

Afterglow is the emotional residue after the peak.

It defines how the viewer should feel when the MV ends.

Examples:

- Warm
- Quiet
- Hopeful
- Empty
- Inspired
- Bittersweet

Afterglow affects:

- Final vocal tone
- Final instrument texture
- Last shot
- Fade timing
- Color softness

## Dynamic Range

Emotion Engine should avoid making every section intense.

Good emotional direction needs contrast.

```text
Quiet moments make peaks stronger.
Low energy can make high emotion more powerful.
Silence can be more dramatic than impact.
```

The Emotion Engine should design movement, not just intensity.

## Director Integration

The Emotion Graph is shared across the full AI Director stack.

```text
Emotion Graph
-> Vocal Director
-> Music Director
-> MV Director
```

## Vocal Director Integration

The Vocal Director uses Emotion Graph to decide:

- Vocal strength
- Breath
- Vibrato
- Softness
- Emotional pressure
- Chorus lift
- Bridge vulnerability
- Outro release

Example:

```text
High Emotion Score + Low Energy Score
-> Soft but emotionally intense vocal
```

## Music Director Integration

The Music Director uses Emotion Graph to decide:

- BPM feeling
- Instrument density
- Build-up
- Drop
- Chorus expansion
- Silence
- Rhythm intensity
- Ending texture

Example:

```text
High Energy Score + High Peak Level
-> Stronger drums, wider harmony, larger chorus arrangement
```

## MV Director Integration

The MV Director uses Emotion Graph to decide:

- Camera distance
- Camera motion
- Lighting intensity
- Color tone
- Transition strength
- Effect timing
- Scene contrast
- Climax shot
- Final shot

Example:

```text
High Nostalgia + Low Energy
-> Slow camera, warm light, soft focus, memory-like scenes
```

## Normal UI Rule

The user does not edit the Emotion Graph in the normal UI.

Default user experience:

```text
Story
Theme
Director Preset
Generate
Preview
Export
```

The Emotion Graph stays behind the scenes.

## Advanced Mode Rule

Emotion Graph may be visible only in Advanced mode.

Advanced mode may show:

- Emotion Graph
- Section emotions
- Peak Level
- Energy Score
- Direction notes

But even in Advanced mode, NEXCUT should avoid turning the experience into a complex manual editing tool.

## What Emotion Engine Should Not Do

Emotion Engine should not:

- Force every Chorus to be the peak
- Make every section high energy
- Treat sadness as always slow
- Treat joy as always bright
- Expose complex controls by default
- Replace the creator's intent
- Optimize only for spectacle

Emotion must serve the story.

## Output Contract

The Emotion Engine should produce structured direction that other layers can use.

Example:

```ts
type EmotionGraph = {
  primaryEmotion: string;
  secondaryEmotions: string[];
  overallArc: string;
  mainPeakSection: string;
  afterglow: string;
  sections: EmotionSection[];
};
```

This output becomes the shared creative plan for the AI Music Director.

## Evaluation Criteria

An Emotion Graph is good when:

- It matches the story.
- It has clear emotional movement.
- It creates contrast.
- It identifies meaningful peaks.
- It supports vocal, music, and MV direction.
- It helps the final work feel intentional.

An Emotion Graph is weak when:

- Every section feels the same.
- The peak is predictable but not meaningful.
- The visuals and music do not match emotionally.
- The AI chooses spectacle over story.
- The creator's original intent is lost.

## Vision

NEXCUT is not an AI that only makes sound.

NEXCUT is an AI that designs emotion.

The Emotion Engine is what turns AI Music Video from generation into direction.

## Emotion Engine Philosophy

```text
Emotion comes before production.

Story creates emotion.

Emotion guides voice.

Emotion guides music.

Emotion guides visuals.

The creator decides what the work means.

The AI designs how that meaning should feel.
```

NEXCUT does not simply generate a song or MV.

NEXCUT directs emotion across voice, music, and video.
