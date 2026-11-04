// Google Sheets gviz JSON API로 데이터 가져오기
const SHEET_ID = "1LqUQ0cEDyys8JDrWDXfm7u33d7IAfMChdW7vksJ-i2U";
const SHEET_NAME = "오카리나";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

let allData = [];
let currentView = "month"; // "month" | "all"
const today = new Date();
let selectedMonth = today.getMonth() + 1;
const THIS_YEAR = today.getFullYear();
let YEARS = []; // 시트 A열 날짜에서 추출 (오름차순)
let selectedYear = THIS_YEAR; // 전체 탭 연도 필터 (기본: 올해)
let closestDateStr = null; // 오늘과 가장 가까운 날짜 (YYYY-MM-DD)
let lastThisWeekHtml = ""; // 이번주 영역 마지막 렌더 결과

/* ---------- 유틸 ---------- */
const pad = (n) => String(n).padStart(2, "0");
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// gviz 날짜 셀 → Date (실패 시 null)
function parseDateCell(cell) {
  if (!cell) return null;
  const v = cell.v;

  // 1) "Date(2025,9,12)" 형태 (월은 0부터 시작)
  if (typeof v === "string") {
    const m = v.match(/^Date\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) return new Date(+m[1], +m[2], +m[3]);
  }
  // 2) Date 객체
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());

  // 3) 표시 문자열(f) 또는 문자열 값: 2025-10-12, 2025.10.12, 2025. 10. 12 등
  const str = cell.f || (typeof v === "string" ? v : "");
  const n = str.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (n) return new Date(+n[1], +n[2] - 1, +n[3]);

  // 4) "10/12", "10월 12일" → 올해로 간주
  const s = str.match(/(\d{1,2})\D+(\d{1,2})/);
  if (s) return new Date(today.getFullYear(), +s[1] - 1, +s[2]);

  return null;
}

/* ---------- 로딩 팝업 ---------- */
let loadingEl = null;

function showLoading() {
  if (!loadingEl) {
    loadingEl = document.createElement("div");
    loadingEl.className = "loading-overlay";
    loadingEl.setAttribute("role", "status");
    loadingEl.setAttribute("aria-live", "polite");
    loadingEl.innerHTML = `
      <div class="loading-box">
        <div class="loading-spinner" aria-hidden="true"></div>
        <p>불러오는 중...</p>
      </div>`;
    document.body.appendChild(loadingEl);
  }
  loadingEl.classList.remove("hide");
}

function hideLoading() {
  if (!loadingEl) return;
  loadingEl.classList.add("hide");
}

/* ---------- 데이터 가져오기 ---------- */
// gviz 쿼리 실행 → JSON 반환
// A: 날짜, B: 장, C: 제목, D: 조성, E: 이벤트, F: 파일명, G: 이미지 URL
async function requestGviz(queryStr) {
  const query = encodeURIComponent(queryStr);
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tq=${query}&sheet=${encodeURIComponent(SHEET_NAME)}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error("시트 데이터를 불러올 수 없습니다");

  const text = await response.text();
  const jsonStr = text.match(/\{.*\}/s)[0];
  return JSON.parse(jsonStr);
}

let fullLoaded = false; // 전체 데이터 로딩 완료 여부

async function fetchSheetData() {
  showLoading();
  fullLoaded = false;

  // 이번달 1일 ~ 다다음달 1일 (이번달 + 다음달)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const rangeStart = toDateStr(monthStart);
  const rangeEnd = toDateStr(new Date(monthStart.getFullYear(), monthStart.getMonth() + 2, 1));

  // 1) 이번달·다음달만 먼저 요청 → 도착 즉시 화면 표시
  //    (실패하거나 결과가 없으면 조용히 넘어가고 전체 데이터를 기다림)
  requestGviz(`SELECT A, B, C, D, E, F, G WHERE A >= date '${rangeStart}' AND A < date '${rangeEnd}'`)
    .then((data) => {
      if (fullLoaded) return; // 전체 데이터가 이미 왔으면 무시
      parseGvizData(data);
      if (!allData.length) return;
      renderAll();
      hideLoading();
    })
    .catch((error) => console.warn("이번달/다음달 우선 로딩 실패:", error));

  // 2) 전체 데이터는 동시에 요청 → 도착하면 덮어써서 갱신
  try {
    const data = await requestGviz(`SELECT A, B, C, D, E, F, G`);
    fullLoaded = true;
    parseGvizData(data);
    renderAll();
  } catch (error) {
    console.error("❌ 에러:", error);
    if (!allData.length) {
      showError("시트 데이터를 불러오지 못했습니다: " + error.message);
    }
  } finally {
    hideLoading(); // 성공/실패 모두 로딩 팝업 닫기
  }
}

