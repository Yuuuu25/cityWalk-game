/* 提前应用季节，避免首屏闪烁（默认取当前日期所在季节） */
(function () {
  try {
    var m = new Date().getMonth() + 1;
    var s = (m >= 3 && m <= 5) ? 'spring'
          : (m >= 6 && m <= 8) ? 'summer'
          : (m >= 9 && m <= 11) ? 'autumn'
          : 'winter';
    document.documentElement.setAttribute('data-season', s);
  } catch (e) {}
})();
