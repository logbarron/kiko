(function () {
  var storageKey = 'guest-theme';
  var toggle = document.querySelector('[data-theme-toggle]');
  var logo = document.querySelector('[data-theme-logo]');
  var body = document.body;

  if (!toggle || !logo || !body) {
    return;
  }

  var manualPreference = null;

  try {
    var stored = window.localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark') {
      manualPreference = stored;
    }
  } catch (error) {
    manualPreference = null;
  }

  var media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function getSystemTheme() {
    if (!media) {
      return 'light';
    }
    return media.matches ? 'dark' : 'light';
  }

  function getActiveTheme() {
    return manualPreference || getSystemTheme();
  }

  function persistPreference() {
    try {
      if (manualPreference) {
        window.localStorage.setItem(storageKey, manualPreference);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch (error) {
      // Ignore storage failures
    }
  }

  function dispatchThemeEvent(theme) {
    var detail = { theme: theme, manual: manualPreference !== null };
    var themeEvent;
    try {
      themeEvent = new CustomEvent('themechange', { detail: detail });
    } catch (error) {
      themeEvent = document.createEvent('CustomEvent');
      themeEvent.initCustomEvent('themechange', true, true, detail);
    }
    window.dispatchEvent(themeEvent);
  }

  function updateToggleState(theme) {
    var isDark = theme === 'dark';
    toggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  function swapLogo(theme) {
    var nextSrc = theme === 'dark' ? logo.getAttribute('data-dark-src') : logo.getAttribute('data-light-src');
    if (!nextSrc || logo.getAttribute('src') === nextSrc) {
      return;
    }

    var handleLoad = function () {
      logo.classList.remove('logo-switching');
      logo.removeEventListener('load', handleLoad);
    };

    logo.classList.add('logo-switching');
    logo.addEventListener('load', handleLoad);
    logo.setAttribute('src', nextSrc);
  }

  function applyTheme(theme) {
    body.setAttribute('data-theme', theme);
    body.setAttribute('data-theme-manual', manualPreference !== null ? 'true' : 'false');
    updateToggleState(theme);
    swapLogo(theme);
    dispatchThemeEvent(theme);
  }

  applyTheme(getActiveTheme());

  if (media) {
    var handleChange = function (event) {
      if (manualPreference !== null) {
        return;
      }
      applyTheme(event.matches ? 'dark' : 'light');
    };

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange);
    } else if (typeof media.addListener === 'function') {
      media.addListener(handleChange);
    }
  }

  toggle.addEventListener('click', function () {
    var currentTheme = getActiveTheme();
    var nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    var systemTheme = getSystemTheme();
    manualPreference = nextTheme === systemTheme ? null : nextTheme;
    persistPreference();
    applyTheme(nextTheme);
  });
})();
