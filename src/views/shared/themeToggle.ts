export interface ThemeScriptOptions {
  storageKey?: string;
  customEventName?: string;
  target?: 'body' | 'documentElement';
}

export function renderThemeToggle(): string {
  return [
    '<button type="button" class="theme-toggle" data-theme-toggle aria-pressed="false">',
    '  <span class="sr-only">Toggle color scheme</span>',
    renderSunIcon(),
    renderMoonIcon(),
    '</button>'
  ].join('\n');
}

export function renderThemeScript(nonce: string | undefined, options: ThemeScriptOptions = {}): string {
  const storageKey = options.storageKey ? options.storageKey.replace(/'/g, "\\'") : 'guest-theme';
  const eventName = options.customEventName ? options.customEventName.replace(/'/g, "\\'") : 'themechange';
  const target = options.target === 'documentElement' ? 'documentElement' : 'body';

  return `<script${nonce ? ` nonce="${nonce}"` : ''}>
(function () {
  var root = document.${target};
  if (!root) {
    return;
  }

  var toggles = Array.prototype.slice.call(document.querySelectorAll('[data-theme-toggle]'));
  if (toggles.length === 0) {
    return;
  }

  var storageKey = '${storageKey}';
  var eventName = '${eventName}';
  var manualPreference = null;

  try {
    var stored = window.localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark') {
      manualPreference = stored;
    }
  } catch (error) {}

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

  function updateToggleState(theme) {
    var isDark = theme === 'dark';
    toggles.forEach(function (toggle) {
      toggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    });
  }

  function dispatchThemeEvent(theme) {
    var detail = { theme: theme, manual: manualPreference !== null };
    var themeEvent;
    try {
      themeEvent = new CustomEvent(eventName, { detail: detail });
    } catch (error) {
      themeEvent = document.createEvent('CustomEvent');
      themeEvent.initCustomEvent(eventName, true, true, detail);
    }
    window.dispatchEvent(themeEvent);
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-theme-manual', manualPreference !== null ? 'true' : 'false');
    updateToggleState(theme);
    dispatchThemeEvent(theme);
  }

  function persistPreference() {
    try {
      if (manualPreference) {
        window.localStorage.setItem(storageKey, manualPreference);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch (error) {
      // OK: empty - Silently ignore localStorage errors in private browsing/incognito mode
    }
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

  toggles.forEach(function (toggle) {
    toggle.addEventListener('click', function () {
      var currentTheme = getActiveTheme();
      var nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      var systemTheme = getSystemTheme();
      manualPreference = nextTheme === systemTheme ? null : nextTheme;
      persistPreference();
      applyTheme(nextTheme);
    });
  });
})();
</script>`;
}

function renderSunIcon(): string {
  return '  <svg class="theme-toggle-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><line x1="12" y1="2" x2="12" y2="5"></line><line x1="12" y1="19" x2="12" y2="22"></line><line x1="4.22" y1="4.22" x2="6.34" y2="6.34"></line><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"></line><line x1="2" y1="12" x2="5" y2="12"></line><line x1="19" y1="12" x2="22" y2="12"></line><line x1="4.22" y1="19.78" x2="6.34" y2="17.66"></line><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"></line></svg>';
}

function renderMoonIcon(): string {
  return '  <svg class="theme-toggle-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 0 1 11.21 3 7 7 0 1 0 21 12.79z"></path></svg>';
}
