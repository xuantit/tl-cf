// Runs before the app/CSS paints. Keep the validated default in sync with useThemeStore.
(() => {
  let dark = true;
  try {
    const saved = JSON.parse(localStorage.getItem('app-theme') || 'null');
    if (typeof saved?.state?.dark === 'boolean') dark = saved.state.dark;
  } catch { /* Storage may be blocked or contain invalid JSON. */ }
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.documentElement.style.backgroundColor = dark ? '#191b24' : '#f3f4f8';
})();