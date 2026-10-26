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
// A: 날짜, B: 장, C: 제목, D: 조성, E: 이벤트, F: 파일명, G: 이미지 URL, H: 유튜브 링크
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
  requestGviz(`SELECT A, B, C, D, E, F, G, H WHERE A >= date '${rangeStart}' AND A < date '${rangeEnd}'`)
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
    const data = await requestGviz(`SELECT A, B, C, D, E, F, G, H`);
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

    // A: 날짜, B: 장, C: 제목, D: 조성, E: 이벤트, F: 파일명, G: 이미지 URL, H: 유튜브 링크
    let option = cells[1]?.v;
    const title = cells[2]?.v;
    const key = cells[3]?.v;
    const event = cells[4]?.v;
    const imageUrl = cells[6]?.v;
    const youtubeUrl = cells[7]?.v;
    console.log(title, key, event, imageUrl);

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
      key: key || "",
      event: event || "",
      imageUrl: imageUrl || "",
      youtubeUrl: youtubeUrl ? String(youtubeUrl).trim() : "",
    });
  });

  allData.sort((a, b) => a.date - b.date);
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

  // 4) 오늘
  if (t.getTime() === base.getTime()) return "오늘";

  // 1) 다음달 (12월 → 1월처럼 연도가 넘어가는 경우도 처리)
  const monthDiff = (t.getFullYear() - base.getFullYear()) * 12 + (t.getMonth() - base.getMonth());
  if (monthDiff >= 1) return "다음달";

  // 2), 3) 같은 달: 7일 이상이면 다음주, 미만이면 이번주
  const dayDiff = Math.round((t - base) / 86400000);
  return dayDiff >= 7 ? "다음주" : "이번주";
}

// 이번주 영역: 오늘과 가장 가까운 날짜 → 월/일/요일
function renderThisWeek() {
  const body = document.getElementById("thisWeekBody");
  const pill = document.getElementById("pill");
  const songs = allData.filter((d) => d.dateStr === closestDateStr);

  if (!songs.length) {
    body.innerHTML = `<p class="empty-this-week">표시할 일정이 없습니다.</p>`;
    return;
  }

  const d = songs[0].date;
  pill.textContent = getPillLabel(d); // ← 추가
  const label = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;

  body.innerHTML = songs
    .map((s) => {
      const ytUrl = getSafeYoutubeUrl(s.youtubeUrl);
      return `
      <div class="song">
        <div class="this-week-meta">
          <span>${label}</span>
          <span>${esc(s.event)}</span>
        </div>
        <div class="wrap-this-week-title">
          <h2 class="this-week-title">${esc(s.title)}</h2>
          <p class="key ${esc(s.key)}"></p>
        </div>
        <div class="this-week-foot">
          <span class="jang">${esc(s.option)}</span>
          <div class="btns">
            <button class="paper" data-image="${s.imageUrl}" data-filename="" ${!s.imageUrl ? "disabled" : ""}>
              <span alt="paper" class="paper-icon"></span>
              <span class="paper-label">악보</span>
            </button>
            <button class="play" data-youtube="${esc(ytUrl)}" ${!ytUrl ? "disabled" : ""}>
              <img src="./image/youtube.svg" alt="youtube" class="play-icon">
              <span class="play-label">듣기</span>
            </button>
          </div>
        </div>
      </div>`;
    })
    .join("");
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

// 리스트 한 줄 (좌측엔 일만 표시)
function itemHTML(s, colorIdx) {
  const cur = s.dateStr === closestDateStr ? " cur" : "";
  return `
    <div class="item${cur}">
      <span class="day c${colorIdx % 5}">${s.date.getDate()}</span>
      <div class="txt">
        <b>${esc(s.title)}</b>
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
}

// 오늘 날짜 표시
function updateCurrentInfo() {
  document.getElementById("today").textContent = today.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/* ---------- 실행 ---------- */
showLoading(); // 진입 즉시 로딩 팝업 표시
updateCurrentInfo();
bindEvents();
renderMonthChips();
fetchSheetData();

// 악보 버튼 클릭 시 이미지 팝업 표시
// 캡처 단계에서 등록: 다른 클릭 리스너보다 먼저 가로채기 위함
document.addEventListener(
  "click",
  (e) => {
    const button = e.target.closest(".paper");
    if (!button || button.disabled) return;

    e.stopPropagation();

    const imageUrl = getDriveImageUrl(button.dataset.image);
    if (!imageUrl) return;

    const overlay = document.createElement("div");
    overlay.className = "image-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="image-popup">
        <button type="button" class="image-close" aria-label="닫기">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
          </svg>
        </button>
        <img src="${esc(imageUrl)}" alt="악보">
      </div>`;

    const onKey = (ev) => {
      if (ev.key === "Escape") close();
    };
    const close = () => {
      overlay.remove();
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };

    // X 버튼 클릭 → 닫기
    overlay.querySelector(".image-close").addEventListener("click", close);
    // 팝업 바깥(어두운 배경) 클릭 → 닫기
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) close();
    });
    // ESC 키 → 닫기
    document.addEventListener("keydown", onKey);

    document.body.style.overflow = "hidden"; // 뒤 화면 스크롤 방지
    document.body.appendChild(overlay);
  },
  true,
);

// 유튜브 링크 검증: http(s) + 유튜브 도메인만 허용 (javascript: 등 차단)
// 영상 ID(11자리)만 들어온 경우 watch 주소로 변환, 유효하지 않으면 "" 반환
function getSafeYoutubeUrl(raw) {
  if (!raw) return "";
  const str = String(raw).trim();

  if (/^[A-Za-z0-9_-]{11}$/.test(str)) return `https://www.youtube.com/watch?v=${str}`;

  try {
    const u = new URL(str.startsWith("//") ? `https:${str}` : /^https?:\/\//i.test(str) ? str : `https://${str}`);
    const host = u.hostname.toLowerCase();
    const ok = host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
    if (!ok || !/^https?:$/.test(u.protocol)) return "";
    return u.href;
  } catch {
    return "";
  }
}

// "듣기" 버튼 클릭 → 이동 안내 팝업 → 확인 시 유튜브로 이동
document.addEventListener(
  "click",
  (e) => {
    const button = e.target.closest(".play");
    if (!button || button.disabled) return;

    e.stopPropagation();

    const url = getSafeYoutubeUrl(button.dataset.youtube);
    if (!url) return;

    showYoutubeConfirm(url);
  },
  true,
);

function showYoutubeConfirm(url) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="box confirm">
      <p>유튜브 링크로 이동합니다.<br>데이터 사용에 주의해주세요.</p>
      <div class="row">
        <button type="button" class="confirm-cancel">취소</button>
        <button type="button" class="confirm-ok ok">확인</button>
      </div>
    </div>`;

  const onKey = (ev) => {
    if (ev.key === "Escape") close();
  };
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };

  overlay.addEventListener("click", (ev) => {
    ev.stopPropagation();

    if (ev.target.closest(".confirm-ok")) {
      close();
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    // 취소 버튼이거나 바깥(배경) 클릭 시 닫기
    if (ev.target.closest(".confirm-cancel") || !ev.target.closest(".box")) {
      close();
    }
  });

  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
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
