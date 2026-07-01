const DATASETS = {
  members: { title: "멤버", url: "../api/members.php", save: "members", kind: "array" },
  notices: { title: "공지", url: "../api/notices.php", save: "notices", kind: "array" },
  rank: { title: "후원 랭킹", url: "../api/rank.php?ym=all", save: "rank", kind: "array" },
  chatrank: { title: "채팅 랭킹", url: "../api/chatrank.php?ym=all", save: "chatrank", kind: "array" },
  shorts: { title: "쇼츠", url: "../api/shorts.php", save: "shorts", kind: "object" },
  live: { title: "LIVE", url: "../api/live.php", save: "live", kind: "object" },
  board: { title: "게시물", url: "../api/board.php", save: "board", kind: "array" },
};

const FIELD_SCHEMAS = {
  members: [
    ["name", "이름", "text"],
    ["soopId", "SOOP ID", "text"],
    ["group", "그룹", "select", ["대표", "멤버", "감찰", "웨이터"]],
    ["rank", "직급", "select", ["공동 대표", "부장", "차장", "과장", "팀장", "대리", "주임", "선임사원", "사원", "신입", "감찰", "웨이터"]],
  ],
  notices: [
    ["id", "ID", "number"],
    ["category", "카테고리", "text"],
    ["title", "제목", "text"],
    ["content", "내용", "textarea"],
    ["date", "날짜", "date"],
    ["pinned", "고정", "checkbox"],
    ["visible", "표시", "checkbox"],
  ],
  rank: [
    ["id", "ID", "text"],
    ["nickname", "닉네임", "text"],
    ["balloon", "후원액", "number"],
    ["donateCount", "후원 횟수", "number"],
  ],
  chatrank: [
    ["id", "ID", "text"],
    ["nickname", "닉네임", "text"],
    ["chat", "채팅 수", "number"],
  ],
};

