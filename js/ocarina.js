// Google Sheets gviz JSON API로 데이터 가져오기
let SHEET_ID = "1LqUQ0cEDyys8JDrWDXfm7u33d7IAfMChdW7vksJ-i2U";

async function fetchSheetData() {
  try {
    const sheetName = "오카리나";

    // gviz JSON API 엔드포인트
    // const query = encodeURIComponent(`SELECT A, B, C, D, E, F, G, H`);
    const query = encodeURIComponent(`SELECT A, B, C, D, E, F, G`);
    // 필요한 열 선택 (A: 날짜, B: 장, C: 제목, D: 조성, E: 이벤트, F:파일명(하이퍼링크 표시텍스트), G: 실제 이미지 URL, H: 유튜브 링크(비공개 업로드))
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tq=${query}&sheet=${encodeURIComponent(sheetName)}`;

    console.log(sheetName, query, url);

    const response = await fetch(url);
    if (!response.ok) throw new Error("시트 데이터를 불러올 수 없습니다");

    const text = await response.text();
    // console.log("📦 응답 텍스트:", text.substring(0, 200));

    // gviz 응답에서 JSON 추출
    const jsonStr = text.match(/\{.*\}/s)[0];
    const data = JSON.parse(jsonStr);

    parseGvizData(data);
    // filterAndDisplay();
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

    // A: 날짜, B: 장, C: 제목, D: 조성, E: 이벤트, F:파일명(하이퍼링크 표시텍스트), G: 실제 이미지 URL, H: 유튜브 링크(비공개 업로드)
    const dateValue = cells[0]?.v;
    let option = cells[1]?.v;
    const title = cells[2]?.v;
    // const key = cells[3]?.v;
    // const event = cells[4]?.v;
    // const paper = cells[5]?.v; // 표시 파일명 (하이퍼링크 텍스트)
    // const paperUrl = cells[6]?.v; // 실제 이미지 URL (F열, 별도 텍스트로 입력)
    // const audioUrl = cells[7]?.v; // 유튜브 링크 (G열, 비공개 업로드된 영상 주소 또는 영상 ID)

    // Option 값 처리
    if (option) {
      if (option === "ccm" || option === "CCM") {
        option = ""; // ccm은 공백
      } else if (option.toString().startsWith("찬송가")) {
        // 찬송가로 시작하면 '찬'와 뒤의 숫자/값만 유지
        option = option.toString().replace(/^찬송가\s*/, "찬 ");
      }
    }

    // B열(제목) 또는 D열(이벤트)이 있으면 저장
    // if ((title || event) && currentDate && currentDateStr) {
    if (currentDate && currentDateStr) {
      allData.push({
        date: currentDate,
        dateStr: currentDateStr,
        title: title || "",
        option: option || "",
        // key: key || "",
        // event: event || "",
        // paper: paper || "",
        // paperUrl: paperUrl || "",
        // audioUrl: audioUrl || "",
      });
    }
  });

  console.log("📊 최종 파싱된 데이터:", allData);
}

fetchSheetData();
