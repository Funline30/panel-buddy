document.querySelectorAll('[data-copy]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var el = document.getElementById(btn.getAttribute('data-copy'));
    var text = el.textContent;
    function done() {
      btn.textContent = 'Copied ✓';
      setTimeout(function () { btn.textContent = 'Copy rules'; }, 2000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
    function fallback() {
      var r = document.createRange();
      r.selectNodeContents(el);
      var s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = 'Text selected - tap Copy'; }
    }
  });
});