// gviz JSON 파싱
function parseGvizData(data) {
  allData = [];

  if (!data.table || !data.table.rows) {
    console.warn("테이블 데이터가 없습니다");
    return;
  }

  data.table.rows.forEach((row) => {
    const cells = row.c;
    if (!cells || cells.length < 2) return;

    // A열에 날짜가 있는 행만 사용 (없으면 제외)
    const currentDate = parseDateCell(cells[0]);
    if (!currentDate) return;

    // A: 날짜, B: 장, C: 제목, D: 조성, E: 이벤트, F: 파일명, G: 이미지 URL
    let option = cells[1]?.v;
    const title = cells[2]?.v;
    const key = cells[3]?.v;
    const event = cells[4]?.v;
    const imageUrl = cells[6]?.v;
    console.log(title, key, event, imageUrl);

    // 음원 파일명 규칙에 쓰기 위해 가공 전 원본 장 값 보관
    const rawOption = option ? String(option).trim() : "";

    // 장 값 처리
    if (option) {
      option = String(option).trim();
      if (option.toLowerCase() === "ccm") {
        option = ""; // ccm은 공백
      } else if (option.startsWith("찬송가")) {
        option = option.replace(/^찬송가\s*/, "찬 ");
      }
    }

    if (!title) return;

    allData.push({
      date: new Date(currentDate),
      dateStr: toDateStr(currentDate),
      title: String(title).trim(),
      option: option || "",
      rawOption, // 가공 전 원본 장 값 (이번주 카드 표시용)
      key: key || "",
      event: event || "",
      imageUrl: imageUrl || "",
      track: makeTrackKey(rawOption, String(title).trim()), // 음원 파일명(확장자 제외)
    });
  });

  allData.sort((a, b) => a.date - b.date);
  allData.forEach((d, i) => (d.id = i)); // 목록 항목 → 상세 팝업 연결용
  closestDateStr = findClosestDateStr();

  // 시트에 존재하는 연도 목록
  YEARS = [...new Set(allData.map((d) => d.date.getFullYear()))].sort((a, b) => a - b);
  // 선택 연도가 목록에 없으면: 올해 → 올해 이후 가장 가까운 해 → 마지막 해
  if (YEARS.length && !YEARS.includes(selectedYear)) {
    selectedYear = YEARS.find((y) => y >= THIS_YEAR) ?? YEARS[YEARS.length - 1];
  }
}

// 오늘 이후 가장 가까운 날짜 찾기
function findClosestDateStr() {
  if (!allData.length) return null;

  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let best = null;
  let bestDiff = Infinity;

  allData.forEach((d) => {
    const diff = d.date - base;

    // 오늘 이후 날짜만
    if (diff >= 0 && diff < bestDiff) {
      bestDiff = diff;
      best = d.dateStr;
    }
  });

  return best;
}

/* ---------- 렌더링 ---------- */
function renderAll() {
  renderThisWeek();
  renderYearChips();
  renderMonthChips();
  renderList();
}

// 가져온 날짜와 오늘을 비교해 pill 문구 결정
function getPillLabel(target) {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate());

  // 오늘
  if (t.getTime() === base.getTime()) return "오늘";

  // 다음달 (12월 → 1월처럼 연도가 넘어가는 경우도 처리)
  const monthDiff = (t.getFullYear() - base.getFullYear()) * 12 + (t.getMonth() - base.getMonth());
  if (monthDiff >= 1) return "다음달";

  // 같은 달: 7일 이상이면 다음주, 미만이면 이번주
  const dayDiff = Math.round((t - base) / 86400000);
  return dayDiff >= 7 ? "다음주" : "이번주";
}

