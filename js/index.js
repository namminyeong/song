function formatKoreanDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return `${year}년 ${month}월 ${day}일`;
}

document.addEventListener("DOMContentLoaded", () => {
  const today = new Date();
  
  // 오늘 날짜
  document.getElementById("today-date").textContent = formatKoreanDate(today);

  // 현재 월
  document.getElementById("this-month").textContent = `${today.getMonth() + 1}월`;
});