const state = {
  activeTab: "dashboard",
  activeDataset: null,
  selectedIndex: 0,
  data: {},
  dirty: false,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function setStatus(text, cls = "") {
  const el = $("#saveStatus");
  el.textContent = text;
  el.className = `save-status ${cls}`.trim();
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

async function loadAll() {
  setStatus("불러오는 중");
  const entries = await Promise.all(Object.entries(DATASETS).map(async ([key, cfg]) => {
    try {
      return [key, await fetchJson(cfg.url)];
    } catch (error) {
      return [key, cfg.kind === "array" ? [] : {}, error.message];
    }
  }));
  entries.forEach(([key, value]) => { state.data[key] = value; });
  state.dirty = false;
  renderCurrent();
  setStatus("준비됨", "ok");
}

function getArray(key) {
  const value = state.data[key];
  return Array.isArray(value) ? value : [];
}

function countDataset(key) {
  const value = state.data[key];
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    if (Array.isArray(value.shorts)) return value.shorts.length;
    if (Array.isArray(value.members)) return value.members.length;
    return Object.keys(value).length;
  }
  return 0;
}

function renderDashboard() {
  $("#pageTitle").textContent = "대시보드";
  $("#dashboardPanel").classList.add("active");
  $("#editorPanel").classList.remove("active");
  $("#rawPanel").classList.remove("active");
  const metrics = [
    ["멤버", countDataset("members")],
    ["공지", countDataset("notices")],
    ["후원 랭킹", countDataset("rank")],
    ["채팅 랭킹", countDataset("chatrank")],
    ["쇼츠", countDataset("shorts")],
    ["LIVE 멤버", countDataset("live")],
    ["게시물", countDataset("board")],
  ];
  $("#metricGrid").innerHTML = metrics.map(([label, value]) => `
    <div class="metric"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${Number(value).toLocaleString("ko-KR")}</div></div>
  `).join("");
}

function renderEditor(key) {
  state.activeDataset = key;
  const cfg = DATASETS[key];
  $("#pageTitle").textContent = cfg.title;
  $("#dashboardPanel").classList.remove("active");
  $("#rawPanel").classList.remove("active");
  $("#editorPanel").classList.add("active");

  if (!Array.isArray(state.data[key])) {
    state.data[key] = normalizeObjectDataset(key, state.data[key]);
  }
  state.selectedIndex = Math.min(state.selectedIndex, Math.max(0, getArray(key).length - 1));
  renderList();
  renderForm();
}

function normalizeObjectDataset(key, value) {
  if (key === "shorts" && value && Array.isArray(value.shorts)) return value.shorts;
  if (key === "live" && value && Array.isArray(value.members)) return value.members;
  return [];
}

function renderRaw() {
  $("#pageTitle").textContent = "Raw JSON";
  $("#dashboardPanel").classList.remove("active");
  $("#editorPanel").classList.remove("active");
  $("#rawPanel").classList.add("active");
  $("#rawTarget").innerHTML = Object.entries(DATASETS).map(([key, cfg]) => `<option value="${key}">${escapeHtml(cfg.title)}</option>`).join("");
  const key = $("#rawTarget").value || "members";
  $("#rawEditor").value = JSON.stringify(state.data[key], null, 2);
}

function renderCurrent() {
  if (state.activeTab === "dashboard") renderDashboard();
  else if (state.activeTab === "raw") renderRaw();
  else renderEditor(state.activeTab);
}

function renderList() {
  const key = state.activeDataset;
  const list = getArray(key);
  const q = $("#searchInput").value.trim().toLowerCase();
  const filtered = list.map((item, index) => ({ item, index })).filter(({ item }) => {
    if (!q) return true;
    return JSON.stringify(item).toLowerCase().includes(q);
  });
  $("#itemCount").textContent = `${filtered.length.toLocaleString("ko-KR")} / ${list.length.toLocaleString("ko-KR")}개`;
  $("#itemList").innerHTML = filtered.map(({ item, index }) => {
    const title = itemTitle(key, item, index);
    const sub = itemSub(key, item);
    return `<button class="item-row ${index === state.selectedIndex ? "active" : ""}" type="button" data-index="${index}">
      <strong>${escapeHtml(title)}</strong><span>${escapeHtml(sub)}</span>
    </button>`;
  }).join("");
}

function itemTitle(key, item, index) {
  if (key === "members") return item.name || item.soopId || `멤버 ${index + 1}`;
  if (key === "notices") return item.title || `공지 ${item.id ?? index + 1}`;
  if (key === "rank" || key === "chatrank") return item.nickname || item.id || `랭킹 ${index + 1}`;
  if (key === "shorts") return item.title || item.videoId || `쇼츠 ${index + 1}`;
  if (key === "live") return item.name || item.soopId || `LIVE ${index + 1}`;
  return item.title || item.name || `항목 ${index + 1}`;
}

function itemSub(key, item) {
  if (key === "members") return `${item.group || "-"} · ${item.rank || "-"} · ${item.soopId || "-"}`;
  if (key === "notices") return `${item.category || "-"} · ${item.date || "-"} · ${item.visible ? "표시" : "숨김"}`;
  if (key === "rank") return `${Number(item.balloon || 0).toLocaleString("ko-KR")}개 · ${item.id || "-"}`;
  if (key === "chatrank") return `${Number(item.chat || 0).toLocaleString("ko-KR")}회 · ${item.id || "-"}`;
  if (key === "shorts") return `${item.channel || "-"} · ${item.published || "-"}`;
  if (key === "live") return `${item.isLive ? "LIVE" : "OFF"} · ${item.title || "-"}`;
  return "";
}

function schemaFor(key, item) {
  if (FIELD_SCHEMAS[key]) return FIELD_SCHEMAS[key];
  const keys = Object.keys(item || {});
  return keys.map((k) => [k, k, typeof item[k] === "number" ? "number" : typeof item[k] === "boolean" ? "checkbox" : typeof item[k] === "object" ? "json" : "text"]);
}

function renderForm() {
  const key = state.activeDataset;
  const list = getArray(key);
  const item = list[state.selectedIndex];
  if (!item) {
    $("#editForm").innerHTML = `<div class="field full"><p class="json-help">항목이 없습니다. 추가 버튼으로 새 항목을 만들 수 있습니다.</p></div>`;
    return;
  }
  const schema = schemaFor(key, item);
  $("#editForm").innerHTML = schema.map(([name, label, type, options]) => fieldHtml(name, label, type, options, item[name])).join("");
}

function fieldHtml(name, label, type, options, value) {
  const full = type === "textarea" || type === "json" ? " full" : "";
  if (type === "checkbox") {
    return `<label class="field${full}"><span>${escapeHtml(label)}</span><input data-field="${escapeAttr(name)}" type="checkbox" ${value ? "checked" : ""}></label>`;
  }
  if (type === "select") {
    const opts = options.map((opt) => `<option value="${escapeAttr(opt)}" ${String(value || "") === opt ? "selected" : ""}>${escapeHtml(opt)}</option>`).join("");
    return `<label class="field${full}"><span>${escapeHtml(label)}</span><select data-field="${escapeAttr(name)}">${opts}</select></label>`;
  }
  if (type === "textarea") {
    return `<label class="field full"><span>${escapeHtml(label)}</span><textarea data-field="${escapeAttr(name)}">${escapeHtml(value || "")}</textarea></label>`;
  }
  if (type === "json") {
    return `<label class="field full"><span>${escapeHtml(label)}</span><textarea data-field="${escapeAttr(name)}" data-json="1">${escapeHtml(JSON.stringify(value ?? [], null, 2))}</textarea><em class="json-help">배열/객체 JSON 형식으로 입력하세요.</em></label>`;
  }
  return `<label class="field${full}"><span>${escapeHtml(label)}</span><input data-field="${escapeAttr(name)}" type="${type}" value="${escapeAttr(value ?? "")}"></label>`;
}

function updateSelectedFromForm(event) {
  const input = event.target.closest("[data-field]");
  if (!input) return;
  const key = state.activeDataset;
  const item = getArray(key)[state.selectedIndex];
  if (!item) return;
  const field = input.dataset.field;
  let value;
  if (input.type === "checkbox") value = input.checked;
  else if (input.dataset.json === "1") {
    try {
      value = JSON.parse(input.value || "null");
      input.setCustomValidity("");
    } catch {
      input.setCustomValidity("JSON 형식이 맞지 않습니다.");
      input.reportValidity();
      return;
    }
  } else if (input.type === "number") value = input.value === "" ? "" : Number(input.value);
  else value = input.value;
  item[field] = value;
  markDirty();
  renderList();
}

function markDirty() {
  state.dirty = true;
  setStatus("수정됨");
}

function createDefaultItem(key) {
  if (key === "signatures") return { number: nextNumber(getArray(key), "number"), name: "새 시그니처", image: "", audio: "", videos: [] };
  if (key === "members") return { name: "새 멤버", soopId: "", group: "멤버", rank: "선임사원" };
  if (key === "notices") return { id: nextNumber(getArray(key), "id"), category: "공지", title: "새 공지", content: "", date: new Date().toISOString().slice(0, 10), pinned: false, visible: true };
  if (key === "rank") return { id: "", nickname: "새 후원자", balloon: 0, donateCount: 0 };
  if (key === "chatrank") return { id: "", nickname: "새 채팅러", chat: 0 };
  if (key === "shorts") return { videoId: "", title: "새 쇼츠", thumb: "", url: "", channel: "The HM", published: new Date().toISOString() };
  return {};
}

function nextNumber(list, field) {
  return Math.max(0, ...list.map((item) => Number(item[field] || 0)).filter(Number.isFinite)) + 1;
}

function addItem() {
  const key = state.activeDataset;
  const list = getArray(key);
  list.push(createDefaultItem(key));
  state.selectedIndex = list.length - 1;
  markDirty();
  renderEditor(key);
}

function duplicateItem() {
  const key = state.activeDataset;
  const list = getArray(key);
  const item = list[state.selectedIndex];
  if (!item) return;
  const clone = JSON.parse(JSON.stringify(item));
  if ("id" in clone && typeof clone.id === "number") clone.id = nextNumber(list, "id");
  if ("number" in clone) clone.number = nextNumber(list, "number");
  if ("name" in clone) clone.name = `${clone.name} 복사`;
  list.splice(state.selectedIndex + 1, 0, clone);
  state.selectedIndex += 1;
  markDirty();
  renderEditor(key);
}

function deleteItem() {
  const key = state.activeDataset;
  const list = getArray(key);
  if (!list.length) return;
  const item = list[state.selectedIndex];
  if (!confirm(`${itemTitle(key, item, state.selectedIndex)} 항목을 삭제할까요?`)) return;
  list.splice(state.selectedIndex, 1);
  state.selectedIndex = Math.max(0, state.selectedIndex - 1);
  markDirty();
  renderEditor(key);
}

function prepareSaveData(key) {
  const value = state.data[key];
  if (key === "shorts" && Array.isArray(value)) return { shorts: value, updatedAt: Math.floor(Date.now() / 1000) };
  if (key === "live" && Array.isArray(value)) return { total: value.length, liveCount: value.filter((m) => m.isLive).length, updatedAt: Math.floor(Date.now() / 1000), members: value };
  return value;
}

async function saveDataset(key = state.activeDataset) {
  if (!key) return;
  setStatus("저장 중");
  const data = prepareSaveData(key);
  const res = await fetch("../local-admin/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target: DATASETS[key].save, data }),
  });
  const body = await res.json();
  if (!body.success) {
    setStatus("저장 실패", "err");
    alert(body.message || "저장 실패");
    return;
  }
  state.data[key] = data;
  state.dirty = false;
  setStatus("저장됨", "ok");
}

