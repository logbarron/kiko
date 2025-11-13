export function renderEventScripts(nonce: string | undefined): string {
  return `<script${nonce ? ` nonce="${nonce}"` : ''}>
${getEventScript()}
  </script>`;
}

function getEventScript(): string {
  return `(function () {
      // Handle scroll to top for header
      const headerLink = document.querySelector('[data-scroll-to-top]');
      if (headerLink) {
        headerLink.addEventListener('click', function (event) {
          event.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      }

      const manualAttribute = 'data-theme-manual';

      function getManualOverrideFlag() {
        return document.body.getAttribute(manualAttribute) === 'true';
      }

      const themeImageEntries = Array.prototype.slice.call(document.querySelectorAll('[data-theme-image]')).map(function (image) {
        const picture = image.closest('[data-theme-picture]');
        const source = picture ? picture.querySelector('[data-theme-source]') : null;
        const defaultMedia = source ? source.getAttribute('data-default-media') || source.getAttribute('media') || '' : '';
        return { image, source, defaultMedia };
      });

      function swapThemeImage(image, nextSrc) {
        if (!image || !nextSrc) {
          return;
        }

        if (image.getAttribute('src') === nextSrc) {
          return;
        }

        if (image.dataset.pendingThemeSrc === nextSrc) {
          return;
        }

        image.dataset.pendingThemeSrc = nextSrc;

        const handleSwapComplete = function () {
          image.classList.remove('is-switching');
          delete image.dataset.pendingThemeSrc;
        };

        image.classList.add('is-switching');
        image.addEventListener('load', handleSwapComplete, { once: true });
        image.addEventListener('error', handleSwapComplete, { once: true });

        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            image.setAttribute('src', nextSrc);
          });
        });
      }

      function updateThemeImages(theme, isManualOverride) {
        themeImageEntries.forEach(function (entry) {
          const image = entry.image;
          if (!image) {
            return;
          }

          const source = entry.source;
          if (source) {
            if (isManualOverride) {
              source.setAttribute('media', theme === 'dark' ? 'all' : 'not all');
            } else if (entry.defaultMedia) {
              source.setAttribute('media', entry.defaultMedia);
            } else {
              source.removeAttribute('media');
            }
          }

          const lightSrc = image.getAttribute('data-theme-light');
          const darkSrc = image.getAttribute('data-theme-dark');
          const nextSrc = theme === 'dark' ? darkSrc : lightSrc;
          if (nextSrc) {
            swapThemeImage(image, nextSrc);
          }
        });
      }

      const initialTheme = document.body.getAttribute('data-theme') || 'light';
      updateThemeImages(initialTheme, getManualOverrideFlag());

      window.addEventListener('themechange', function (event) {
        const nextTheme = event && event.detail && event.detail.theme ? event.detail.theme : (document.body.getAttribute('data-theme') || 'light');
        const manualOverride = event && event.detail && typeof event.detail.manual === 'boolean'
          ? event.detail.manual
          : getManualOverrideFlag();
        updateThemeImages(nextTheme, manualOverride);
      });

      const navToggle = document.querySelector('[data-nav-toggle]');
      const navDrawer = document.querySelector('[data-nav-drawer]');
      const navOverlay = document.querySelector('[data-nav-overlay]');

      function closeNavDrawer() {
        if (!navToggle || !navDrawer || !navOverlay) return;
        navToggle.setAttribute('aria-expanded', 'false');
        navDrawer.classList.remove('is-open');
        navOverlay.classList.remove('is-open');
        document.body.classList.remove('nav-open');
        if (typeof closeAllNavMenus === 'function') {
          closeAllNavMenus({ instant: true, focusTrigger: false });
        }
      }

      function openNavDrawer() {
        if (!navToggle || !navDrawer || !navOverlay) return;
        navToggle.setAttribute('aria-expanded', 'true');
        navDrawer.classList.add('is-open');
        navOverlay.classList.add('is-open');
        document.body.classList.add('nav-open');
      }

      if (navToggle && navDrawer && navOverlay) {
        navToggle.addEventListener('click', function () {
          const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
          if (isExpanded) {
            closeNavDrawer();
          } else {
            openNavDrawer();
          }
        });

        navOverlay.addEventListener('click', closeNavDrawer);

        navDrawer.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') {
            closeNavDrawer();
            navToggle.focus();
          }
        });
      }

      const timelineSections = Array.prototype.slice.call(document.querySelectorAll('[data-timeline-section]'));
      const timelineMediaQuery = window.matchMedia('(max-width: 767px)');
      const TIMELINE_STATE_ATTR = 'data-timeline-expanded';
      const prefersReducedMotionQuery = typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
      const DISCLOSURE_ANIMATION_HANDLER = '__disclosureAnimationHandler';
      initializeTimelineSections();

      function cleanupDisclosureAnimation(node) {
        if (!node) {
          return;
        }

        node.style.removeProperty('height');
        node.style.removeProperty('overflow');
        node.style.removeProperty('transition');
        node.style.removeProperty('padding-top');
        node.style.removeProperty('padding-bottom');

        const existingHandler = node[DISCLOSURE_ANIMATION_HANDLER];
        if (existingHandler) {
          node.removeEventListener('transitionend', existingHandler);
          delete node[DISCLOSURE_ANIMATION_HANDLER];
        }
      }

      function animateDisclosure(node, shouldExpand) {
        if (!node) {
          return;
        }

        cleanupDisclosureAnimation(node);

        const reduceMotion = prefersReducedMotionQuery && prefersReducedMotionQuery.matches;
        if (reduceMotion) {
          node.hidden = !shouldExpand;
          return;
        }

        node.hidden = false;

        const computed = window.getComputedStyle(node);
        const paddingTop = parseFloat(computed.paddingTop) || 0;
        const paddingBottom = parseFloat(computed.paddingBottom) || 0;
        const transitionParts = ['height 0.25s ease'];
        if (paddingTop > 0) {
          transitionParts.push('padding-top 0.25s ease');
        }
        if (paddingBottom > 0) {
          transitionParts.push('padding-bottom 0.25s ease');
        }
        const transitionValue = transitionParts.join(', ');

        const targetHeight = node.scrollHeight;

        if (shouldExpand && targetHeight === 0) {
          cleanupDisclosureAnimation(node);
          node.hidden = false;
          return;
        }

        if (!shouldExpand && targetHeight === 0) {
          node.hidden = true;
          return;
        }

        node.style.overflow = 'hidden';

        if (shouldExpand) {
          node.style.height = '0px';
          if (paddingTop > 0) {
            node.style.paddingTop = '0px';
          }
          if (paddingBottom > 0) {
            node.style.paddingBottom = '0px';
          }
          node.offsetHeight;
          node.style.transition = transitionValue;
          node.style.height = targetHeight + 'px';
          if (paddingTop > 0) {
            node.style.paddingTop = paddingTop + 'px';
          }
          if (paddingBottom > 0) {
            node.style.paddingBottom = paddingBottom + 'px';
          }
        } else {
          node.style.height = targetHeight + 'px';
          if (paddingTop > 0) {
            node.style.paddingTop = paddingTop + 'px';
          }
          if (paddingBottom > 0) {
            node.style.paddingBottom = paddingBottom + 'px';
          }
          node.offsetHeight;
          node.style.transition = transitionValue;
          node.style.height = '0px';
          if (paddingTop > 0) {
            node.style.paddingTop = '0px';
          }
          if (paddingBottom > 0) {
            node.style.paddingBottom = '0px';
          }
        }

        const handleTransitionEnd = function (event) {
          if (event.target !== node || event.propertyName !== 'height') {
            return;
          }

          cleanupDisclosureAnimation(node);
          if (!shouldExpand) {
            node.hidden = true;
          }
        };

        node[DISCLOSURE_ANIMATION_HANDLER] = handleTransitionEnd;
        node.addEventListener('transitionend', handleTransitionEnd);

        window.setTimeout(function () {
          if (node[DISCLOSURE_ANIMATION_HANDLER] === handleTransitionEnd) {
            handleTransitionEnd({ target: node, propertyName: 'height' });
          }
        }, 350);
      }

      function readTimelineExpanded(section) {
        const stored = section.getAttribute(TIMELINE_STATE_ATTR);
        if (stored === 'false') {
          return false;
        }
        if (stored === 'true') {
          return true;
        }
        return !section.hasAttribute('data-collapsed');
      }

      function storeTimelineExpanded(section, expanded) {
        section.setAttribute(TIMELINE_STATE_ATTR, expanded ? 'true' : 'false');
      }

      function applyTimelineState(section, toggle, content, expanded, isMobile, options) {
        const shouldAnimate = Boolean(options && options.animate);

        if (isMobile) {
          toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          if (expanded) {
            section.removeAttribute('data-collapsed');
          } else {
            section.setAttribute('data-collapsed', 'true');
          }

          if (shouldAnimate) {
            animateDisclosure(content, expanded);
          } else {
            cleanupDisclosureAnimation(content);
            content.hidden = !expanded;
          }
        } else {
          toggle.setAttribute('aria-expanded', 'true');
          cleanupDisclosureAnimation(content);
          content.hidden = false;
          section.removeAttribute('data-collapsed');
        }
      }

      function initializeTimelineSections() {
        if (!timelineSections.length) {
          return;
        }

        timelineSections.forEach(function (section) {
          const toggle = section.querySelector('[data-timeline-toggle]');
          const content = section.querySelector('[data-timeline-content]');
          if (!toggle || !content) {
            return;
          }

          const initialExpanded = readTimelineExpanded(section);
          storeTimelineExpanded(section, initialExpanded);

          toggle.addEventListener('click', function () {
            if (!timelineMediaQuery.matches) {
              return;
            }
            const expanded = readTimelineExpanded(section);
            const nextExpanded = !expanded;
            storeTimelineExpanded(section, nextExpanded);
            applyTimelineState(section, toggle, content, nextExpanded, true, { animate: true });
          });

          const toggleTargets = section.querySelectorAll('[data-timeline-toggle-target]');
          Array.prototype.slice.call(toggleTargets).forEach(function (targetNode) {
            targetNode.addEventListener('click', function (event) {
              if (!timelineMediaQuery.matches) {
                return;
              }

              if (toggle.contains(event.target)) {
                return;
              }

              const targetElement = event.target;
              if (targetElement && targetElement.nodeType === 1 && typeof targetElement.closest === 'function') {
                const interactiveAncestor = targetElement.closest('a, button, input, textarea, select, label');
                if (interactiveAncestor && interactiveAncestor !== toggle) {
                  return;
                }
              }

              event.preventDefault();
              toggle.click();
            });
          });
        });

        syncTimelineSections();

        const handleViewportChange = function () {
          syncTimelineSections();
        };

        if (typeof timelineMediaQuery.addEventListener === 'function') {
          timelineMediaQuery.addEventListener('change', handleViewportChange);
        } else if (typeof timelineMediaQuery.addListener === 'function') {
          timelineMediaQuery.addListener(handleViewportChange);
        }
      }

      function syncTimelineSections() {
        const isMobile = timelineMediaQuery.matches;
        timelineSections.forEach(function (section) {
          const toggle = section.querySelector('[data-timeline-toggle]');
          const content = section.querySelector('[data-timeline-content]');
          if (!toggle || !content) {
            return;
          }

          const expanded = readTimelineExpanded(section);
          applyTimelineState(section, toggle, content, expanded, isMobile);
        });
      }

      const navDesktopQuery = typeof window.matchMedia === 'function'
        ? window.matchMedia('(min-width: 768px)')
        : null;

      function isDesktopNav() {
        return Boolean(navDesktopQuery && navDesktopQuery.matches);
      }

      function performScroll(targetId, focusDescriptor) {
        if (!targetId) {
          return;
        }
        const target = document.getElementById(targetId);
        if (!target) {
          return;
        }
        if (timelineMediaQuery.matches && target.hasAttribute('data-timeline-section')) {
          const toggle = target.querySelector('[data-timeline-toggle]');
          const content = target.querySelector('[data-timeline-content]');
          if (toggle && content) {
            storeTimelineExpanded(target, true);
            applyTimelineState(target, toggle, content, true, true, { animate: true });
          }
        }
        const computedHeight = getComputedStyle(document.body).getPropertyValue('--top-bar-height');
        const topBarHeight = computedHeight ? parseInt(computedHeight, 10) : 0;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - topBarHeight - 20;
        window.scrollTo({ top: targetPosition, behavior: 'smooth' });
        if (focusDescriptor) {
          handleScrollFocus(focusDescriptor);
        }
        closeNavDrawer();
      }

      const navMenuTriggers = Array.prototype.slice.call(document.querySelectorAll('[data-nav-trigger]'));
      const navDropdowns = Array.prototype.slice.call(document.querySelectorAll('[data-nav-dropdown]'));
      let activeNavMenu = null;

      function getDropdownById(id) {
        for (var index = 0; index < navDropdowns.length; index += 1) {
          const node = navDropdowns[index];
          if (node && node.getAttribute('data-nav-dropdown') === id) {
            return node;
          }
        }
        return null;
      }

      function getTriggerById(id) {
        for (var index = 0; index < navMenuTriggers.length; index += 1) {
          const node = navMenuTriggers[index];
          if (node && node.getAttribute('data-nav-trigger') === id) {
            return node;
          }
        }
        return null;
      }

      function openNavMenu(id, options) {
        if (!isDesktopNav()) {
          return;
        }
        const dropdown = getDropdownById(id);
        const trigger = getTriggerById(id);
        if (!dropdown || !trigger) {
          return;
        }
        const instant = Boolean(options && options.instant);
        const focusFirstLink = Boolean(options && options.focusFirstLink);
        activeNavMenu = id;
        trigger.setAttribute('aria-expanded', 'true');
        if (instant) {
          cleanupDisclosureAnimation(dropdown);
          dropdown.hidden = false;
        } else {
          animateDisclosure(dropdown, true);
        }
        if (focusFirstLink) {
          const firstLink = dropdown.querySelector('a');
          if (firstLink) {
            requestAnimationFrame(function () {
              firstLink.focus();
            });
          }
        }
      }

      function closeNavMenu(id, options) {
        const dropdown = getDropdownById(id);
        const trigger = getTriggerById(id);
        if (!dropdown || !trigger) {
          return;
        }
        const instant = Boolean(options && options.instant);
        const focusTrigger = !options || options.focusTrigger !== false;
        if (instant) {
          cleanupDisclosureAnimation(dropdown);
          dropdown.hidden = true;
        } else if (!dropdown.hidden) {
          animateDisclosure(dropdown, false);
        } else {
          dropdown.hidden = true;
        }
        trigger.setAttribute('aria-expanded', 'false');
        if (focusTrigger) {
          trigger.focus();
        }
        if (!options || options.preserveActive !== true) {
          if (activeNavMenu === id) {
            activeNavMenu = null;
          }
        }
      }

      function closeAllNavMenus(options) {
        const settings = options || {};
        const activeId = activeNavMenu;
        if (activeId) {
          closeNavMenu(activeId, {
            instant: Boolean(settings.instant),
            focusTrigger: settings.focusTrigger,
            preserveActive: false
          });
        }
        navMenuTriggers.forEach(function (trigger) {
          const triggerId = trigger.getAttribute('data-nav-trigger');
          if (!triggerId) {
            return;
          }
          if (!activeId || triggerId !== activeId) {
            trigger.setAttribute('aria-expanded', 'false');
          }
        });
        activeNavMenu = null;
      }

      function toggleNavMenu(id, trigger) {
        if (!id || !trigger) {
          return;
        }
        const fallbackTarget = trigger.getAttribute('data-nav-target') || id;
        if (!isDesktopNav()) {
          performScroll(fallbackTarget);
          return;
        }
        if (activeNavMenu === id) {
          closeNavMenu(id, { instant: false, focusTrigger: false });
          performScroll(fallbackTarget);
          return;
        }
        closeAllNavMenus({ instant: false, focusTrigger: false });
        openNavMenu(id, { focusFirstLink: true });
      }

      if (navMenuTriggers.length > 0) {
        navMenuTriggers.forEach(function (trigger) {
          trigger.addEventListener('click', function (event) {
            const id = trigger.getAttribute('data-nav-trigger');
            if (!id) {
              return;
            }
            event.preventDefault();
            toggleNavMenu(id, trigger);
          });

          trigger.addEventListener('keydown', function (event) {
            const id = trigger.getAttribute('data-nav-trigger');
            if (!id) {
              return;
            }
            if (event.key === 'ArrowDown' && isDesktopNav()) {
              event.preventDefault();
              if (activeNavMenu !== id) {
                closeAllNavMenus({ instant: false, focusTrigger: false });
                openNavMenu(id, { focusFirstLink: true });
              } else {
                const dropdown = getDropdownById(id);
                if (dropdown) {
                  const firstLink = dropdown.querySelector('a');
                  if (firstLink) {
                    firstLink.focus();
                  }
                }
              }
            }
            if (event.key === 'Escape' && activeNavMenu === id) {
              event.preventDefault();
              closeNavMenu(id, { instant: true });
            }
          });
        });
      }

      if (navDesktopQuery) {
        const handleNavQueryChange = function (event) {
          if (!event.matches) {
            closeAllNavMenus({ instant: true, focusTrigger: false });
          }
        };
        if (typeof navDesktopQuery.addEventListener === 'function') {
          navDesktopQuery.addEventListener('change', handleNavQueryChange);
        } else if (typeof navDesktopQuery.addListener === 'function') {
          navDesktopQuery.addListener(handleNavQueryChange);
        }
      }

      const links = document.querySelectorAll('[data-scroll-target]');
      links.forEach(function (link) {
        link.addEventListener('click', function (event) {
          event.preventDefault();
          const targetId = link.getAttribute('data-scroll-target');
          if (!targetId) return;
          const focusDescriptor = link.getAttribute('data-scroll-focus') || undefined;
          performScroll(targetId, focusDescriptor);
          closeAllNavMenus({ instant: true, focusTrigger: false });
        });
      });

      function handleScrollFocus(descriptor) {
        if (!descriptor) {
          return;
        }
        const parts = descriptor.split(':');
        if (parts.length < 2) {
          return;
        }
        const section = parts[0];
        const focusId = parts.slice(1).join(':');
        if (!focusId || focusId === 'root') {
          return;
        }
        if (section === 'schedule') {
          focusScheduleCard(focusId);
        } else if (section === 'travel') {
          focusTravelCard(focusId);
        }
      }

      function focusScheduleCard(cardId) {
        if (!cardId) {
          return;
        }
        var selectorValue = cardId;
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
          selectorValue = CSS.escape(cardId);
        } else {
          selectorValue = cardId.replace(/"/g, '\\"');
        }
        const card = document.querySelector('[data-schedule-id="' + selectorValue + '"]');
        if (!card) {
          return;
        }
        const toggle = card.querySelector('[data-schedule-toggle]');
        const content = card.querySelector('.schedule-desktop-content');
        if (toggle && content) {
          expandScheduleContent(toggle, content, { instant: false });
          card.setAttribute('data-desktop-expanded', 'true');
        }
        const anchor = card.querySelector('.schedule-card-header') || card;
        const computedHeight = getComputedStyle(document.body).getPropertyValue('--top-bar-height');
        const topBarHeight = computedHeight ? parseInt(computedHeight, 10) : 0;
        const targetPosition = anchor.getBoundingClientRect().top + window.pageYOffset - topBarHeight - 20;
        window.scrollTo({ top: targetPosition, behavior: 'smooth' });
      }

      function focusTravelCard(cardKey) {
        if (!cardKey) {
          return;
        }
        var selectorValue = cardKey;
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
          selectorValue = CSS.escape(cardKey);
        } else {
          selectorValue = cardKey.replace(/"/g, '\\"');
        }
        const card = document.querySelector('[data-travel-card="' + selectorValue + '"]');
        if (!card) {
          return;
        }
        const toggle = card.querySelector('[data-travel-toggle]');
        const content = card.querySelector('[data-travel-content]');
        if (toggle && content) {
          expandScheduleContent(toggle, content, { instant: false });
          card.setAttribute('data-travel-desktop-expanded', 'true');
        }
        const anchor = card.querySelector('.schedule-card-header') || card;
        const computedHeight = getComputedStyle(document.body).getPropertyValue('--top-bar-height');
        const topBarHeight = computedHeight ? parseInt(computedHeight, 10) : 0;
        const targetPosition = anchor.getBoundingClientRect().top + window.pageYOffset - topBarHeight - 20;
        window.scrollTo({ top: targetPosition, behavior: 'smooth' });
      }

      const form = document.getElementById('rsvp-form');
      if (!form) return;

      const statusNode = document.getElementById('rsvp-status');
      const submitButton = form.querySelector('button[type="submit"]');
      let isSubmitting = false;

      function getAttendanceStatus(attendeeNode) {
        if (!attendeeNode) {
          return 'pending';
        }
        const checked = attendeeNode.querySelector('input[type="radio"][name^="attendance-"]:checked');
        return checked ? checked.value : 'pending';
      }

      function clearMealSelection(attendeeNode) {
        const mealContainer = attendeeNode.querySelector('[data-meal-container]');
        if (!mealContainer) {
          return;
        }
        mealContainer.querySelectorAll('input[data-meal-event][type="radio"]').forEach(function (radio) {
          radio.checked = false;
        });
        const freeInput = mealContainer.querySelector('input[data-meal-event][type="text"]');
        if (freeInput) {
          freeInput.value = '';
        }
        mealContainer.querySelectorAll('.meal-option-pill').forEach(function (pill) {
          pill.classList.remove('is-selected');
        });
      }

      function syncAttendeeControls(attendeeNode) {
        if (!attendeeNode) {
          return;
        }

        const eventItem = attendeeNode.closest('[data-event-id]');
        if (!eventItem) {
          return;
        }

        const requiresMeal = eventItem.hasAttribute('data-requires-meal');
        const collectsDietary = eventItem.hasAttribute('data-collects-dietary');
        const status = getAttendanceStatus(attendeeNode);
        const isAttending = status === 'yes';

        if (requiresMeal) {
          const mealContainer = attendeeNode.querySelector('[data-meal-container]');
          if (mealContainer) {
            mealContainer.classList.toggle('is-disabled', !isAttending);
            mealContainer.querySelectorAll('input[data-meal-event]').forEach(function (input) {
              input.disabled = !isAttending;
              if (!isAttending) {
                if (input.type === 'radio') {
                  input.checked = false;
                } else {
                  input.value = '';
                }
              }
            });
            mealContainer.querySelectorAll('.meal-option-pill').forEach(function (pill) {
              pill.classList.toggle('is-disabled', !isAttending);
              const pillInput = pill.querySelector('input[data-meal-event][type="radio"]');
              if (pillInput) {
                if (!isAttending) {
                  pill.classList.remove('is-selected');
                } else {
                  pill.classList.toggle('is-selected', pillInput.checked);
                }
              }
            });
          }
        }

        if (collectsDietary) {
          const dietaryContainer = attendeeNode.querySelector('[data-dietary-container]');
          if (dietaryContainer) {
            dietaryContainer.classList.toggle('is-disabled', !isAttending);
            const toggle = dietaryContainer.querySelector('[data-dietary-toggle]');
            const textarea = dietaryContainer.querySelector('[data-dietary-input]');
            const field = dietaryContainer.querySelector('.dietary-field');
            if (toggle) {
              toggle.disabled = !isAttending;
            }
            if (textarea) {
              textarea.disabled = !isAttending;
              if (!isAttending) {
                textarea.value = '';
              }
            }
            if (!isAttending && field) {
              field.setAttribute('hidden', '');
              field.hidden = true;
              if (toggle) {
                toggle.setAttribute('aria-expanded', 'false');
                toggle.textContent = 'Add allergies or restrictions';
              }
            }
          }
        }

        if (!isAttending) {
          clearMealSelection(attendeeNode);
        }
      }

      function buildFormData() {
        const formData = new FormData();
        const responses = {};

        function ensureResponse(personId) {
          if (!responses[personId]) {
            responses[personId] = { events: {}, meals: {}, dietaryNotes: {} };
          }
          return responses[personId];
        }

        form.querySelectorAll('.event-attendee').forEach(function (attendeeNode) {
          const personId = attendeeNode.getAttribute('data-person-id');
          const eventItem = attendeeNode.closest('[data-event-id]');
          if (!personId || !eventItem) {
            return;
          }
          const eventId = eventItem.getAttribute('data-event-id');
          if (!eventId) {
            return;
          }

          const baseName = 'attendance-' + personId + '-' + eventId;
          const selected = attendeeNode.querySelector('input[name="' + baseName + '"]:checked');
          const status = selected ? selected.value : 'pending';
          const personEntry = ensureResponse(personId);

          personEntry.events[eventId] = status;

          const isAttending = status === 'yes';
          const mealRadio = attendeeNode.querySelector('input[data-meal-event="' + eventId + '"][data-meal-person="' + personId + '"][type="radio"]:checked');
          const mealText = attendeeNode.querySelector('input[data-meal-event="' + eventId + '"][data-meal-person="' + personId + '"][type="text"]');
          let mealChoice = '';
          if (isAttending) {
            if (mealRadio) {
              mealChoice = mealRadio.value.trim();
            } else if (mealText) {
              mealChoice = mealText.value.trim();
            }
            if (mealChoice) {
              personEntry.meals[eventId] = mealChoice;
            } else if (personEntry.meals) {
              delete personEntry.meals[eventId];
            }
          } else if (personEntry.meals) {
            delete personEntry.meals[eventId];
          }
        });

        form.querySelectorAll('[data-dietary-container]').forEach(function (container) {
          const personId = container.getAttribute('data-person-id');
          const eventId = container.getAttribute('data-event-id');
          if (!personId || !eventId) {
            return;
          }

          const textarea = container.querySelector('[data-dietary-input]');
          if (!textarea) {
            return;
          }

          const personEntry = ensureResponse(personId);
          const status = personEntry.events[eventId];

          if (status !== 'yes') {
            if (personEntry.dietaryNotes && personEntry.dietaryNotes[eventId]) {
              delete personEntry.dietaryNotes[eventId];
            }
            return;
          }

          const note = textarea.value.trim();

          if (note) {
            if (!personEntry.dietaryNotes) {
              personEntry.dietaryNotes = {};
            }
            personEntry.dietaryNotes[eventId] = note;
          } else if (personEntry.dietaryNotes) {
            delete personEntry.dietaryNotes[eventId];
          }
        });

        const normalizedResponses = {};
        Object.keys(responses).forEach(function (personId) {
          const entry = responses[personId];
          const mealsKeys = Object.keys(entry.meals || {});
          const dietaryKeys = entry.dietaryNotes ? Object.keys(entry.dietaryNotes) : [];
          normalizedResponses[personId] = {
            events: entry.events,
            meals: mealsKeys.length > 0 ? entry.meals : undefined,
            dietaryNotes: dietaryKeys.length > 0 ? entry.dietaryNotes : undefined
          };
        });

        formData.set('partyResponses', JSON.stringify(normalizedResponses));

        return formData;
      }

      async function submitRsvp(auto) {
        if (isSubmitting) {
          return;
        }
        if (!statusNode) {
          form.submit();
          return;
        }

        isSubmitting = true;
        if (!auto && submitButton) {
          submitButton.disabled = true;
        }

        statusNode.textContent = auto ? 'Saving...' : 'Saving your RSVP...';
        statusNode.classList.remove('success', 'error');
        statusNode.classList.add('pending');

        const formData = buildFormData();

        try {
          const response = await fetch('/rsvp', {
            method: 'POST',
            body: formData,
            headers: { 'Accept': 'application/json' }
          });
          if (!response.ok) {
            throw new Error('Request failed');
          }

          const result = await response.json();
          const pendingMealEvents = Array.isArray(result.pendingMealEvents) ? result.pendingMealEvents : [];
          const hasPendingMeals = pendingMealEvents.length > 0;

          statusNode.textContent = hasPendingMeals
            ? 'RSVP saved. You can choose meals any time.'
            : auto
              ? 'RSVP saved.'
              : 'Thanks! Your RSVP is saved.';
          statusNode.classList.remove('pending', 'error');
          statusNode.classList.add('success');
        } catch (error) {
          statusNode.textContent = 'We could not save your RSVP. Please try again.';
          statusNode.classList.remove('pending', 'success');
          statusNode.classList.add('error');
        } finally {
          if (!auto && submitButton) {
            submitButton.disabled = false;
          }
          isSubmitting = false;
        }
      }

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        submitRsvp(false);
      });

      form.querySelectorAll('input[data-auto-save="true"]').forEach(function (input) {
        input.addEventListener('change', function () {
          const attendeeNode = input.closest('.event-attendee');
          if (attendeeNode) {
            syncAttendeeControls(attendeeNode);
          }
          submitRsvp(true);
        });
      });

      form.querySelectorAll('[data-meal-container]').forEach(function (container) {
        const mealInputs = container.querySelectorAll('input[data-meal-event][type="radio"]');
        if (mealInputs.length > 0) {
          mealInputs.forEach(function (input) {
            input.addEventListener('change', function () {
              if (input.disabled) {
                return;
              }
              container.querySelectorAll('.meal-option-pill').forEach(function (pill) {
                pill.classList.remove('is-selected');
              });
              const pill = input.closest('.meal-option-pill');
              if (pill) {
                pill.classList.add('is-selected');
              }
              const attendeeNode = input.closest('.event-attendee');
              if (attendeeNode) {
                syncAttendeeControls(attendeeNode);
              }
              submitRsvp(true);
            });
          });
        } else {
          const freeInput = container.querySelector('input[data-meal-event]');
          if (freeInput) {
            freeInput.addEventListener('blur', function () {
              if (freeInput.disabled) {
                return;
              }
              const attendeeNode = freeInput.closest('.event-attendee');
              if (attendeeNode) {
                syncAttendeeControls(attendeeNode);
              }
              submitRsvp(true);
            });
          }
        }
      });

      const dietaryToggleLabels = {
        add: 'Add allergies or restrictions',
        edit: 'Edit allergies or restrictions',
        hide: 'Hide allergies or restrictions'
      };

      form.querySelectorAll('[data-dietary-container]').forEach(function (container) {
        const toggle = container.querySelector('[data-dietary-toggle]');
        const field = container.querySelector('.dietary-field');
        const textarea = container.querySelector('[data-dietary-input]');

        if (!toggle || !field || !textarea) {
          return;
        }

        function updateToggleLabel(expanded) {
          const note = textarea.value.trim();
          if (expanded) {
            toggle.textContent = dietaryToggleLabels.hide;
          } else {
            toggle.textContent = note ? dietaryToggleLabels.edit : dietaryToggleLabels.add;
          }
        }

        function setExpanded(expanded) {
          container.classList.toggle('is-open', expanded);
          if (expanded) {
            field.removeAttribute('hidden');
            field.hidden = false;
          } else {
            field.setAttribute('hidden', '');
            field.hidden = true;
          }
          toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          updateToggleLabel(expanded);
        }

        const initiallyExpanded = !field.hasAttribute('hidden');
        setExpanded(initiallyExpanded);

        toggle.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (toggle.disabled) {
            return;
          }
          const isHidden = field.hasAttribute('hidden');
          if (isHidden) {
            setExpanded(true);
            textarea.focus();
          } else {
            setExpanded(false);
            submitRsvp(true);
          }
        });

        textarea.addEventListener('blur', function () {
          if (textarea.disabled) {
            return;
          }
          const hasContent = textarea.value.trim().length > 0;
          setExpanded(hasContent);
          submitRsvp(true);
        });

        textarea.addEventListener('input', function () {
          updateToggleLabel(!field.hasAttribute('hidden'));
        });
      });

      form.querySelectorAll('.event-attendee').forEach(function (attendeeNode) {
        syncAttendeeControls(attendeeNode);
      });

      // Desktop tab functionality for schedule cards
      document.querySelectorAll('.schedule-tabs button[role="tab"]').forEach(function(tab) {
        tab.addEventListener('click', function() {
          const card = this.closest('.schedule-card');
          if (!card) return;

          const tabId = this.getAttribute('data-tab');
          const container = card.querySelector('.schedule-panels');
          const currentPanel = card.querySelector('.schedule-tab-panel[data-active]');
          const newPanel = card.querySelector('[data-panel="' + tabId + '"]');

          if (!container || !newPanel || newPanel === currentPanel) return;

          container.style.height = container.offsetHeight + 'px';

          card.querySelectorAll('[role="tab"]').forEach(function(tab) {
            tab.setAttribute('aria-selected', 'false');
            tab.setAttribute('tabindex', '-1');
          });
          this.setAttribute('aria-selected', 'true');
          this.setAttribute('tabindex', '0');

          requestAnimationFrame(function() {
            if (currentPanel) {
              delete currentPanel.dataset.active;
            }

            newPanel.dataset.active = '';

            requestAnimationFrame(function() {
              container.style.height = newPanel.scrollHeight + 'px';

              setTimeout(function() {
                container.style.height = '';
              }, 250);
            });
          });
        });
      });

      const scheduleCards = Array.prototype.slice.call(document.querySelectorAll('.schedule-card'));
      const travelCards = Array.prototype.slice.call(document.querySelectorAll('[data-travel-card]'));
      const scheduleDesktopQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 768px)') : null;

      function expandScheduleContent(toggle, content, options) {
        const instant = Boolean(options && options.instant);
        toggle.setAttribute('aria-expanded', 'true');
        if (instant) {
          cleanupDisclosureAnimation(content);
          content.hidden = false;
        } else {
          animateDisclosure(content, true);
        }
      }

      function collapseScheduleContent(toggle, content, options) {
        const instant = Boolean(options && options.instant);
        toggle.setAttribute('aria-expanded', 'false');
        if (instant) {
          cleanupDisclosureAnimation(content);
          content.hidden = true;
        } else {
          animateDisclosure(content, false);
        }
      }

      function applyScheduleDesktopState(isDesktop, options) {
        const instant = Boolean(options && options.instant);
        scheduleCards.forEach(function (card) {
          const toggle = card.querySelector('[data-schedule-toggle]');
          const content = card.querySelector('.schedule-desktop-content');
          if (!toggle || !content) {
            return;
          }

          if (!card.hasAttribute('data-desktop-expanded')) {
            const initialExpanded = toggle.getAttribute('aria-expanded') === 'true';
            card.setAttribute('data-desktop-expanded', initialExpanded ? 'true' : 'false');
          }

          if (isDesktop) {
            const expanded = card.getAttribute('data-desktop-expanded') === 'true';
            card.setAttribute('data-desktop-expanded', expanded ? 'true' : 'false');
            toggle.removeAttribute('disabled');

            if (instant) {
              cleanupDisclosureAnimation(content);
              content.hidden = !expanded;
              toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            } else if (expanded) {
              expandScheduleContent(toggle, content);
            } else {
              collapseScheduleContent(toggle, content);
            }
          } else {
            const wasExpandedOnDesktop = toggle.getAttribute('aria-expanded') === 'true';
            card.setAttribute('data-desktop-expanded', wasExpandedOnDesktop ? 'true' : 'false');
            toggle.setAttribute('disabled', 'disabled');

            if (instant) {
              cleanupDisclosureAnimation(content);
              content.hidden = false;
              toggle.setAttribute('aria-expanded', 'true');
            } else if (toggle.getAttribute('aria-expanded') !== 'true' || content.hidden) {
              expandScheduleContent(toggle, content, options);
            }
          }
        });
      }

      function applyTravelDesktopState(isDesktop, options) {
        const instant = Boolean(options && options.instant);
        travelCards.forEach(function (card) {
          const toggle = card.querySelector('[data-travel-toggle]');
          const content = card.querySelector('[data-travel-content]');
          if (!toggle || !content) {
            return;
          }

          if (!card.hasAttribute('data-travel-desktop-expanded')) {
            const initialExpanded = toggle.getAttribute('aria-expanded') === 'true';
            card.setAttribute('data-travel-desktop-expanded', initialExpanded ? 'true' : 'false');
          }

          if (isDesktop) {
            const expanded = card.getAttribute('data-travel-desktop-expanded') === 'true';
            card.setAttribute('data-travel-desktop-expanded', expanded ? 'true' : 'false');
            toggle.removeAttribute('disabled');

            if (instant) {
              cleanupDisclosureAnimation(content);
              content.hidden = !expanded;
              toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            } else if (expanded) {
              expandScheduleContent(toggle, content);
            } else {
              collapseScheduleContent(toggle, content);
            }
          } else {
            const wasExpandedOnDesktop = toggle.getAttribute('aria-expanded') === 'true';
            card.setAttribute('data-travel-desktop-expanded', wasExpandedOnDesktop ? 'true' : 'false');
            toggle.setAttribute('disabled', 'disabled');

            if (instant) {
              cleanupDisclosureAnimation(content);
              content.hidden = false;
              toggle.setAttribute('aria-expanded', 'true');
            } else if (toggle.getAttribute('aria-expanded') !== 'true' || content.hidden) {
              expandScheduleContent(toggle, content, options);
            }
          }
        });
      }

      scheduleCards.forEach(function (card) {
        const toggle = card.querySelector('[data-schedule-toggle]');
        const trigger = card.querySelector('[data-schedule-trigger]');
        const content = card.querySelector('.schedule-desktop-content');
        if (!toggle || !content) {
          return;
        }

        const handleToggleActivation = function (event) {
          if (event && trigger && trigger.contains(event.target)) {
            event.preventDefault();
          }
          if (scheduleDesktopQuery && !scheduleDesktopQuery.matches) {
            return;
          }
          const initialAnchor = card.getBoundingClientRect().top + window.pageYOffset;
          const expanded = toggle.getAttribute('aria-expanded') === 'true';
          const nextExpanded = !expanded;

          if (nextExpanded) {
            expandScheduleContent(toggle, content);
          } else {
            collapseScheduleContent(toggle, content);
          }

          card.setAttribute('data-desktop-expanded', nextExpanded ? 'true' : 'false');

          const maintainScrollPosition = function () {
            const currentAnchor = card.getBoundingClientRect().top + window.pageYOffset;
            const delta = currentAnchor - initialAnchor;
            if (Math.abs(delta) > 1) {
              window.scrollBy(0, delta);
            }
          };

          requestAnimationFrame(function () {
            requestAnimationFrame(maintainScrollPosition);
          });
          window.setTimeout(maintainScrollPosition, 320);
        };

        toggle.addEventListener('click', handleToggleActivation);
        if (trigger && trigger !== toggle) {
          trigger.addEventListener('click', handleToggleActivation);
        }
      });

      travelCards.forEach(function (card) {
        const toggle = card.querySelector('[data-travel-toggle]');
        const trigger = card.querySelector('[data-travel-trigger]');
        const content = card.querySelector('[data-travel-content]');
        if (!toggle || !content) {
          return;
        }

        const handleToggleActivation = function (event) {
          if (event && trigger && trigger.contains(event.target)) {
            event.preventDefault();
          }
          if (scheduleDesktopQuery && !scheduleDesktopQuery.matches) {
            return;
          }
          const initialAnchor = card.getBoundingClientRect().top + window.pageYOffset;
          const expanded = toggle.getAttribute('aria-expanded') === 'true';
          const nextExpanded = !expanded;

          if (nextExpanded) {
            expandScheduleContent(toggle, content);
          } else {
            collapseScheduleContent(toggle, content);
          }

          card.setAttribute('data-travel-desktop-expanded', nextExpanded ? 'true' : 'false');

          const maintainScrollPosition = function () {
            const currentAnchor = card.getBoundingClientRect().top + window.pageYOffset;
            const delta = currentAnchor - initialAnchor;
            if (Math.abs(delta) > 1) {
              window.scrollBy(0, delta);
            }
          };

          requestAnimationFrame(function () {
            requestAnimationFrame(maintainScrollPosition);
          });
          window.setTimeout(maintainScrollPosition, 320);
        };

        toggle.addEventListener('click', handleToggleActivation);
        if (trigger && trigger !== toggle) {
          trigger.addEventListener('click', handleToggleActivation);
        }
      });

      if (scheduleDesktopQuery) {
        const applyDesktopStates = function (matches) {
          applyScheduleDesktopState(matches, { instant: true });
          applyTravelDesktopState(matches, { instant: true });
        };

        applyDesktopStates(scheduleDesktopQuery.matches);

        const handleScheduleChange = function (event) {
          applyDesktopStates(event.matches);
        };
        if (typeof scheduleDesktopQuery.addEventListener === 'function') {
          scheduleDesktopQuery.addEventListener('change', handleScheduleChange);
        } else if (typeof scheduleDesktopQuery.addListener === 'function') {
          scheduleDesktopQuery.addListener(handleScheduleChange);
        }
      } else {
        applyScheduleDesktopState(true, { instant: true });
        applyTravelDesktopState(true, { instant: true });
      }

      initializeHoneymoonWidget();

      function getCurrentTheme() {
        const themeAttr = document.body.getAttribute('data-theme');
        if (themeAttr === 'dark' || themeAttr === 'light') {
          return themeAttr;
        }
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        return prefersDark ? 'dark' : 'light';
      }

      function getStripeAppearance(theme) {
        if (theme === 'dark') {
          return {
            theme: 'night',
            labels: 'floating',
            variables: {
              colorBackground: '#0c121e',
              colorText: '#eff5fd'
            }
          };
        } else {
          return {
            theme: 'stripe',
            labels: 'floating',
            variables: {
              colorBackground: '#ffffff',
              colorText: '#0f172a'
            }
          };
        }
      }

      function initializeHoneymoonWidget() {
        const root = document.querySelector('[data-honeymoon]');
        if (!root) {
          return;
        }

        const presetButtons = Array.prototype.slice.call(root.querySelectorAll('[data-amount-button]'));
        const amountInput = root.querySelector('[data-amount-input]');
        const fieldsContainer = root.querySelector('[data-contribute-fields]');
        const contributeButton = root.querySelector('[data-contribute-button]');
        const checkoutContainer = root.querySelector('[data-checkout-container]');
        const successContainer = root.querySelector('[data-success]');
        const successMessageNode = root.querySelector('[data-success-message]');
        const receiptLink = root.querySelector('[data-receipt-link]');
        const errorNode = root.querySelector('[data-error]');

        if (!amountInput || !fieldsContainer || !contributeButton || !checkoutContainer || !successContainer || !successMessageNode || !receiptLink || !errorNode) {
          return;
        }

        const defaultButtonLabel = contributeButton.textContent || 'Contribute';
        presetButtons.forEach(function (button) {
          button.setAttribute('aria-pressed', 'false');
        });

        let configPromise = null;
        let stripeJsPromise = null;
        let publishableKey = '';
        let stripeClient = null;
        let currentCheckout = null;
        let currentActions = null;
        let currentSessionId = null;
        let currentClientSecret = null;
        let state = 'idle';
        let isProcessing = false;
        let confirmInProgress = false;

        const showMessage = function (message) {
          if (!message) {
            errorNode.textContent = '';
            errorNode.hidden = true;
            return;
          }
          errorNode.textContent = message;
          errorNode.hidden = false;
        };

        const setButtonState = function (disabled, text) {
          contributeButton.disabled = Boolean(disabled);
          if (typeof text === 'string') {
            contributeButton.textContent = text;
          }
        };

        const urlParams = new URLSearchParams(window.location.search);
        const returnSessionId = urlParams.get('session_id');

        if (returnSessionId) {
          handleStripeReturn(returnSessionId);
          return;
        }

        presetButtons.forEach(function (button) {
          button.addEventListener('click', function () {
            const amountValue = button.getAttribute('data-amount-button') || '';
            amountInput.value = amountValue;
            presetButtons.forEach(function (btn) {
              btn.setAttribute('aria-pressed', btn === button ? 'true' : 'false');
            });
            showMessage('');
          });
        });

        amountInput.addEventListener('input', function () {
          presetButtons.forEach(function (btn) {
            btn.setAttribute('aria-pressed', 'false');
          });
          showMessage('');
        });

        contributeButton.addEventListener('click', function () {
          if (state === 'processing') {
            return;
          }
          if (state === 'confirm') {
            confirmStripePayment();
          } else if (state === 'idle') {
            startStripeCheckout();
          }
        });

        function handleStripeReturn(sessionId) {
          if (root && typeof root.scrollIntoView === 'function') {
            requestAnimationFrame(function () {
              root.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          }

          checkoutContainer.hidden = false;
          contributeButton.hidden = true;
          setButtonState(true, 'Verifying payment...');

          fetch('/stripe/session-status?session_id=' + encodeURIComponent(sessionId), {
            method: 'GET',
            credentials: 'include'
          })
            .then(function (response) {
              return response.json().catch(function () {
                return {};
              }).then(function (data) {
                if (!response.ok) {
                  const message = data && data.error ? data.error : 'Could not verify payment.';
                  throw new Error(message);
                }
                return data;
              });
            })
            .then(function (statusData) {
              if (statusData.status !== 'complete') {
                throw new Error('Payment was not completed.');
              }

              const amountMinor = typeof statusData.amountTotal === 'number' ? statusData.amountTotal : null;
              const currency = typeof statusData.currency === 'string' ? statusData.currency : 'USD';
              const amountLabel = amountMinor !== null ? formatCurrency(amountMinor, currency) : '';

              successMessageNode.textContent = amountLabel
                ? 'Thank you for contributing ' + amountLabel + '!'
                : 'Thank you for your contribution!';

              if (statusData && statusData.receiptUrl) {
                receiptLink.href = statusData.receiptUrl;
                receiptLink.hidden = false;
              } else {
                receiptLink.hidden = true;
              }

              showMessage('');
              checkoutContainer.hidden = true;
              successContainer.hidden = false;

              if (root && typeof root.scrollIntoView === 'function') {
                requestAnimationFrame(function () {
                  root.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
              }

              window.history.replaceState({}, '', window.location.pathname);
            })
            .catch(function (error) {
              showMessage(error && error.message ? error.message : 'Could not verify payment. Please contact us.');
              resetToInitialState({ clearAmount: false });
            });
        }

        function resetToInitialState(options) {
          const settings = options || {};
          state = 'idle';
          isProcessing = false;
          confirmInProgress = false;
          showMessage('');
          if (settings.clearAmount) {
            amountInput.value = '';
            presetButtons.forEach(function (btn) {
              btn.setAttribute('aria-pressed', 'false');
            });
          }
          successContainer.hidden = true;
          checkoutContainer.hidden = true;
          if (contributeButton.parentNode !== root) {
            root.insertBefore(contributeButton, checkoutContainer);
          }
          contributeButton.hidden = false;
          setButtonState(false, defaultButtonLabel);
          if (receiptLink) {
            receiptLink.hidden = true;
          }
          const emailInput = checkoutContainer.querySelector('[data-email-input]');
          if (emailInput) {
            emailInput.value = '';
          }
          if (currentCheckout && typeof currentCheckout.destroy === 'function') {
            currentCheckout.destroy();
          }
          currentCheckout = null;
          currentActions = null;
          currentSessionId = null;
          currentClientSecret = null;
        }

        function fetchStripeConfig() {
          if (!configPromise) {
            configPromise = fetch('/stripe/config', {
              method: 'GET',
              credentials: 'include'
            }).then(function (response) {
              return response.json().catch(function () {
                return {};
              }).then(function (data) {
                if (!response.ok) {
                  const message = data && data.error ? data.error : 'Something went wrong. Please try again.';
                  throw new Error(message);
                }
                if (!data || typeof data.publishableKey !== 'string') {
                  throw new Error('Stripe is not available right now.');
                }
                publishableKey = data.publishableKey;
                return publishableKey;
              });
            }).catch(function (error) {
              configPromise = null;
              throw error;
            });
          }
          return configPromise;
        }

        function loadStripeJs() {
          if (typeof window.Stripe === 'function') {
            return Promise.resolve();
          }
          if (!stripeJsPromise) {
            stripeJsPromise = new Promise(function (resolve, reject) {
              const script = document.createElement('script');
              script.src = 'https://js.stripe.com/clover/stripe.js';
              script.async = true;
              script.onload = function () {
                resolve();
              };
              script.onerror = function () {
                reject(new Error('Unable to load Stripe.js.'));
              };
              document.head.appendChild(script);
            });
          }
          return stripeJsPromise;
        }

        function ensureStripeClient() {
          return fetchStripeConfig()
            .then(loadStripeJs)
            .then(function () {
              if (!stripeClient) {
                stripeClient = window.Stripe(publishableKey);
              }
              return stripeClient;
            });
        }

        function validateAmount() {
          const rawAmount = amountInput.value.trim();
          const numericAmount = rawAmount ? Number(rawAmount) : NaN;
          if (!Number.isFinite(numericAmount)) {
            return { ok: false, message: 'Enter a valid amount.' };
          }
          const amountCents = Math.round(numericAmount * 100);
          if (!Number.isSafeInteger(amountCents) || amountCents < 100) {
            return { ok: false, message: 'Minimum contribution is $1.' };
          }
          return {
            ok: true,
            amountUsd: numericAmount
          };
        }

        function startStripeCheckout() {
          const validation = validateAmount();
          if (!validation.ok) {
            showMessage(validation.message);
            return;
          }

          state = 'processing';
          isProcessing = true;
          showMessage('');
          setButtonState(true, 'Loading…');

          ensureStripeClient()
            .then(function () {
              return fetch('/stripe/create-session', {
                method: 'POST',
                credentials: 'include',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  amountUsd: validation.amountUsd
                })
              });
            })
            .then(function (response) {
              return response.json().catch(function () {
                return {};
              }).then(function (data) {
                if (!response.ok) {
                  const message = data && data.error ? data.error : 'Something went wrong. Please try again.';
                  throw new Error(message);
                }
                if (!data || typeof data.clientSecret !== 'string' || typeof data.sessionId !== 'string') {
                  throw new Error('Stripe is not available right now.');
                }
                return data;
              });
            })
            .then(function (sessionData) {
              currentSessionId = sessionData.sessionId;
              currentClientSecret = sessionData.clientSecret;
              if (currentCheckout && typeof currentCheckout.destroy === 'function') {
                currentCheckout.destroy();
              }

              const currentTheme = getCurrentTheme();
              const appearance = getStripeAppearance(currentTheme);

              return stripeClient.initCheckout({
                clientSecret: sessionData.clientSecret,
                elementsOptions: {
                  appearance: appearance
                }
              });
            })
            .then(function (checkout) {
              currentCheckout = checkout;
              state = 'confirm';
              isProcessing = false;

              checkoutContainer.hidden = false;

              const paymentMount = checkoutContainer.querySelector('[data-payment-mount]');
              if (!paymentMount) {
                throw new Error('Payment mount point not found.');
              }

              const paymentElement = checkout.createPaymentElement();
              paymentElement.mount(paymentMount);

              const buttonMount = checkoutContainer.querySelector('[data-button-mount]');
              if (buttonMount) {
                buttonMount.appendChild(contributeButton);
              }

              checkout.on('change', function (event) {
                if (event && event.session && event.session.amount_total != null && event.session.currency) {
                  const displayAmount = formatCurrency(event.session.amount_total, event.session.currency);
                  if (state === 'confirm' && !isProcessing) {
                    setButtonState(false, 'Confirm ' + displayAmount);
                  }
                }
              });

              return checkout.loadActions();
            })
            .then(function (actionsResult) {
              if (!actionsResult || actionsResult.type !== 'success') {
                throw new Error('Stripe is not available right now.');
              }
              currentActions = actionsResult.actions;

              setButtonState(false, 'Confirm');
            })
            .catch(function (error) {
              showMessage(error && error.message ? error.message : 'Something went wrong. Please try again.');
              resetToInitialState({ clearAmount: false });
            });
        }

        function confirmStripePayment() {
          if (!currentActions || typeof currentActions.confirm !== 'function') {
            return;
          }

          const emailInput = checkoutContainer.querySelector('[data-email-input]');
          const emailValue = emailInput ? emailInput.value.trim() : '';

          if (!emailValue) {
            showMessage('Enter your email address.');
            return;
          }

          state = 'processing';
          isProcessing = true;
          showMessage('');
          setButtonState(true, 'Processing…');

          Promise.resolve(currentActions.confirm({ email: emailValue }))
            .then(function (result) {
              if (result && result.type === 'error') {
                const message = result.error && result.error.message ? result.error.message : 'Something went wrong. Please try again.';
                showMessage(message);
                state = 'confirm';
                isProcessing = false;
                setButtonState(false, 'Confirm');
                return;
              }

              setButtonState(true, 'Redirecting...');
            })
            .catch(function (error) {
              showMessage(error && error.message ? error.message : 'Something went wrong. Please try again.');
              state = 'confirm';
              isProcessing = false;
              setButtonState(false, 'Confirm');
            });
        }

        window.addEventListener('themechange', function () {
          if (state === 'confirm' && currentClientSecret && stripeClient && !isProcessing) {
            const emailInput = checkoutContainer.querySelector('[data-email-input]');
            const savedEmail = emailInput ? emailInput.value.trim() : '';

            if (currentCheckout && typeof currentCheckout.destroy === 'function') {
              currentCheckout.destroy();
            }

            const currentTheme = getCurrentTheme();
            const appearance = getStripeAppearance(currentTheme);

            stripeClient.initCheckout({
              clientSecret: currentClientSecret,
              elementsOptions: {
                appearance: appearance
              }
            }).then(function (checkout) {
              currentCheckout = checkout;

              const paymentMount = checkoutContainer.querySelector('[data-payment-mount]');
              if (paymentMount) {
                const paymentElement = checkout.createPaymentElement();
                paymentElement.mount(paymentMount);
              }

              if (savedEmail && emailInput) {
                emailInput.value = savedEmail;
              }

              checkout.on('change', function (event) {
                if (event && event.session && event.session.amount_total != null && event.session.currency) {
                  const displayAmount = formatCurrency(event.session.amount_total, event.session.currency);
                  if (state === 'confirm' && !isProcessing) {
                    setButtonState(false, 'Confirm ' + displayAmount);
                  }
                }
              });

              return checkout.loadActions();
            }).then(function (actionsResult) {
              if (actionsResult && actionsResult.type === 'success') {
                currentActions = actionsResult.actions;
                setButtonState(false, 'Confirm');
              }
            }).catch(function () {
              setButtonState(true, 'Try again');
            });
          }
        });

        resetToInitialState({ clearAmount: false });
      }

      function formatCurrency(amountMinor, currency) {
        try {
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: (currency || 'USD').toUpperCase()
          }).format(amountMinor / 100);
        } catch (error) {
          return '$' + (amountMinor / 100).toFixed(2);
        }
      }

      // Mobile toggle functionality for schedule sections
      document.querySelectorAll('.schedule-section-toggle').forEach(function(toggle) {
        toggle.addEventListener('click', function() {
          const expanded = this.getAttribute('aria-expanded') === 'true';
          const nextExpanded = !expanded;
          const sectionId = this.getAttribute('data-section');
          const content = document.querySelector('[data-content="' + sectionId + '"]');

          if (content) {
            this.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
            animateDisclosure(content, nextExpanded);
          }
        });
      });
    })();
  `;
}
