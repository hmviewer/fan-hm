import assert from "node:assert/strict";
import {
  applySoopPlayerParams,
  approveTimelineDefault,
  buildPlaybackUrl,
  buildSoopEmbedUrl,
  buildDraftFromRows,
  confirmTimelineEnd,
  detectColumnMapping,
  extractSoopVodId,
  extractTimelineFromUrl,
  formatTimelineTime,
  isAllowedSoopEmbedUrl,
  normalizePublicData,
  normalizeSoopUrl,
  parseTimelineInput,
  reviewQueue,
  setSignatureDefaultDuration,
  rowsFromCsv,
  signatureReviewStats,
  timelineKey
} from "./signature-core.mjs";

assert.equal(parseTimelineInput("01:02:05"), 3725);
assert.equal(parseTimelineInput("62:05"), 3725);
assert.equal(parseTimelineInput("3725"), 3725);
assert.equal(parseTimelineInput("3725s"), 3725);
assert.equal(parseTimelineInput("1h2m5s"), 3725);
assert.equal(parseTimelineInput("62m5s"), 3725);
assert.equal(parseTimelineInput("1시간2분"), null);
assert.equal(formatTimelineTime(65), "01:05");
assert.equal(formatTimelineTime(3725), "01:02:05");

const youtube = extractTimelineFromUrl("https://youtu.be/abc123?t=1h2m5s");
assert.equal(youtube.provider, "youtube");
assert.equal(youtube.videoId, "abc123");
assert.equal(youtube.startTime, 3725);
assert.equal(youtube.normalizedUrl, "https://www.youtube.com/watch?v=abc123");

const soop = extractTimelineFromUrl("https://vod.sooplive.com/player/123456789/embed");
assert.equal(soop.provider, "soop");
assert.equal(soop.videoId, "123456789");
assert.equal(soop.normalizedUrl, "https://vod.sooplive.com/player/123456789");
assert.equal(soop.embedUrl, "https://vod.sooplive.com/player/123456789/embed?autoPlay=true&mutePlay=true");
assert.equal(extractSoopVodId("https://vod.afreecatv.com/player/987654321"), "987654321");
assert.equal(normalizeSoopUrl("https://vod.afreecatv.com/player/987654321/embed"), "https://vod.afreecatv.com/player/987654321");
assert.equal(buildSoopEmbedUrl("987654321", "vod.afreecatv.com"), "https://vod.afreecatv.com/player/987654321/embed?autoPlay=true&mutePlay=true");
assert.equal(applySoopPlayerParams("https://vod.sooplive.com/player/123456789/embed?foo=bar"), "https://vod.sooplive.com/player/123456789/embed?foo=bar&autoPlay=true&mutePlay=true");
assert.equal(isAllowedSoopEmbedUrl("https://vod.sooplive.com/player/123456789/embed"), true);
assert.equal(isAllowedSoopEmbedUrl("https://example.com/player/123456789/embed"), false);
assert.equal(extractSoopVodId("https://www.sooplive.com/station/demo/post/1"), null);
assert.equal(buildPlaybackUrl({ provider: "soop", videoId: "123456789", sourceUrl: "https://vod.sooplive.com/player/123456789" }), "https://vod.sooplive.com/player/123456789/embed?autoPlay=true&mutePlay=true");

const table = rowsFromCsv([
  "번호,제목,멤버,태그,영상 링크,시작 시간,종료 시간,대표",
  "572,귀여워서미안해,달리,귀여움|댄스,https://www.youtube.com/watch?v=abc123&t=10s,00:10,00:20,true",
  "572,귀여워서미안해,달리,귀여움|댄스,https://www.youtube.com/watch?v=abc123&t=11s,00:11,00:21,false"
].join("\n"));
assert.equal(detectColumnMapping(table.headers).signature_number, 0);
assert.equal(table.rows.length, 2);

const draft = buildDraftFromRows(table.rows, {
  items: [{ number: 572, title: "귀여워서미안해", image: "images/572.png", tag: "달리" }]
}, [{ name: "달리" }]);
assert.equal(draft.summary.totalRows, 2);
assert.equal(draft.data.items.length, 1);
assert.equal(draft.data.items[0].timelineCount, 1);
assert.equal(draft.validation[1].warnings.some((warning) => warning.message.includes("유사한 타임라인")), true);
assert.equal(timelineKey(draft.data.items[0].timelines[0]), "youtube:abc123:5");

const soopTable = rowsFromCsv([
  "번호,제목,멤버,영상 링크,플랫폼,시작 시간,종료 시간,대표",
  "572,귀여워서미안해,달리,https://vod.sooplive.com/player/123456789,soop,00:10,00:20,true",
  "572,귀여워서미안해,달리,https://vod.sooplive.com/player/123456789/embed,soop,00:21,00:31,false",
  "572,귀여워서미안해,달리,https://vod.sooplive.com/player/123456789,soop,00:22,00:32,false"
].join("\n"));
const soopDraft = buildDraftFromRows(soopTable.rows, {
  items: [{ number: 572, title: "귀여워서미안해", image: "images/572.png", tag: "달리" }]
}, [{ name: "달리" }]);
assert.equal(soopDraft.summary.errorRows, 0);
assert.equal(soopDraft.data.items[0].timelineCount, 2);
assert.equal(soopDraft.data.items[0].timelines[0].provider, "soop");
assert.equal(soopDraft.data.items[0].timelines[0].videoId, "123456789");
assert.equal(soopDraft.data.items[0].timelines[0].embedUrl, "https://vod.sooplive.com/player/123456789/embed?autoPlay=true&mutePlay=true");
assert.equal(soopDraft.validation[2].warnings.some((warning) => warning.message.includes("유사한 타임라인")), true);

