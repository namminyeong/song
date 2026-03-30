function formatKoreanDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return `${year}년 ${month}월 ${day}일`;
}

document.addEventListener("DOMContentLoaded", () => {
  const todayEl = document.getElementById("today-date");
  const today = new Date();

  todayEl.textContent = formatKoreanDate(today);
});
