import { getReferenceLogicalAssetFixtureDescriptor, listReferenceLogicalAssetFixtureDescriptors, type ReferenceLogicalAssetFixtureId } from "@/lib/assets/referenceAssetFixtureCatalog";

export const listReferenceLogicalAssetFixtures = () => listReferenceLogicalAssetFixtureDescriptors();
export const getReferenceLogicalAssetFixture = (fixtureId: ReferenceLogicalAssetFixtureId) => getReferenceLogicalAssetFixtureDescriptor(fixtureId);
