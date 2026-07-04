# NEXCUT Product Bible

Version: v1.0  
Status: Ratified

---

# Vision

NEXCUT is not built to show AI.

NEXCUT exists to help creators spend less time fighting with tools and more time creating work they are proud to publish.

NEXCUT turns complex creative workflows into simple, guided, and confidence-building experiences.

It is a Creator Workspace for moving from material to finished output without getting lost.

---

# Purpose

This document defines the highest-level product principles of NEXCUT.

It is not:

- A UI specification
- A code specification
- An implementation guide
- A feature checklist

It is the decision standard for product, design, UX, copy, information architecture, motion, and future features.

When in doubt, use this document to decide.

---

# North Star

```text
NEXCUT helps creators spend less time managing tools and more time creating work they are proud to publish.
```

Short version:

```text
Less tool work. More creative work.
```

---

# Part I - Identity

## 1. Definition

NEXCUT is a Creator Workflow product.

It helps creators move from raw material to publishable output through a guided workspace.

NEXCUT is not:

- A generic AI chat tool
- A random collection of AI features
- A traditional video editor
- A technical dashboard for AI models

NEXCUT designs the workflow from material to finished creative output.

---

## 2. Brand Principles

NEXCUT should feel like a calm, premium, future-facing creator workspace.

The brand should be:

```text
Calm, not noisy.
Premium, not flashy.
Helpful, not complicated.
Creator-first, not AI-first.
Confident, not overwhelming.
```

NEXCUT should feel powerful, but never confusing.

---

## 3. Product Philosophy

```text
AI is the engine.
Workflow is the product.
```

AI powers NEXCUT, but AI itself is not the product.

The value of NEXCUT is the guided workflow that helps creators finish with less friction, less confusion, and more confidence.

A new AI capability matters only when it improves the creator workflow.

The question is not:

```text
Can we add this AI?
```

The question is:

```text
Does this help creators finish?
```

---

# Part II - Experience

## 4. Experience Flow

NEXCUT's emotional user journey:

```text
Discover
↓
Believe
↓
Start
↓
Choose
↓
Create
↓
Review
↓
Publish
```

- Discover: The user understands what NEXCUT is.
- Believe: The user feels it looks useful, powerful, and worth trying.
- Start: The user enters with minimal friction.
- Choose: The user chooses what they want to create.
- Create: The user creates inside a focused workspace.
- Review: The user checks and adjusts output before export.
- Publish: The user leaves with something ready to use.

---

## 5. Creator Journey

NEXCUT's practical creation flow:

```text
Idea
↓
Material
↓
Choose
↓
Create
↓
Refine
↓
Review
↓
Export
↓
Publish
```

The product should always help creators move forward in this journey.

If a feature does not move the creator closer to publishable output, it should not be prioritized.

---

## 6. Screen Roles

Every screen has one role.

### Landing

Role: 魅せる  
Question: Why NEXCUT?

Landing should create belief quickly.

Primary structure:

```text
Hero
2-minute demo
Start for free
```

### Login

Role: 入る

Login should feel calm, safe, and fast.

### Sign Up

Role: 始める

Sign Up should reduce hesitation and make the first step feel safe.

### Workspace Home

Role: 選ぶ  
Question: What do you want to create?

Workspace Home should show the main creation paths:

- Short Video
- AI Music Video beta
- Video Convert

### Short Video Workspace

Role: 作る  
Question: How do you want to create?

This is where users create short videos through Quick Generate or Story Wizard.

### Music Video Workspace

Role: 創作する

This is where users create music video concepts and AI MV outputs.

### Convert Tool

Role: 整える

Convert Tool is a simple, fast, practical utility.

### Preview Studio

Role: 仕上げる

Preview Studio is where AI output becomes creator-approved output.

AI creates the first 90%.

The creator finishes the last 10%.

### Export

Role: 保存する

Export turns creative work into usable files.

The user should feel:

```text
I finished something.
```

---

## 7. Emotional Design

```text
Every screen has one emotion.
```

Screen emotions:

```text
Landing = 驚き
Login = 安心
Sign Up = 安心 + 期待
Workspace Home = ワクワク
Workspace = 集中
Preview = 確認
Export = 達成感
```

A screen should not try to create every feeling.

Each screen should be designed around one emotional purpose.

---

# Part III - Design

## 8. Information Architecture

Long-term structure:

