import type {
  CharacterBible,
  CharacterCasting,
  CharacterProjectState,
  DimensionMode,
  SceneCharacterAssignment,
  ArtworkReference,
} from "./types";

export class CastingManager {
  private state: CharacterProjectState;

  constructor(initialState?: CharacterProjectState) {
    this.state = initialState || {
      version: "2.0",
      characters: [],
      castings: [],
      sceneAssignments: [],
      updatedAt: new Date().toISOString(),
    };
  }

  public getState(): CharacterProjectState {
    return structuredClone(this.state);
  }

  public addCharacterBible(bible: CharacterBible): void {
    const existingIndex = this.state.characters.findIndex((c) => c.characterId === bible.characterId);
    if (existingIndex >= 0) {
      this.state.characters[existingIndex] = bible;
    } else {
      this.state.characters.push(bible);
    }
    this.state.updatedAt = new Date().toISOString();
  }

  public castCharacter(
    characterId: string,
    revisionId: string,
    dimensionMode: DimensionMode,
    identityLockEnforced: boolean = true,
    customArtworkRefs?: ArtworkReference[]
  ): CharacterCasting {
    const casting: CharacterCasting = {
      characterId,
      selectedRevisionId: revisionId,
      dimensionMode,
      identityLockEnforced,
      customArtworkRefs,
    };

    const index = this.state.castings.findIndex((c) => c.characterId === characterId);
    if (index >= 0) {
      this.state.castings[index] = casting;
    } else {
      this.state.castings.push(casting);
    }

    this.state.updatedAt = new Date().toISOString();
    return casting;
  }

  public assignCharacterToScene(
    sceneId: string,
    characterId: string,
    roleInScene: "primary" | "secondary" | "background" | "performer" = "primary",
    dimensionMode?: DimensionMode
  ): SceneCharacterAssignment {
    const casting = this.getCasting(characterId);
    const bible = this.getCharacterBible(characterId);
    const mode = dimensionMode || casting?.dimensionMode || bible?.defaultDimensionMode || "2D";
    const identityLocked = casting ? casting.identityLockEnforced : (bible ? bible.identityLockEnforced : true);

    const assignment: SceneCharacterAssignment = {
      sceneId,
      characterId,
      roleInScene,
      dimensionMode: mode,
      identityLockEnforced: identityLocked,
    };

    const existingIndex = this.state.sceneAssignments.findIndex(
      (a) => a.sceneId === sceneId && a.characterId === characterId
    );

    if (existingIndex >= 0) {
      this.state.sceneAssignments[existingIndex] = assignment;
    } else {
      this.state.sceneAssignments.push(assignment);
    }

    this.state.updatedAt = new Date().toISOString();
    return assignment;
  }

  public removeSceneAssignment(sceneId: string, characterId: string): void {
    this.state.sceneAssignments = this.state.sceneAssignments.filter(
      (a) => !(a.sceneId === sceneId && a.characterId === characterId)
    );
    this.state.updatedAt = new Date().toISOString();
  }

  public getCharacterBible(characterId: string): CharacterBible | undefined {
    return this.state.characters.find((c) => c.characterId === characterId);
  }

  public getCasting(characterId: string): CharacterCasting | undefined {
    return this.state.castings.find((c) => c.characterId === characterId);
  }

  public getSceneAssignments(sceneId: string): SceneCharacterAssignment[] {
    return this.state.sceneAssignments.filter((a) => a.sceneId === sceneId);
  }

  public toggleIdentityLock(characterId: string, enforced: boolean): void {
    const casting = this.getCasting(characterId);
    if (casting) {
      casting.identityLockEnforced = enforced;
    }
    const bible = this.getCharacterBible(characterId);
    if (bible) {
      bible.identityLockEnforced = enforced;
    }
    this.state.sceneAssignments.forEach((a) => {
      if (a.characterId === characterId) {
        a.identityLockEnforced = enforced;
      }
    });
    this.state.updatedAt = new Date().toISOString();
  }
}