// 장 표시: "찬송가 589장" / ccm·빈 값은 "CCM"
function getOptionLabel(s) {
  const opt = String(s.rawOption || "").trim();
  if (!opt || opt.toLowerCase() === "ccm") return "CCM";
  return opt.replace(/^찬송가\s*/, "찬송가 ");
}

// 조성 표시: 왼쪽에 문자("Eb" → "E키"), 오른쪽에 기존 조표 아이콘(.key)
function keyHTML(key) {
  const k = String(key || "").trim();
  if (!k) return "";
  return `<span class="key ${esc(k)}"></span><span class="tw-key-text">(${esc(k.charAt(0).toUpperCase())}키)</span>`;
}

// 이번주 영역: 오늘과 가장 가까운 날짜 → 월/일/요일
function renderThisWeek() {
  const body = document.getElementById("thisWeekBody");
  const pill = document.getElementById("pill");
  const songs = allData.filter((d) => d.dateStr === closestDateStr);

  if (!songs.length) {
    body.innerHTML = `<p class="empty-this-week">표시할 일정이 없습니다.</p>`;
    lastThisWeekHtml = "";
    return;
  }

  const d = songs[0].date;
  pill.textContent = getPillLabel(d);
  const monthWeek = `${d.getMonth() + 1}월 • ${WEEKDAYS[d.getDay()]}요일`;
  const event = (songs.find((x) => x.event) || {}).event || ""; // 날짜 공통 이벤트

  // 날짜 영역: 큰 일(日) + 월·요일 + 이벤트
  const head = `
      <div class="tw-head">
        <span class="tw-day">${d.getDate()}<span class="tw-day-text">일</span></span>
        <div class="tw-date">
          <span class="tw-md">${monthWeek}</span>
          ${event ? `<span class="tw-event">${esc(event)}</span>` : ""}
        </div>
      </div>`;

  // 곡 영역: 장·조성 → 제목 → [재생 버튼 + 재생바 + 악보 보기]
  const list = songs
    .map(
      (s) => `
      <div class="song">
        <div class="this-week-meta">
          <span class="tw-hymn">${esc(getOptionLabel(s))}</span>
          <span class="tw-key">${keyHTML(s.key)}</span>
        </div>
        <h2 class="this-week-title">${esc(s.title)}</h2>
        <div class="tw-player">
          ${playerBarHTML(s)}
          <button class="paper" data-image="${esc(s.imageUrl)}" data-filename="" ${!s.imageUrl ? "disabled" : ""}>
            <span alt="paper" class="paper-icon"></span>
            <span class="paper-label">악보 보기</span>
          </button>
        </div>
        ${s.imageUrl ? `<div class="score-inline" hidden></div>` : ""}
      </div>`,
    )
    .join("");

  const html = head + list;

  // 내용이 같으면 다시 그리지 않음 (데이터가 한 번 더 로딩돼도 재생바 상태가 초기화되지 않도록)
  if (html !== lastThisWeekHtml) {
    body.innerHTML = html;
    lastThisWeekHtml = html;
    probeBars(); // 음원 길이/존재 여부 확인
  }

  syncPlayButtons(); // 재생 중인 곡이면 일시정지 아이콘 유지
}

// 월 칩 선택 상태
function renderMonthChips() {
  const isAll = currentView === "all";

  document.querySelectorAll("#monthsChips .chip").forEach((chip) => {
    chip.classList.toggle("on", +chip.dataset.month === selectedMonth);
  });
  document.querySelectorAll("#yearChips .chip").forEach((chip) => {
    chip.classList.toggle("on", +chip.dataset.year === selectedYear);
  });

  // 월별: 월 칩 / 전체: 연도 칩
  document.getElementById("months").classList.toggle("off", isAll);
  document.getElementById("years").classList.toggle("off", !isAll);
  // 전체 탭에서는 이번주 영역 숨김
  document.getElementById("this-week").hidden = isAll;
}