```text
/
Landing

/login
Login

/signup
Sign Up

/workspace
Workspace Home

/workspace/short-video
Short Video Workspace

/workspace/music-video
Music Video Workspace

/convert
Video Convert
```

User flow:

```text
Landing
↓
Login / Sign Up
↓
Workspace Home
↓
Workspace
↓
Preview
↓
Export
```

Role separation:

```text
Landing = Why NEXCUT?
Workspace Home = What do you want to create?
Workspace = How do you want to create?
Preview = Is this ready?
Export = Save and publish.
```

---

## 9. Design Direction

Core direction:

```text
Future Creator Workspace
```

NEXCUT should feel like a future-facing creative work environment, not a plain form-based AI website.

Visual direction:

- Dark UI
- Cyan as primary
- Purple as accent
- Premium
- Futuristic
- Calm
- Clear
- Creator-first

The first 5 seconds should feel impressive.

The next 5 minutes should feel easy.

Detailed visual systems belong to Design Bible.

---

## 10. UX Principles

### One Goal, One Screen

Each screen should have one clear purpose.

### One Workspace

NEXCUT should feel like one connected creator workspace, not scattered tools.

### Workflow Before Features

Add features only if they improve the creator workflow.

### Preview Before Export

AI output should be reviewed before final export.

### Every Screen Has One Emotion

Each screen should be designed around one emotional purpose.

### Do Not Show Everything First

Show what the user needs now.

Hide advanced or optional features until needed.

---

# Part IV - Decision Making

## 11. Success Metrics

NEXCUT should measure success by completed creative output, not AI usage volume.

NEXCUT is successful when:

- A first-time visitor understands what NEXCUT does within 30 seconds.
- A new user can start creating within 2 minutes.
- A creator can complete a publishable output within 10 minutes.
- The workflow feels easier than using multiple separate tools.
- Users feel confident about what to do next.
- Preview Studio helps users trust the output before exporting.
- Users say, "I would use this again."
- Users say, "This saved me time."
- Users say, "This was easier than I expected."

Core success indicator:

```text
Completed publishable work.
```

A successful session is one where the creator finishes something useful.

---

## 12. Decision Framework

Before adding a feature, changing a screen, or introducing a new AI capability, ask:

1. Does this reduce creator friction?
2. Does this improve the workflow?
3. Does this help creators finish?
4. Does this make the interface clearer?
5. If removed, would the creator experience become worse?

If the answer is not clearly yes, do not implement it yet.

A feature should be added only when it strengthens the creator journey.

A UI change should be accepted only when it makes the next action easier to understand.

If a screen becomes more beautiful but less clear, the change is wrong.

If a screen makes the creator feel confident and focused, the change is right.

---

## 13. What Not To Do

NEXCUT should not:

- Become a random collection of AI features
- Add AI just because it is trending
- Show every feature on the first screen
- Make the Workspace too flashy
- Mix Landing and Workspace roles
- Make Login or Sign Up visually overwhelming
- Force mobile users into desktop layouts
- Hide the main Short Video flow behind secondary tools
- Make YouTube URL the main entry point
- Make Tools compete with the core Workspace

NEXCUT's value is not the number of AI features.

NEXCUT's value is the clarity of the workflow.

---

# Part V - Future

## 14. Motion Principles

```text
Every loading screen tells a story.
```

Motion should make progress feel alive.

Motion must support clarity.

Motion should never make the workspace harder to use.

Detailed motion design belongs to Motion Bible.

---

## 15. Future Documents

### Design Bible

Defines visual systems, typography, spacing, components, layout rules, and responsive rules.

### Motion Bible

Defines loading motion, transitions, success states, export motion, and AI assistant behavior.

### Implementation Checklist

Defines how to safely implement, review scope, verify build, and confirm behavior.

Product Bible defines why and what.

Other documents define how.

---

## 16. Version Policy

Product Bible should not change frequently.

It should not be updated for small UI changes, feature additions, copy edits, or implementation details.

This document should only be updated when the core philosophy, product direction, or long-term identity of NEXCUT changes.

Version rules:

```text
v1.x = clarification or supporting principles
v2.0 = fundamental change in what NEXCUT is
```

A new feature does not require a new Product Bible version.

A change in what NEXCUT fundamentally is does.

---

# Final Principles

Creator First.

Workflow First.

Quality Before Quantity.

Clarity Before Complexity.

Preview Before Export.

AI is the engine.

Workflow is the product.

The creator experience is the value.

NEXCUT exists to help creators finish work they are proud to publish.