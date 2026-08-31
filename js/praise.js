import { note, chevrons, paper } from "./utils/icons.js";

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent) ? true : false;
console.log(isMobile);

let SHEET_ID = "1-ILVOg2DyAmnuE127iSaUnnDcmbrpjjgcoRTs0vOTf0";
if (isMobile) SHEET_ID = "1LqUQ0cEDyys8JDrWDXfm7u33d7IAfMChdW7vksJ-i2U";
let currentDate = new Date(); // 오늘 날짜로 시작

const TEST_DATE = new Date(2026, 7, 29); // 테스트 날짜 (m+1)월
// currentDate = TEST_DATE;

currentDate.setHours(0, 0, 0, 0); // 시간 초기화

const REAL_TODAY = new Date(currentDate); // 실제 오늘 날짜 (월 이동 로직과 무관하게 고정)

// 이번달의 마지막 일요일이 지났으면(즉, 월요일부터는) 접속 시 다음달을 기본으로 보여줌
// 예: 8/30(일)이 8월의 마지막 일요일이면, 8/30까지는 8월이 보이고 8/31(월)부터는 9월이 보임
function getLastSundayOfMonth(year, month) {
  const lastDayOfMonth = new Date(year, month + 1, 0); // 해당 월의 마지막 날
  const lastDay = lastDayOfMonth.getDate();
  const dayOfWeek = lastDayOfMonth.getDay(); // 0: 일요일
  const lastSundayDate = lastDay - dayOfWeek; // 마지막 날에서 그 주 일요일까지 역산
  return new Date(year, month, lastSundayDate);
}

const lastSundayOfThisMonth = getLastSundayOfMonth(currentDate.getFullYear(), currentDate.getMonth());
if (currentDate > lastSundayOfThisMonth) {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
}

let allData = [];

// 현재 날짜 정보 표시
function updateCurrentInfo() {
  const today = REAL_TODAY;
  document.getElementById("current-info").textContent = `${today.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}`;
  // document.getElementById("current-info").textContent = `${today.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}`;
}

// 월 이동
function updateMonth(offset) {
  // 일(day)을 고정하지 않고 setMonth만 호출하면, 현재 일(day)이 이동할 달에 없는 경우
  // (예: 8/31 -> setMonth(9월)는 9월 31일이 없어 자동으로 10월로 넘어감) 문제가 생김.
  // 항상 1일로 이동시켜 이런 오버플로우를 방지.
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
  updateMonthDisplay();
  filterAndDisplay();
}

// 월 표시 업데이트
function updateMonthDisplay() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  // document.getElementById("month-display").textContent = `${year}년 ${month}월`;
  document.getElementById("month-display").innerHTML = `<span>${year}년</span><span style="margin-left: 12px;font-size: 20px;">${month}월</span>`;
  // document.getElementById("month-display").innerHTML = `<span style="font-size: 20px;">${month}월</span>`;

  // 이전/다음 버튼 활성화 여부
  const today = new Date();

  // 이전 버튼: 1월까지만 이동 가능
  document.getElementById("prev-month").disabled = currentDate.getFullYear() < today.getFullYear() || (currentDate.getFullYear() === today.getFullYear() && currentDate.getMonth() < 1);

  // 다음 버튼: 현재월 +1까지만 이동 가능
  const nextLimit = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  document.getElementById("next-month").disabled = currentDate >= nextLimit;
}

