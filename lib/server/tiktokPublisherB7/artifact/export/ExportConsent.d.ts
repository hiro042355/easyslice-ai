import type { TikTokPrivacyLevel, TikTokCreatorInfo } from '../tiktok/contracts/DirectPostContracts';
/** Repository freshness policy, not a TikTok guarantee. */
export declare const CONSENT_MAX_AGE_MS: number;
export interface CreatorView extends TikTokCreatorInfo {
    readonly revision: string;
    readonly observedAtMs: number;
    readonly creatorNickname: string;
}
export interface MediaView {
    readonly sha256: string;
    readonly byteLength: number;
    readonly durationSec: number;
    readonly source: 'FILE_UPLOAD';
}
export interface ExportSelection {
    readonly title: string;
    readonly privacy: TikTokPrivacyLevel | null;
    readonly allowComments: boolean;
    readonly allowDuet: boolean;
    readonly allowStitch: boolean;
    readonly brandContent: boolean | null;
    readonly commercialDisclosureEnabled: boolean | null;
    readonly brandOrganic: boolean | null;
    readonly isAigc: boolean | null;
}
export interface ConsentArtifact {
    readonly consentId: string;
    readonly version: 1;
    readonly creatorRevision: string;
    readonly mediaSha256: string;
    readonly mediaBinding: string;
    readonly creatorBinding: string;
    readonly selection: ExportSelection;
    readonly consentedAtMs: number;
    readonly previewConfirmed: true;
    readonly musicConsent: true;
    readonly brandedPolicyConsent: boolean;
}
export declare function emptySelection(): ExportSelection;
export declare function sanitizeCreatorView(raw: TikTokCreatorInfo, revision: string, observedAtMs: number): CreatorView;
export declare function buildExportRequest(selection: ExportSelection, media: MediaView): {
    actualVideoDurationSec: number;
    postInfo: {
        privacyLevel: TikTokPrivacyLevel | null;
        disableComment: boolean;
        disableDuet: boolean;
        disableStitch: boolean;
        brandContentToggle: boolean | null;
        brandOrganicToggle: boolean | null;
        isAigc: boolean | null;
        title?: string | undefined;
    };
    sourceInfo: {
        source: "FILE_UPLOAD";
        videoSize: number;
        chunkSize: number;
        totalChunkCount: number;
    };
};
export declare function selectionErrors(selection: ExportSelection, creator: CreatorView | null, media: MediaView | null, now: number, unaudited: boolean): string[];
export declare function consentValid(artifact: ConsentArtifact | null, selection: ExportSelection, creator: CreatorView | null, media: MediaView | null, now: number, unaudited: boolean): boolean;
export declare function createConsent(selection: ExportSelection, creator: CreatorView, media: MediaView, now: number, unaudited: boolean, previewConfirmed: boolean, musicConsent: boolean, brandedPolicyConsent: boolean): ConsentArtifact;
