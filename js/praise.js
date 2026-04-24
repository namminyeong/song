const SHEET_ID = "1-ILVOg2DyAmnuE127iSaUnnDcmbrpjjgcoRTs0vOTf0";
// const SHEET_ID = "1LqUQ0cEDyys8JDrWDXfm7u33d7IAfMChdW7vksJ-i2U";

let currentDate = new Date(); // 오늘 날짜로 시작
currentDate.setHours(0, 0, 0, 0); // 시간 초기화
let allData = [];

// 현재 날짜 정보 표시
function updateCurrentInfo() {
  const today = new Date();
  document.getElementById("current-info").textContent = `오늘: ${today.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}`;
}

// 월 이동
function updateMonth(offset) {
  currentDate.setMonth(currentDate.getMonth() + offset);
  updateMonthDisplay();
  filterAndDisplay();
}

// 월 표시 업데이트
function updateMonthDisplay() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  document.getElementById("month-display").textContent = `${year}년 ${month}월`;

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
    const query = encodeURIComponent(`SELECT A, B, C, D`); // 필요한 열 선택 (A: 날짜, B: 제목, C: 옵션, D: 이벤트)
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

    // A열(날짜)이 있으면 currentDate 업데이트
    if (dateValue) {
      currentDateStr = dateToString(dateValue);
      if (currentDateStr && /^\d{4}-\d{2}-\d{2}$/.test(currentDateStr)) {
        currentDate = new Date(currentDateStr + "T00:00:00");
      }
    }

    // Option 값 처리
    if (option) {
      if (option === "ccm") {
        option = ""; // ccm은 공백
      } else if (option.toString().startsWith("찬송가")) {
        // 찬송가로 시작하면 '찬'와 뒤의 숫자/값만 유지
        option = option.toString().replace(/^찬송가\s*/, "찬 ");
      }
    }

    // B열(제목) 또는 D열(이벤트)이 있으면 저장
    if ((title || event) && currentDate && currentDateStr) {
      allData.push({
        date: currentDate,
        dateStr: currentDateStr,
        title: title || "",
        option: option || "",
        event: event || "",
      });
    }
  });

  console.log("📊 최종 파싱된 데이터:", allData);
}

// 일정 표시
function displaySchedule(data) {
  const container = document.getElementById("schedule-container");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const now = new Date();
  const cutoffTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0, 0); // 오늘 오후 3시

  if (data.length === 0) {
    container.innerHTML = '<div class="empty">이 달의 일정이 없습니다.</div>';
    return;
  }

  container.innerHTML = data
    .map((item) => {
      const isToday = item.date.getTime() === today.getTime();
      const isPast = item.date < cutoffTime;
      const dateDisplay = item.date.toLocaleDateString("ko-KR", {
        month: "short",
        day: "numeric",
        weekday: "short",
      });

      // 제목과 옵션을 쌍으로 표시
      const itemsHtml = item.items
        .map(
          (pair) => `
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
    <div class="title">${pair.title}</div>
    ${pair.option ? `<div class="option">${pair.option}</div>` : ""}
  </div>
`,
        )
        .join("");

      // 이벤트 표시 (title이 없어도 표시)
      const eventHtml = item.items
        .filter((pair) => pair.event)
        .map(
          (pair) => `
  <div style="margin-bottom: 8px;">
    <div class="event" style="font-size: 14px; color: #ff6b6b; font-weight: 500;">${pair.event}</div>
  </div>
`,
        )
        .join("");

      return `
<div class="schedule-item ${isToday ? "today" : ""} ${isPast ? "past" : ""}">
  <div style="display: flex; justify-content: space-between; align-items: center;">
    <div class="date ${isToday ? "today" : ""}">${dateDisplay}</div>
    ${eventHtml}
  </div>
    ${itemsHtml}
</div>
`;
    })
    .join("");

  document.getElementById("loading").style.display = "none";
}

// 현재 월의 데이터 필터링 및 표시
function filterAndDisplay() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

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

fetchSheetData();
