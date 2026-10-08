"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONSENT_MAX_AGE_MS = void 0;
exports.emptySelection = emptySelection;
exports.sanitizeCreatorView = sanitizeCreatorView;
exports.buildExportRequest = buildExportRequest;
exports.selectionErrors = selectionErrors;
exports.consentValid = consentValid;
exports.createConsent = createConsent;
const B2RequestValidator_1 = require("../tiktok/validation/B2RequestValidator");
/** Repository freshness policy, not a TikTok guarantee. */
exports.CONSENT_MAX_AGE_MS = 5 * 60 * 1000;
function emptySelection() {
    return { title: '', privacy: null, allowComments: false, allowDuet: false,
        allowStitch: false, brandContent: null, commercialDisclosureEnabled: null, brandOrganic: null, isAigc: null };
}
function mediaBinding(media) {
    return JSON.stringify([media.sha256, media.byteLength, media.durationSec, media.source]);
}
function creatorBinding(creator) {
    return JSON.stringify([creator.revision, creator.observedAtMs, creator.creatorUsername, creator.creatorNickname,
        creator.privacyLevelOptions, creator.commentDisabled, creator.duetDisabled, creator.stitchDisabled, creator.maxVideoPostDurationSec]);
}
function sanitizeCreatorView(raw, revision, observedAtMs) {
    var _a;
    if (!(0, B2RequestValidator_1.validateCreatorInfo)(raw).valid || !((_a = raw.creatorNickname) === null || _a === void 0 ? void 0 : _a.trim()) || !revision || !Number.isFinite(observedAtMs)) {
        throw new Error('Creator Info is incomplete');
    }
    return Object.freeze({
        revision, observedAtMs, creatorUsername: raw.creatorUsername, creatorNickname: raw.creatorNickname,
        privacyLevelOptions: Object.freeze([...raw.privacyLevelOptions]),
        commentDisabled: raw.commentDisabled, duetDisabled: raw.duetDisabled,
        stitchDisabled: raw.stitchDisabled, maxVideoPostDurationSec: raw.maxVideoPostDurationSec,
    });
}
function buildExportRequest(selection, media) {
    return {
        actualVideoDurationSec: media.durationSec,
        postInfo: Object.assign(Object.assign({}, (selection.title === '' ? {} : { title: selection.title })), { privacyLevel: selection.privacy, disableComment: !selection.allowComments, disableDuet: !selection.allowDuet, disableStitch: !selection.allowStitch, brandContentToggle: selection.brandContent, brandOrganicToggle: selection.brandOrganic, isAigc: selection.isAigc }),
        sourceInfo: { source: 'FILE_UPLOAD', videoSize: media.byteLength,
            chunkSize: media.byteLength, totalChunkCount: 1 },
    };
}
function selectionErrors(selection, creator, media, now, unaudited) {
    const errors = [];
    if (!Number.isFinite(now))
        errors.push('A valid local clock is required.');
    if (!creator || !(0, B2RequestValidator_1.validateCreatorInfo)(creator).valid || !creator.revision || !Number.isFinite(creator.observedAtMs) ||
        now < creator.observedAtMs || now - creator.observedAtMs > exports.CONSENT_MAX_AGE_MS)
        errors.push('Refresh Creator Info before consenting.');
    if (!media || !/^[a-f0-9]{64}$/.test(media.sha256) || !Number.isSafeInteger(media.byteLength) ||
        media.byteLength <= 0 || media.byteLength >= 5 * 1024 * 1024 ||
        !Number.isFinite(media.durationSec) || media.durationSec <= 0 || media.source !== 'FILE_UPLOAD')
        errors.push('A verified small video is required.');
    if (typeof selection.title !== 'string' || selection.title.length > 2200)
        errors.push('Caption must be within 2200 UTF-16 units.');
    if ([selection.commercialDisclosureEnabled, selection.brandContent, selection.brandOrganic, selection.isAigc].some((value) => typeof value !== 'boolean'))
        errors.push('Select commercial disclosure and AI-generated content explicitly.');
    if (selection.commercialDisclosureEnabled === true && !selection.brandContent && !selection.brandOrganic)
        errors.push('Choose your brand, branded content, or both.');
    if (selection.commercialDisclosureEnabled === false && (selection.brandContent || selection.brandOrganic))
        errors.push('Commercial disclosure state is inconsistent.');
    if ([selection.allowComments, selection.allowDuet, selection.allowStitch].some((value) => typeof value !== 'boolean'))
        errors.push('Interaction choices are invalid.');
    if (unaudited && selection.privacy !== 'SELF_ONLY')
        errors.push('An unaudited client requires Only me.');
    if (creator && media) {
        if (media.durationSec > creator.maxVideoPostDurationSec)
            errors.push('Video exceeds the creator duration limit.');
        errors.push(...(0, B2RequestValidator_1.validateDirectPostInitRequest)(buildExportRequest(selection, media), creator).errors);
    }
    return errors;
}
function consentValid(artifact, selection, creator, media, now, unaudited) {
    return !!artifact && !!selection && typeof selection === 'object' && typeof artifact.consentId === 'string' &&
        /^[a-f0-9-]{36}$/.test(artifact.consentId) && artifact.version === 1 && artifact.previewConfirmed === true && artifact.musicConsent === true &&
        (!selection.brandContent || artifact.brandedPolicyConsent === true) &&
        artifact.creatorRevision === (creator === null || creator === void 0 ? void 0 : creator.revision) && artifact.mediaSha256 === (media === null || media === void 0 ? void 0 : media.sha256) &&
        !!creator && !!media && artifact.creatorBinding === creatorBinding(creator) && artifact.mediaBinding === mediaBinding(media) &&
        Number.isFinite(artifact.consentedAtMs) && artifact.consentedAtMs <= now &&
        now - artifact.consentedAtMs <= exports.CONSENT_MAX_AGE_MS &&
        JSON.stringify(artifact.selection) === JSON.stringify(selection) &&
        selectionErrors(selection, creator, media, now, unaudited).length === 0;
}
function createConsent(selection, creator, media, now, unaudited, previewConfirmed, musicConsent, brandedPolicyConsent) {
    if (!previewConfirmed || !musicConsent || (selection.brandContent && !brandedPolicyConsent) ||
        selectionErrors(selection, creator, media, now, unaudited).length)
        throw new Error('Explicit valid consent is required');
    return Object.freeze({ consentId: crypto.randomUUID(), version: 1, creatorRevision: creator.revision, mediaSha256: media.sha256,
        creatorBinding: creatorBinding(creator), mediaBinding: mediaBinding(media),
        selection: Object.freeze(Object.assign({}, selection)), consentedAtMs: now,
        previewConfirmed: true, musicConsent: true, brandedPolicyConsent });
}