// 리스트 한 줄 (좌측엔 일만 표시). 클릭하면 곡 상세 팝업
// 제목 옆 아이콘은 버튼이 아니라 악보/음원 보유 여부 표시용 (있으면 색, 없으면 회색)
function itemHTML(s, colorIdx) {
  const cur = s.dateStr === closestDateStr ? " cur" : "";
  const hasScore = !!s.imageUrl;
  const hasAudio = mediaState[s.track] === true;
  return `
    <div class="item${cur}" role="button" tabindex="0" aria-haspopup="dialog" data-id="${s.id}">
      <span class="day c${colorIdx % 5}">${s.date.getDate()}</span>
      <div class="txt">
        <div class="title-row">
          <b>${esc(s.title)}</b>
          <div class="btns">
            <span class="ind ind-score${hasScore ? " on" : ""}" title="${hasScore ? "악보 있음" : "악보 없음"}"><span class="paper-icon"></span></span>
            <span class="ind ind-audio${hasAudio ? " on" : ""}" data-track="${esc(s.track)}" title="${hasAudio ? "음원 있음" : "음원 없음"}"><img src="./image/play.svg" alt="" class="play-icon"></span>
          </div>
        </div>
        <div class="row wrap-sb">
          <small>${s.option ? `${esc(s.option)}` : "CCM"}</small>
          ${s.event ? `<small class="event">${esc(s.event)}</small>` : ""}
        </div>
      </div>
    </div>`;
}

// ${s.option ? `<small>${esc(s.option)}</small>` : ""}
// ${s.key ? `<small>${esc(s.key)}</small>` : ""}

function renderList() {
  const list = document.getElementById("monthList");
  let html = "";

  if (currentView === "month") {
    // 월별 목록은 올해 데이터만
    const items = allData.filter((d) => d.date.getFullYear() === THIS_YEAR && d.date.getMonth() + 1 === selectedMonth);
    html += `<div class="list-head"><h2>${selectedMonth}월</h2><span>${items.length}곡</span></div>`;

    if (!items.length) {
      html += `<p class="msg">${selectedMonth}월 일정이 없습니다.</p>`;
    } else {
      html += items.map((s, i) => itemHTML(s, i)).join("");
    }
  } else {
    // 전체: 월별로 묶어서 표시
    const items = allData.filter((d) => d.date.getFullYear() === selectedYear);
    if (!items.length) {
      html += `<p class="msg">${selectedYear}년 일정이 없습니다.</p>`;
    } else {
      let lastMonth = -1;
      items.forEach((s, i) => {
        const m = s.date.getMonth();
        if (m !== lastMonth) {
          html += `<div class="grp">${m + 1}월</div>`;
          lastMonth = m;
        }
        html += itemHTML(s, i);
      });
    }
  }

  list.innerHTML = html;
  syncPlayButtons(); // 재생 중인 곡이면 재생바 상태 유지
  checkListMedia(); // 목록 음원 아이콘(있음/없음) 확인
}

function showError(message) {
  document.getElementById("monthList").innerHTML = `<div class="msg">${esc(message)}<br /><button type="button" id="retryBtn">다시 시도</button></div>`;
  document.getElementById("retryBtn").addEventListener("click", fetchSheetData);
}

/* ---------- 이벤트 ---------- */
function createYearChips() {
  const nav = document.createElement("nav");
  nav.className = "months off";
  nav.id = "years";
  nav.setAttribute("aria-label", "연도 선택");
  nav.innerHTML = `<ul class="months-chips" id="yearChips"></ul>`;
  document.getElementById("months").after(nav);
}

// 시트 데이터 기준으로 연도 칩 생성
function renderYearChips() {
  const ul = document.getElementById("yearChips");
  ul.style.gridTemplateColumns = `repeat(${Math.min(Math.max(YEARS.length, 1), 6)}, 1fr)`;
  ul.innerHTML = YEARS.map((y) => `<li class="chip" data-year="${y}">${y}</li>`).join("");
}