// Date 객체를 YYYY-MM-DD 문자열로 변환
function dateToString(dateObj) {
  if (!dateObj) return null;

  // Date 객체인 경우
  if (dateObj instanceof Date) {
    // console.log("Date 객체인 날짜:", dateObj);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // 문자열인 경우 - gviz Date() 형식 처리
  if (typeof dateObj === "string") {
    // console.log("문자열 날짜:", dateObj);

    // gviz Date(year, month, day) 형식 처리
    const dateMatch = dateObj.match(/Date\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (dateMatch) {
      const year = dateMatch[1];
      const month = String(Number(dateMatch[2]) + 1).padStart(2, "0"); // JS Date 방식: 월이 0부터
      const day = String(dateMatch[3]).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    // 이미 YYYY-MM-DD 형식인 경우
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateObj)) {
      return dateObj;
    }
  }

  return null;
}

// Google Sheets gviz JSON API로 데이터 가져오기
async function fetchSheetData() {
  try {
    const year = new Date().getFullYear();
    const sheetName = year.toString();

    // gviz JSON API 엔드포인트
    const query = encodeURIComponent(`SELECT A, B, C, D, E, F, G`);
    // 필요한 열 선택 (A: 날짜, B: 제목, C: 옵션, D: 이벤트, E: 파일명(하이퍼링크 표시텍스트), F: 실제 이미지 URL, G: 유튜브 링크(비공개 업로드))
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tq=${query}&sheet=${sheetName}`;

    // console.log("📡 요청 정보:");
    // console.log("SHEET_ID:", SHEET_ID);
    // console.log("시트 이름:", sheetName);
    // console.log("URL:", url);

    const response = await fetch(url);
    if (!response.ok) throw new Error("시트 데이터를 불러올 수 없습니다");

    const text = await response.text();
    // console.log("📦 응답 텍스트:", text.substring(0, 200));

    // gviz 응답에서 JSON 추출
    const jsonStr = text.match(/\{.*\}/s)[0];
    const data = JSON.parse(jsonStr);

    // console.log("✅ 파싱된 데이터 구조:");
    // console.log("- 행 개수:", data.table?.rows?.length);
    // console.log(
    //   "- 열 정보:",
    //   data.table?.cols?.map((col) => col.label),
    // );
    // console.log("- 첫 번째 행:", data.table?.rows?.[0]);

    parseGvizData(data);
    filterAndDisplay();
  } catch (error) {
    console.error("❌ 에러:", error);
    showError("시트 데이터를 불러오지 못했습니다: " + error.message);
  }
}

// gviz JSON 파싱
function parseGvizData(data) {
  allData = [];

  if (!data.table || !data.table.rows) {
    console.warn("테이블 데이터가 없습니다");
    return;
  }

  let currentDate = null;
  let currentDateStr = null;
  let currentEvent = null;

  data.table.rows.forEach((row, index) => {
    const cells = row.c;
    if (!cells || cells.length < 2) return;

    const dateValue = cells[0]?.v;
    const title = cells[1]?.v;
    let option = cells[2]?.v;
    const event = cells[3]?.v;
    const paper = cells[4]?.v; // 표시 파일명 (하이퍼링크 텍스트)
    const paperUrl = cells[5]?.v; // 실제 이미지 URL (F열, 별도 텍스트로 입력)
    const audioUrl = cells[6]?.v; // 유튜브 링크 (G열, 비공개 업로드된 영상 주소 또는 영상 ID)
    // A열(날짜)이 있으면 currentDate 업데이트
    if (dateValue) {
      currentDateStr = dateToString(dateValue);
      if (currentDateStr && /^\d{4}-\d{2}-\d{2}$/.test(currentDateStr)) {
        currentDate = new Date(currentDateStr + "T00:00:00");
      }
    }

    // Option 값 처리
    if (option) {
      if (option === "ccm" || option === "CCM") {
        option = ""; // ccm은 공백
      } else if (option.toString().startsWith("찬송가")) {
        // 찬송가로 시작하면 '찬'와 뒤의 숫자/값만 유지
        option = option.toString().replace(/^찬송가\s*/, "찬 ");
      }
    }

    // Event 값 처리 - 줄바꿈 제거 후 첫 줄만 유지
    // if (event) {
    //   console.log(event);
    //   event = event.toString().split("\n")[0];
    //   console.log(event);
    // }

    // B열(제목) 또는 D열(이벤트)이 있으면 저장
    // if ((title || event) && currentDate && currentDateStr) {
    if (currentDate && currentDateStr) {
      allData.push({
        date: currentDate,
        dateStr: currentDateStr,
        title: title || "",
        option: option || "",
        event: event || "",
        paper: paper || "",
        paperUrl: paperUrl || "",
        audioUrl: audioUrl || "",
      });
    }
  });

  // console.log("📊 최종 파싱된 데이터:", allData);
}

// 일정 표시
function displaySchedule(data) {
  const container = document.getElementById("schedule-container");
  const now = new Date();
  const cutoffTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0, 0); // 오늘 오후 3시

  // 현재 시간 기준 이번주 범위 계산 (월요일 00시 ~ 다음주 월요일 00시 직전, 즉 일요일까지)
  const weekStart = getWeekStart(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7); // 다음주 월요일 00시 (여기 미만까지 이번주)

  // 현재 보고 있는 월이 '이번달'인지 여부 (past/close는 이번달에서만 적용)
  const isCurrentMonthView = currentDate.getFullYear() === now.getFullYear() && currentDate.getMonth() === now.getMonth();

  if (data.length === 0) {
    container.innerHTML = '<div class="empty">이 달의 일정이 없습니다.</div>';
    return;
  }

  container.innerHTML = data
    .map((item, index) => {
      // 이번주 범위에 있는지 확인
      const isThisWeek = item.date >= weekStart && item.date < weekEnd;
      const isPast = isCurrentMonthView && item.date < cutoffTime;
      const dateDisplay = item.date.toLocaleDateString("ko-KR", {
        month: "short",
        day: "numeric",
        weekday: "short",
      });
      // 제목과 옵션을 쌍으로 표시
      let itemsHtml = item.items
        .map(
          (pair) => `
            <li>
              <div class="title">${pair.title}</div>
              ${pair.option ? `<div class="option">${pair.option}</div>` : ""}
              <button class="paper" data-image="${pair.paperUrl}" data-filename="${pair.paper || ""}" ${!pair.paperUrl ? "disabled" : ""}>
                <img src="./image/paper.svg" alt="paper" class="paper-icon">
                악보
              </button>
              <button class="play" data-audio="${pair.audioUrl || ""}" ${!pair.audioUrl ? "disabled" : ""}>
                <img src="./image/youtube.svg" alt="youtube" class="play-icon">
                <span class="play-label">듣기</span>
              </button>
            </li>
          `,
        )
        .join("");

      // title이 모두 비어있으면 blank 클래스 추가
      if (item.items.every((pair) => !pair.title)) {
        // event에 '없음' 또는 '코이노니아'가 포함되어 있는지 확인
        const hasNoSchedule = item.items.some((pair) => pair.event && (pair.event.includes("없음") || pair.event.includes("코이노니아")));

        const blankText = hasNoSchedule ? "이 주는 오후 예배가 없습니다" : "아직 찬양이 정해지지 않았습니다.";

        itemsHtml = `
          <div>
            <div class="title blank">${blankText}</div>
          </div>
        `;
      }

      // 이벤트 표시 (title이 없어도 표시)
      const eventHtml = item.items
        .filter((pair) => pair.event)
        .map((pair) => {
          const firstLine = pair.event.split("\n")[0]; // 첫 번째 줄만 추출
          return `
            <div>
              <div class="event" style="font-size: 14px; color: #ff6b6b; font-weight: 500;">${firstLine}</div>
            </div>
          `;
        })
        .join("");

      // past 클래스가 있으면 close 클래스도 추가
      const closeClass = isPast ? "close" : "";

      // event에 '없음' 혹은 '코이노니아'가 포함되어 있으면 absence 클래스 추가
      const hasAbsence = item.items.some((pair) => pair.event && (pair.event.includes("없음") || pair.event.includes("코이노니아")));
      const absenceClass = hasAbsence ? "absence" : "";

      return `
        <div class="schedule-item ${isThisWeek ? "this-week" : ""} ${isPast ? "past" : ""} ${closeClass} ${absenceClass}" data-index="${index}">
          <div>
            <div class="date ${isThisWeek ? "this-week" : ""}">
              ${dateDisplay}
              ${note}
            </div>
            ${eventHtml}
          </div>
          <ul>
            ${itemsHtml}
          </ul>
          <p class="chevrons">${chevrons}</p>
        </div>
      `;
    })
    .join("");

  // 카드 클릭 이벤트 리스너 추가
  document.querySelectorAll(".schedule-item").forEach((item) => {
    item.addEventListener("click", function (e) {
      // ul 내부 클릭이면 아무 동작도 하지 않음 (schedule-item 토글 이벤트 무시)
      if (e.target.closest("ul")) return;

      // 클릭 전파 방지 (필요시)
      e.stopPropagation();
      this.classList.toggle("close");
    });
  });

  document.getElementById("loading").style.display = "none";
}

function getWeekStart(date) {
  const now = new Date(date);

  const dayOfWeek = now.getDay(); // 0: 일요일, 1: 월요일, ... 6: 토요일

  // 이번주 월요일 00시 계산 (월요일 ~ 일요일이 한 주)
  // 일요일(0)이면 6일 전, 월요일(1)이면 0일 전, ... 토요일(6)이면 5일 전이 월요일
  const diffToMonday = (dayOfWeek + 6) % 7;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
  weekStart.setHours(0, 0, 0, 0);

  // console.log(now.getDate(), dayOfWeek, "📅", weekStart.getDate());

  return weekStart;
}

// 현재 월의 데이터 필터링 및 표시
function filterAndDisplay() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const weekStart = getWeekStart(new Date());

  // console.log(allData);

  const hasUpcoming = allData.some((item) => {
    // console.log(item);
    const itemDate = item.date;
    return itemDate.getFullYear() === year && itemDate.getMonth() + 1 === month && itemDate >= weekStart;
  });
  // console.log(weekStart.getDate(), currentDate.getDate(), hasUpcoming);

  const groupedData = {};

  allData.forEach((item) => {
    const itemMonth = item.date.getMonth() + 1;
    const itemYear = item.date.getFullYear();

    if (itemYear === year && itemMonth === month) {
      if (!groupedData[item.dateStr]) {
        groupedData[item.dateStr] = {
          date: item.date,
          dateStr: item.dateStr,
          items: [],
        };
      }
      groupedData[item.dateStr].items.push({
        title: item.title,
        option: item.option,
        event: item.event,
        paper: item.paper,
        paperUrl: item.paperUrl,
        audioUrl: item.audioUrl,
      });
    }
  });

  const filteredData = Object.values(groupedData).sort((a, b) => a.date - b.date);

  displaySchedule(filteredData);
}

// 에러 표시
function showError(message) {
  document.getElementById("error-container").innerHTML = `<div class="error">⚠️ ${message}</div>`;
  document.getElementById("loading").style.display = "none";
}

function formatDateString(str) {
  const match = str.match(/Date\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return str;

  const year = Number(match[1]);
  const month = Number(match[2]) + 1; // ⚠️ JS Date 방식이면 +1
  const day = Number(match[3]);

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  return `${year}-${mm}-${dd}`;
}

// 초기화
updateCurrentInfo();
updateMonthDisplay();
document.getElementById("prev-month").addEventListener("click", () => updateMonth(-1));
document.getElementById("next-month").addEventListener("click", () => updateMonth(1));

// "이미지 보기" 버튼 클릭 시 이미지 오버레이 표시
// ⚠️ 캡처(capture) 단계에서 등록해야 함: .schedule-item의 클릭 리스너가
// 버블링 단계에서 먼저 실행되어 버리기 때문에, 그보다 먼저 이벤트를 가로채서 stopPropagation 해야 함
document.addEventListener(
  "click",
  (e) => {
    const button = e.target.closest(".paper");
    if (!button) return;

    e.stopPropagation();

    const overlay = document.createElement("div");
    overlay.className = "image-overlay";
    const imageUrl = getDriveImageUrl(button.dataset.image);
    const fileName = button.dataset.filename || "";
    overlay.innerHTML = `
      <img src="${imageUrl}" alt="${fileName}">
    `;

    overlay.addEventListener("click", () => overlay.remove());
    document.body.appendChild(overlay);
  },
  true,
);

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

// 유튜브 링크(또는 영상 ID)에서 영상 ID만 추출
// 지원 형식: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/shorts/ID, 영상 ID 자체
function extractYoutubeId(url) {
  if (!url) return "";

  const raw = url.trim();

  // 이미 11자리 영상 ID만 들어온 경우
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

  const patterns = [/[?&]v=([A-Za-z0-9_-]{11})/, /youtu\.be\/([A-Za-z0-9_-]{11})/, /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/, /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return match[1];
  }

  return "";
}

// 재생 상태 관리
let currentPlayerOverlay = null; // 유튜브 플레이어 팝업
let currentPlayButton = null; // 현재 재생 중인 버튼

function closePlayerOverlay() {
  if (currentPlayerOverlay) {
    currentPlayerOverlay.remove();
    currentPlayerOverlay = null;
  }
  if (currentPlayButton) {
    currentPlayButton.classList.remove("playing");
    currentPlayButton = null;
  }
}

// "듣기" 버튼 클릭 시 데이터 사용 경고 확인창을 먼저 띄우고, 확인 시에만 유튜브 팝업 재생
document.addEventListener(
  "click",
  (e) => {
    const button = e.target.closest(".play");
    if (!button || button.disabled) return;

    e.stopPropagation();

    const rawUrl = button.dataset.audio;
    if (!rawUrl) return;

    // 같은 버튼을 다시 누르면 닫기
    if (currentPlayButton === button) {
      closePlayerOverlay();
      return;
    }

    // 다른 항목이 재생 중이면 먼저 닫기
    closePlayerOverlay();

    const videoId = extractYoutubeId(rawUrl);
    if (!videoId) {
      showError("유튜브 영상 주소를 확인할 수 없습니다.");
      return;
    }

    showPlayConfirm(videoId, button);
  },
  true,
);

// 재생 전 데이터 사용 경고 확인창
function showPlayConfirm(videoId, button) {
  const confirmOverlay = document.createElement("div");
  confirmOverlay.className = "image-overlay confirm-overlay";
  confirmOverlay.innerHTML = `
    <div class="confirm-box" style="background:#fff; border-radius:12px; padding:24px; max-width:280px; text-align:center;">
      <p style="margin:0 0 20px; font-size:14px; line-height:1.5; color:#333;">유튜브 영상이 재생됩니다.<br>데이터 사용에 주의해주세요.</p>
      <div style="display:flex; gap:8px; justify-content:center;">
        <button type="button" class="confirm-cancel" style="flex:1; padding:10px 0; border:1px solid #ddd; border-radius:8px; background:#fff; cursor:pointer;">취소</button>
        <button type="button" class="confirm-ok" style="flex:1; padding:10px 0; border:none; border-radius:8px; background:#333; color:#fff; cursor:pointer;">확인</button>
      </div>
    </div>
  `;

  confirmOverlay.addEventListener("click", (ev) => {
    ev.stopPropagation();

    if (ev.target.closest(".confirm-ok")) {
      confirmOverlay.remove();
      openPlayerOverlay(videoId, button);
      return;
    }

    // 취소 버튼이거나 바깥(배경) 클릭 시 닫기
    if (ev.target.closest(".confirm-cancel") || !ev.target.closest(".confirm-box")) {
      confirmOverlay.remove();
    }
  });

  document.body.appendChild(confirmOverlay);
}

// 실제 유튜브 팝업 플레이어 열기
function openPlayerOverlay(videoId, button) {
  const overlay = document.createElement("div");
  overlay.className = "image-overlay audio-overlay";
  overlay.innerHTML = `
    <div class="audio-player-box" style="width:320px; max-width:90vw;">
      <iframe
        src="https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1"
        width="320"
        height="180"
        style="border:none; border-radius:8px; display:block;"
        allow="autoplay; encrypted-media"
        allowfullscreen
      ></iframe>
    </div>
  `;

  overlay.addEventListener("click", (ev) => {
    // 플레이어(iframe) 자체 클릭은 닫히지 않도록
    if (ev.target.closest(".audio-player-box")) return;
    closePlayerOverlay();
  });

  document.body.appendChild(overlay);
  currentPlayerOverlay = overlay;
  currentPlayButton = button;
  button.classList.add("playing");
}

fetchSheetData();
