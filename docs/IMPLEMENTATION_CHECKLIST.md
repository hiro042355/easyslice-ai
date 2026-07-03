# NEXCUT Implementation Checklist

## Purpose

This checklist is used before every implementation.

Its purpose is to keep NEXCUT simple, stable, and aligned with the Blueprint.

If a new feature does not pass this checklist, it should not be implemented yet.

## Core Rule

Blueprint is the ideal direction, not a command to rewrite everything.

Do not break the existing Story Wizard, APIs, or working features.

## Before Any Implementation

Check these items before adding or changing features.

- Does this make short video creation faster?
- Does this help the creator reach a publish-ready result?
- Does this keep Story Wizard working?
- Does this avoid large refactoring?
- Does this fit Quick Generate, Story Wizard, or Preview Studio?
- Does this avoid changing existing APIs unless necessary?
- Does this keep YouTube URL support as beta only?
- Does this avoid exposing AI/provider details to users?
- Does this reduce confusion?
- Will this reduce the creator's work by at least one meaningful step?
- Would I pay for this feature if I were a creator?
- Can this be tested with `npm run build`?

## Before Coding

Before changing any code:

- Read the existing implementation.
- Identify affected files.
- Minimize the scope of changes.
- Create a backup if the change is risky.
- Explain the implementation plan before coding.

## After Coding

After implementation:

- Check JSX structure.
- Check state and handlers.
- Run `npm run build`.
- Test manually.
- Review git diff.
- Confirm only intended files changed.

## Definition of Done

A feature is complete only when:

- Build succeeds.
- Manual testing passes.
- Existing features still work.
- Blueprint principles are respected.
- The UI is understandable without explanation.

## Current Priority

1. Stability
2. Clarity
3. Output quality
4. Quick Generate MVP
5. Preview Studio MVP
6. Pricing and account system
7. New features

## Product Principles

- Workflow Before Features
- One Goal, One Screen
- Generate Button is One
- Preview Before Export
- Engine is Replaceable
- Provider is Replaceable
- Workflow is Permanent
- Creator First

## Do Not Do Yet

- Do not delete Story Wizard.
- Do not create a separate Preview Studio page yet.
- Do not rewrite existing APIs.
- Do not make YouTube URL the main workflow.
- Do not add a new AI provider just because it is popular.
- Do not build NEXCUT Platform before NEXCUT AI is stable.

## Safe Implementation Pattern

1. Add UI only when possible.
2. Reuse existing state.
3. Reuse existing APIs.
4. Build.
5. Test manually.
6. Commit small.
7. Deploy.
8. Confirm production.

## First Business Goal

The first goal is not one million users.

The first goal is:

10 creators say, "I want to use this every month."