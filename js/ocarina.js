// Google Sheets gviz JSON API로 데이터 가져오기
const SHEET_ID = "1LqUQ0cEDyys8JDrWDXfm7u33d7IAfMChdW7vksJ-i2U";
const SHEET_NAME = "오카리나";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

let allData = [];
let currentView = "month"; // "month" | "all"
const today = new Date();
let selectedMonth = today.getMonth() + 1;
const THIS_YEAR = today.getFullYear();
const YEARS = [2024, 2025, 2026, 2027];
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
async function fetchSheetData() {
  showLoading();
  try {
    // A: 날짜, B: 장, C: 제목, D: 조성, E: 이벤트, F: 파일명, G: 이미지 URL
    const query = encodeURIComponent(`SELECT A, B, C, D, E, F, G`);
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tq=${query}&sheet=${encodeURIComponent(SHEET_NAME)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error("시트 데이터를 불러올 수 없습니다");

    const text = await response.text();
    const jsonStr = text.match(/\{.*\}/s)[0];
    const data = JSON.parse(jsonStr);

    parseGvizData(data);
    renderAll();
  } catch (error) {
    console.error("❌ 에러:", error);
    showError("시트 데이터를 불러오지 못했습니다: " + error.message);
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

  let currentDate = null; // 날짜 칸이 비어 있으면 위 행의 날짜를 이어 사용

  data.table.rows.forEach((row) => {
    const cells = row.c;
    if (!cells || cells.length < 2) return;

    const parsed = parseDateCell(cells[0]);
    if (parsed) currentDate = parsed;

    let option = cells[1]?.v;
    const title = cells[2]?.v;

    // 장 값 처리
    if (option) {
      option = String(option).trim();
      if (option.toLowerCase() === "ccm") {
        option = ""; // ccm은 공백
      } else if (option.startsWith("찬송가")) {
        option = option.replace(/^찬송가\s*/, "찬 ");
      }
    }

    if (!currentDate || !title) return;

    allData.push({
      date: new Date(currentDate),
      dateStr: toDateStr(currentDate),
      title: String(title).trim(),
      option: option || "",
    });
  });

  allData.sort((a, b) => a.date - b.date);
  closestDateStr = findClosestDateStr();
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
  renderMonthChips();
  renderList();
}

// 이번주 영역: 오늘과 가장 가까운 날짜 → 월/일/요일
function renderThisWeek() {
  const body = document.getElementById("thisWeekBody");
  const songs = allData.filter((d) => d.dateStr === closestDateStr);

  if (!songs.length) {
    body.innerHTML = `<p class="empty-this-week">표시할 일정이 없습니다.</p>`;
    return;
  }

  const d = songs[0].date;
  const label = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;

  body.innerHTML = songs
    .map(
      (s) => `
      <div class="song">
        <div class="this-week-meta"><span>${label}</span></div>
        <h2 class="this-week-title">${esc(s.title)}</h2>
        <div class="this-week-foot"><span class="jang">${esc(s.option)}</span></div>
      </div>`,
    )
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
        ${s.option ? `<small>${esc(s.option)}</small>` : ""}
      </div>
    </div>`;
}

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
  nav.innerHTML = `<ul class="months-chips" id="yearChips" style="grid-template-columns: repeat(${YEARS.length}, 1fr)">
    ${YEARS.map((y) => `<li class="chip" data-year="${y}">${y}</li>`).join("")}
  </ul>`;
  document.getElementById("months").after(nav);
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