function bindEvents() {
  createYearChips();

  document.getElementById("yearChips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    selectedYear = +chip.dataset.year;
    renderMonthChips();
    renderList();
  });

  document.getElementById("monthsChips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    selectedMonth = +chip.dataset.month;
    renderMonthChips();
    renderList();
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      currentView = tab.dataset.view;
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t === tab));
      renderMonthChips();
      renderList();
    });
  });

  // 목록 항목 클릭(또는 Enter/Space) → 곡 상세 팝업
  const monthList = document.getElementById("monthList");
  monthList.addEventListener("click", (e) => {
    const item = e.target.closest(".item");
    if (item) openSongModal(+item.dataset.id);
  });
  monthList.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target.closest(".item");
    if (!item) return;
    e.preventDefault();
    openSongModal(+item.dataset.id);
  });
}

// 오늘 날짜 표시
function updateCurrentInfo() {
  document.getElementById("today").textContent = today.toLocaleDateString("ko-KR", {
    // year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

/* ---------- 실행 ---------- */
showLoading(); // 진입 즉시 로딩 팝업 표시
updateCurrentInfo();
bindEvents();
renderMonthChips();
fetchSheetData();

// 이번주 영역 악보 버튼 → 재생바 아래에 악보 표시 (다시 누르면 접힘)
// 캡처 단계에서 등록: 다른 클릭 리스너보다 먼저 가로채기 위함
document.addEventListener(
  "click",
  (e) => {
    const button = e.target.closest(".paper");
    if (!button || button.disabled) return;

    e.stopPropagation();

    const imageUrl = getDriveImageUrl(button.dataset.image);
    const panel = button.closest("#thisWeekBody .song")?.querySelector(".score-inline");
    if (imageUrl && panel) toggleInlineScore(button, panel, imageUrl);
  },
  true,
);

/* ---------- 음원(mp3) 재생: ./media 폴더 ---------- */
const MEDIA_DIR = "./media/";

// 시트 값 → 음원 파일명(확장자 제외)
//  - B열 "찬송가 123장" → 새찬송가_123장_제목
//  - B열 "ccm" 또는 빈 값 → ccm_제목
//  - 그 외 → "" (음원 없음)
function makeTrackKey(rawOption, title) {
  if (!title) return "";
  const opt = String(rawOption || "").trim();

  if (opt.startsWith("찬송가")) {
    const num = opt.match(/\d+/);
    return num ? `새찬송가_${num[0]}장_${title}` : `새찬송가_${title}`;
  }
  if (opt === "" || opt.toLowerCase() === "ccm") return `ccm_${title}`;
  return "";
}

// 파일명 → 재생 주소 후보
// macOS에서 만든 한글 파일명은 자모가 분리된(NFD) 형태로 저장될 수 있어 NFC/NFD 두 가지를 모두 시도
function getMediaUrls(key) {
  if (!key) return [];
  const names = [...new Set([key.normalize("NFC"), key.normalize("NFD")])];
  return names.map((n) => `${MEDIA_DIR}${encodeURIComponent(n)}.mp3`);
}

const player = new Audio(); // 한 번에 한 곡만 재생
player.preload = "none";
player.loop = true; // 반복 재생
let currentKey = ""; // 재생 중이거나 일시정지된 곡의 파일명
let currentTry = 0; // 주소 후보 중 시도 중인 순번
const durations = {}; // 파일명 → 길이(초)
const urlIndex = {}; // 파일명 → 실제로 열린 주소 후보 순번
const missing = {}; // 파일명 → 음원 파일 없음

// 초 → mm:ss
function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const t = Math.floor(sec);
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

// 이번주 영역 재생바 (원형 재생 버튼 + 진행 막대 + 경과/남은 시간)
function playerBarHTML(s) {
  if (!s.track) return "";
  return `
          <div class="pbar" data-track="${esc(s.track)}">
            <button type="button" class="pb-toggle" aria-label="듣기">
              <svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13L19 12z"/></svg>
              <svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>
            </button>
            <div class="pb-main">
              <div class="pb-track" role="slider" tabindex="0" aria-label="재생 위치" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                <span class="pb-fill"></span>
                <span class="pb-thumb"></span>
              </div>
              <div class="pb-times"><span class="pb-cur">00:00</span><span class="pb-rem">-00:00</span></div>
            </div>
          </div>`;
}

// 이번주 재생바의 음원 길이/존재 여부 미리 확인 (파일이 없으면 비활성 표시)
function probeBars() {
  document.querySelectorAll(".pbar").forEach((bar) => probeTrack(bar.dataset.track));
}

function probeTrack(key) {
  if (!key || key in durations || missing[key]) return;

  const urls = getMediaUrls(key);
  let i = 0;
  const probe = new Audio();
  probe.preload = "metadata";

  const next = () => {
    if (i >= urls.length) {
      missing[key] = true;
      syncPlayButtons();
      return;
    }
    probe.src = urls[i++];
  };

  probe.addEventListener("loadedmetadata", () => {
    durations[key] = probe.duration;
    urlIndex[key] = i - 1;
    probe.removeAttribute("src");
    updateBars();
  });
  probe.addEventListener("error", next);
  next();
}

// 재생바 원형 버튼 클릭 → 바로 재생, 다시 누르면 일시정지
document.addEventListener(
  "click",
  (e) => {
    const button = e.target.closest(".pb-toggle");
    if (!button || button.disabled) return;

    e.stopPropagation();

    const key = button.closest(".pbar")?.dataset.track;
    if (!key) return;

    togglePlay(key);
  },
  true,
);

function togglePlay(key) {
  // 같은 곡: 재생 ↔ 일시정지
  if (currentKey === key) {
    if (player.paused) startPlay();
    else player.pause();
    return;
  }
  // 다른 곡: 기존 재생을 멈추고 새로 재생
  currentKey = key;
  currentTry = urlIndex[key] ?? 0;
  player.src = getMediaUrls(key)[currentTry];
  startPlay();
}

function startPlay() {
  const promise = player.play();
  syncPlayButtons();
  if (promise) {
    // 파일 오류(NotSupported 등)는 error 이벤트에서 처리. 여기서는 재생 차단만 처리
    promise.catch((err) => {
      if (err.name === "NotAllowedError") syncPlayButtons();
    });
  }
}

// 음원을 열 수 없을 때: 다음 주소 후보(NFC↔NFD)를 시도하고, 모두 실패하면 "음원 없음" 처리
function onPlayFailed() {
  if (!currentKey) return;

  const urls = getMediaUrls(currentKey);
  if (currentTry + 1 < urls.length) {
    currentTry += 1;
    player.src = urls[currentTry];
    startPlay();
    return;
  }

  console.warn("음원을 재생할 수 없습니다:", currentKey);
  missing[currentKey] = true;
  currentKey = "";
  player.removeAttribute("src");
  player.load();
  syncPlayButtons();
}

// 이번주 영역 재생바 갱신 (진행 막대, 시간, 재생/일시정지 아이콘)
function updateBars() {
  document.querySelectorAll(".pbar").forEach((bar) => {
    const key = bar.dataset.track;
    const isThis = key === currentKey;
    const playing = isThis && !player.paused;
    const dur = isThis && isFinite(player.duration) && player.duration > 0 ? player.duration : durations[key] || 0;
    const cur = isThis ? player.currentTime : 0;
    const ratio = dur ? Math.min(Math.max(cur / dur, 0), 1) : 0;

    bar.style.setProperty("--p", `${(ratio * 100).toFixed(2)}%`);
    bar.classList.toggle("playing", playing);
    bar.classList.toggle("unavailable", !!missing[key]);
    bar.classList.toggle("ready", !!dur); // 길이를 알면 재생 버튼 활성 색
    bar.querySelector(".pb-cur").textContent = fmtTime(cur);
    bar.querySelector(".pb-rem").textContent = `-${fmtTime(dur - cur)}`;
    bar.querySelector(".pb-track").setAttribute("aria-valuenow", Math.round(ratio * 100));

    const toggle = bar.querySelector(".pb-toggle");
    toggle.disabled = !!missing[key];
    toggle.setAttribute("aria-label", playing ? "일시정지" : "듣기");
  });
}

// 재생바를 현재 재생 상태에 맞춤 (같은 곡의 재생바가 이번주 영역과 팝업에 함께 있어도 같이 변경)
function syncPlayButtons() {
  updateBars();
}

player.addEventListener("play", syncPlayButtons);
player.addEventListener("pause", syncPlayButtons);
player.addEventListener("ended", syncPlayButtons);
player.addEventListener("timeupdate", updateBars);
player.addEventListener("durationchange", updateBars);
player.addEventListener("error", onPlayFailed);

// 재생바 위치 이동 (클릭/드래그). 재생을 시작한 곡만 이동 가능
let seekingTrack = null;

function seekFromPointer(track, e) {
  const key = track.closest(".pbar").dataset.track;
  if (key !== currentKey || !isFinite(player.duration) || !player.duration) return;

  const rect = track.getBoundingClientRect();
  const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  player.currentTime = ratio * player.duration;
  updateBars();
}

document.addEventListener("pointerdown", (e) => {
  const track = e.target.closest(".pb-track");
  if (!track) return;
  seekingTrack = track;
  if (track.setPointerCapture) track.setPointerCapture(e.pointerId);
  seekFromPointer(track, e);
});
document.addEventListener("pointermove", (e) => {
  if (seekingTrack) seekFromPointer(seekingTrack, e);
});
["pointerup", "pointercancel"].forEach((type) => document.addEventListener(type, () => (seekingTrack = null)));

// 키보드: 재생바에서 ←/→ 로 5초 이동
document.addEventListener("keydown", (e) => {
  const track = e.target.closest && e.target.closest(".pb-track");
  if (!track || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
  if (track.closest(".pbar").dataset.track !== currentKey || !isFinite(player.duration)) return;

  e.preventDefault();
  const next = player.currentTime + (e.key === "ArrowRight" ? 5 : -5);
  player.currentTime = Math.min(Math.max(next, 0), player.duration);
  updateBars();
});

// 이번주 영역 악보: 처음 열 때 이미지를 불러오고, 이후에는 보이기/숨기기만 전환
function toggleInlineScore(button, panel, imageUrl) {
  const opening = panel.hidden;

  if (opening && !panel.firstChild) {
    const img = document.createElement("img");
    img.alt = "악보";
    img.src = imageUrl;
    panel.appendChild(img);
  }

  panel.hidden = !opening;
  button.classList.toggle("on", opening);
  button.setAttribute("aria-expanded", String(opening));

  const label = button.querySelector(".paper-label");
  if (label) label.textContent = opening ? "악보 접기" : "악보 보기";
}

/* ---------- 목록: 음원 있음/없음 확인 ---------- */
const mediaState = {}; // 파일명 → 음원 파일 존재 여부 (확인된 것만 저장)
const mediaChecking = {}; // 확인 중인 요청 (중복 방지)

// 음원 파일 존재 여부 확인 (HEAD 요청: 파일 내용은 받지 않음)
// 네트워크 오류면 결과를 저장하지 않아 다음에 다시 확인
function mediaExists(key) {
  if (key in mediaState) return Promise.resolve(mediaState[key]);

  if (!mediaChecking[key]) {
    mediaChecking[key] = (async () => {
      let networkError = false;
      for (const url of getMediaUrls(key)) {
        try {
          const res = await fetch(url, { method: "HEAD" });
          if (res.ok) {
            mediaState[key] = true;
            return true;
          }
        } catch (err) {
          networkError = true;
        }
      }
      if (!networkError) {
        mediaState[key] = false;
        missing[key] = true; // 재생바도 "음원 없음" 표시
      }
      return false;
    })().finally(() => delete mediaChecking[key]);
  }
  return mediaChecking[key];
}

// 화면에 보이는 목록 항목의 음원 아이콘 갱신
function updateListIcons() {
  document.querySelectorAll(".ind-audio").forEach((el) => {
    const on = mediaState[el.dataset.track] === true;
    el.classList.toggle("on", on);
    el.setAttribute("title", on ? "음원 있음" : "음원 없음");
  });
}

// 아직 확인하지 않은 곡만 6개씩 나눠서 확인
async function checkListMedia() {
  const keys = [...new Set([...document.querySelectorAll(".ind-audio")].map((el) => el.dataset.track))].filter((k) => k && !(k in mediaState));
  let i = 0;

  const worker = async () => {
    while (i < keys.length) {
      await mediaExists(keys[i++]);
      updateListIcons();
      updateBars();
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, keys.length) }, worker));
}

/* ---------- 곡 상세 팝업 (월별/전체 목록 항목 클릭) ---------- */
// "26년 11월 15일 일요일"
function songDateLabel(d) {
  return `${String(d.getFullYear()).slice(2)}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}

// 팝업 조성: 조표 아이콘 + "(E키)"
function keyModalHTML(key) {
  const k = String(key || "").trim();
  if (!k) return "";
  return `<span class="key ${esc(k)}"></span><span>(${esc(k.charAt(0).toUpperCase())}키)</span>`;
}

function openSongModal(id) {
  const s = allData.find((d) => d.id === id);
  if (!s) return;

  const opener = document.activeElement;
  const key = s.track;
  const wasPlaying = !!key && currentKey === key && !player.paused; // 열 때 이미 재생 중이었는지
  const imgUrl = getDriveImageUrl(s.imageUrl);

  const overlay = document.createElement("div");
  overlay.className = "song-modal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", s.title);
  overlay.innerHTML = `
    <div class="song-card">
      <button type="button" class="song-close" aria-label="닫기">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
        </svg>
      </button>
      <div class="sc-top">
        <span class="sc-date">${songDateLabel(s.date)}</span>
        ${s.event ? `<span class="sc-event">${esc(s.event)}</span>` : ""}
      </div>
      <div class="sc-meta">
        <span>${esc(getOptionLabel(s))}</span>
        <span class="sc-key">${keyModalHTML(s.key)}</span>
      </div>
      <h2 class="sc-title">${esc(s.title)}</h2>
      ${key ? `<div class="sc-player">${playerBarHTML(s)}</div>` : ""}
      ${imgUrl ? `<div class="sc-score"><img src="${esc(imgUrl)}" alt="악보"></div>` : ""}
    </div>`;

  const onKey = (ev) => {
    if (ev.key === "Escape") close();
  };
  const close = () => {
    overlay.remove();
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
    // 팝업 안에서 재생을 시작했다면 닫을 때 멈춤 (열기 전부터 재생 중이던 곡은 유지)
    if (key && !wasPlaying && currentKey === key && !player.paused) player.pause();
    if (opener && opener.focus) opener.focus();
  };

  // X 버튼 / 바깥(어두운 배경) 클릭 → 닫기
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay || ev.target.closest(".song-close")) close();
  });
  document.addEventListener("keydown", onKey);

  document.body.style.overflow = "hidden"; // 뒤 화면 스크롤 방지
  document.body.appendChild(overlay);
  overlay.querySelector(".song-close").focus();

  // 악보 이미지: 불러오면 원본 비율로 표시, 실패하면 안내 문구
  const scoreBox = overlay.querySelector(".sc-score");
  if (scoreBox) {
    const img = scoreBox.querySelector("img");
    const done = () => scoreBox.classList.add("loaded");
    const fail = () => {
      scoreBox.classList.add("failed");
      scoreBox.textContent = "악보를 불러오지 못했습니다.";
    };
    img.addEventListener("load", done);
    img.addEventListener("error", fail);
    if (img.complete) (img.naturalWidth ? done : fail)(); // 캐시에서 바로 불러온 경우
  }

  probeBars(); // 음원 길이/존재 여부 확인
  syncPlayButtons(); // 현재 재생 상태 반영
}

//
function getDriveImageUrl(url) {
  if (!url) return "";

  let fileId = url.trim();

  // https://drive.google.com/file/d/FILE_ID/view?usp=sharing 형식
  const pathMatch = fileId.match(/\/d\/([^/?#]+)/);
  // https://drive.google.com/open?id=FILE_ID or uc?id=FILE_ID 형식
  const queryMatch = fileId.match(/[?&]id=([^&]+)/);

  if (pathMatch) {
    fileId = pathMatch[1];
  } else if (queryMatch) {
    fileId = queryMatch[1];
  }
  // 둘 다 아니면 이미 파일 ID 자체가 들어온 것으로 간주

  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
}