const invalidSoopTable = rowsFromCsv([
  "번호,제목,영상 링크,플랫폼,시작 시간",
  "572,귀여워서미안해,https://www.sooplive.com/station/demo/post/1,soop,00:10"
].join("\n"));
const invalidSoopDraft = buildDraftFromRows(invalidSoopTable.rows, {
  items: [{ number: 572, title: "귀여워서미안해", image: "images/572.png" }]
}, []);
assert.equal(invalidSoopDraft.summary.errorRows, 0);
assert.equal(invalidSoopDraft.summary.warningRows, 1);

const normalized = normalizePublicData({ items: [{ number: 1, title: "A", tag: "달리" }] });
assert.equal(normalized.total, 1);
assert.equal(normalized.items[0].timelineCount, 0);
assert.deepEqual(normalized.items[0].memberNames, ["달리"]);

const durationFixture = normalizePublicData({
  items: [{
    number: 1040,
    title: "슈퍼그럼요",
    defaultDuration: 22,
    timelines: [
      { id: "t1", title: "댓글 1", provider: "soop", sourceUrl: "https://vod.sooplive.com/player/111", startTime: 100, isPublished: true, sortOrder: 1 },
      { id: "t2", title: "댓글 2", provider: "soop", sourceUrl: "https://vod.sooplive.com/player/111", startTime: 115, isPublished: true, sortOrder: 2 },
      { id: "t3", title: "댓글 3", provider: "soop", sourceUrl: "https://vod.sooplive.com/player/111", startTime: 200, endTime: 240, isPublished: true, sortOrder: 3 }
    ]
  }]
});
const durationSignature = durationFixture.items[0];
assert.equal(durationSignature.defaultDuration, 22);
assert.equal(durationSignature.timelines[0].estimatedEndTime, 122);
assert.equal(durationSignature.timelines[0].effectiveEndTime, 114);
assert.equal(durationSignature.timelines[0].durationSource, "signature_default");
assert.equal(durationSignature.timelines[1].effectiveEndTime, 137);
assert.equal(durationSignature.timelines[2].effectiveEndTime, 240);
assert.equal(durationSignature.timelines[2].durationSource, "manually_confirmed");
assert.equal(durationSignature.timelines[2].isEndTimeConfirmed, true);

const fallbackDuration = normalizePublicData({
  items: [{
    number: 572,
    title: "귀여워서미안해",
    timelines: [{ id: "fallback", title: "댓글", provider: "soop", sourceUrl: "https://vod.sooplive.com/player/222", startTime: 50, isPublished: true }]
  }]
});
assert.equal(fallbackDuration.items[0].timelines[0].effectiveEndTime, 80);
assert.equal(fallbackDuration.items[0].timelines[0].durationSource, "estimated");

const noEndTable = rowsFromCsv([
  "번호,제목,영상 링크,플랫폼,시작 시간,종료 시간",
  "1040,슈퍼그럼요,https://vod.sooplive.com/player/333,soop,00:10,"
].join("\n"));
const noEndDraft = buildDraftFromRows(noEndTable.rows, {
  items: [{ number: 1040, title: "슈퍼그럼요", defaultDuration: 22, image: "images/1040.png" }]
}, []);
assert.equal(noEndDraft.summary.errorRows, 0);
assert.equal(noEndDraft.data.items[0].timelines[0].endTime, undefined);
assert.equal(noEndDraft.data.items[0].timelines[0].effectiveEndTime, 32);
assert.equal(noEndDraft.data.items[0].timelines[0].isEndTimeConfirmed, false);

const confirmed = confirmTimelineEnd(durationFixture, 1040, "t1", 121);
assert.equal(confirmed.items[0].timelines.find((item) => item.id === "t1").endTime, 121);
assert.equal(confirmed.items[0].timelines.find((item) => item.id === "t1").durationSource, "manually_confirmed");
assert.equal(reviewQueue(confirmed)[0].timelineId, "t2");

const defaultApplied = setSignatureDefaultDuration(confirmed, 1040, 18, true);
const appliedTimelines = defaultApplied.items[0].timelines;
assert.equal(defaultApplied.items[0].defaultDuration, 18);
assert.equal(appliedTimelines.find((item) => item.id === "t1").endTime, 121);
assert.equal(appliedTimelines.find((item) => item.id === "t1").durationSource, "manually_confirmed");
assert.equal(appliedTimelines.find((item) => item.id === "t2").durationSource, "signature_default");
assert.equal(appliedTimelines.find((item) => item.id === "t2").endTime, undefined);

const approvedDefault = approveTimelineDefault(defaultApplied, 1040, "t2");
assert.equal(approvedDefault.items[0].timelines.find((item) => item.id === "t2").durationSource, "signature_default");
assert.equal(approvedDefault.items[0].timelines.find((item) => item.id === "t2").isEndTimeConfirmed, false);

const stats = signatureReviewStats(defaultApplied);
assert.equal(stats.totalTimelines, 3);
assert.equal(stats.confirmed, 2);
assert.equal(stats.signatureDefault, 1);
assert.equal(stats.unconfirmed, 0);

console.log("signature utils tests passed");
