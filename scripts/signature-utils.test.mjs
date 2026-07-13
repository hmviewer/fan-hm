import assert from "node:assert/strict";
import {
  buildDraftFromRows,
  detectColumnMapping,
  extractTimelineFromUrl,
  formatTimelineTime,
  normalizePublicData,
  parseTimelineInput,
  rowsFromCsv,
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

const normalized = normalizePublicData({ items: [{ number: 1, title: "A", tag: "달리" }] });
assert.equal(normalized.total, 1);
assert.equal(normalized.items[0].timelineCount, 0);
assert.deepEqual(normalized.items[0].memberNames, ["달리"]);

console.log("signature utils tests passed");