function switchTab(tab) {
  if (state.dirty && !confirm("저장하지 않은 변경이 있습니다. 이동할까요?")) return;
  state.activeTab = tab;
  state.selectedIndex = 0;
  state.dirty = false;
  $$(".nav-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  renderCurrent();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function bindEvents() {
  $$(".nav-btn").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  $("#reloadBtn").addEventListener("click", () => loadAll());
  $("#searchInput").addEventListener("input", renderList);
  $("#itemList").addEventListener("click", (event) => {
    const row = event.target.closest(".item-row");
    if (!row) return;
    state.selectedIndex = Number(row.dataset.index);
    renderList();
    renderForm();
  });
  $("#editForm").addEventListener("input", updateSelectedFromForm);
  $("#editForm").addEventListener("change", updateSelectedFromForm);
  $("#addBtn").addEventListener("click", addItem);
  $("#duplicateBtn").addEventListener("click", duplicateItem);
  $("#deleteBtn").addEventListener("click", deleteItem);
  $("#saveBtn").addEventListener("click", () => saveDataset());
  $("#rawTarget").addEventListener("change", (event) => {
    $("#rawEditor").value = JSON.stringify(state.data[event.target.value], null, 2);
  });
  $("#formatRawBtn").addEventListener("click", () => {
    try {
      $("#rawEditor").value = JSON.stringify(JSON.parse($("#rawEditor").value), null, 2);
    } catch {
      alert("JSON 형식이 맞지 않습니다.");
    }
  });
  $("#saveRawBtn").addEventListener("click", async () => {
    const key = $("#rawTarget").value;
    try {
      state.data[key] = JSON.parse($("#rawEditor").value);
      await saveDataset(key);
    } catch (error) {
      setStatus("저장 실패", "err");
      alert(error.message);
    }
  });
}

bindEvents();
loadAll().catch((error) => {
  console.error(error);
  setStatus("오류", "err");
});
