document.querySelectorAll('.copy-btn').forEach((button) => {
  const cmd = button.dataset.cmd;
  let resetTimer;
  button.addEventListener('click', () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(cmd).catch(() => {});
    }
    button.textContent = '[copied]';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      button.textContent = '[copy]';
    }, 1400);
  });
});
