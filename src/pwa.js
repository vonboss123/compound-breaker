function isLocalDevelopmentHost(hostname) {
  const normalizedHostname = String(hostname ?? '').toLowerCase();
  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '[::1]'
  );
}

export function canRegisterServiceWorker(
  locationRef,
  secureContext,
  navigatorRef,
) {
  const supportsServiceWorkers = Boolean(
    navigatorRef && 'serviceWorker' in navigatorRef,
  );
  return (
    supportsServiceWorkers &&
    (secureContext === true || isLocalDevelopmentHost(locationRef?.hostname))
  );
}

function isIosDevice(navigatorRef) {
  const platform = String(navigatorRef?.platform ?? '');
  const userAgent = String(navigatorRef?.userAgent ?? '');
  const isTouchMac = platform === 'MacIntel' && navigatorRef?.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(`${platform} ${userAgent}`) || isTouchMac;
}

export function shouldShowIosInstallHint(navigatorRef, windowRef) {
  const isStandalone =
    navigatorRef?.standalone === true ||
    windowRef?.matchMedia?.('(display-mode: standalone)')?.matches === true;
  return isIosDevice(navigatorRef) && !isStandalone;
}

export function waitForActiveRegistration(registration, expectedScope) {
  if (!registration || registration.scope !== expectedScope) {
    return Promise.reject(new Error('Service worker registration has an invalid scope.'));
  }

  if (registration.active?.state === 'activated') {
    return Promise.resolve(registration);
  }

  const worker =
    registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) {
    return Promise.reject(new Error('Service worker registration has no active worker.'));
  }
  if (worker.state === 'activated') {
    return Promise.resolve(registration);
  }
  if (worker.state === 'redundant') {
    return Promise.reject(new Error('Service worker became redundant.'));
  }
  if (
    !['installing', 'installed', 'activating'].includes(worker.state) ||
    typeof worker.addEventListener !== 'function' ||
    typeof worker.removeEventListener !== 'function'
  ) {
    return Promise.reject(new Error('Service worker has an invalid lifecycle state.'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => worker.removeEventListener('statechange', onStateChange);
    const settle = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback(value);
    };
    const onStateChange = () => {
      if (worker.state === 'activated') {
        settle(resolve, registration);
      } else if (worker.state === 'redundant') {
        settle(reject, new Error('Service worker became redundant.'));
      }
    };

    worker.addEventListener('statechange', onStateChange);
    onStateChange();
  });
}

export function bootstrapPwa({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  navigatorRef = globalThis.navigator,
  locationRef = globalThis.location,
  secureContext = globalThis.isSecureContext === true,
  logger = globalThis.console,
} = {}) {
  if (!documentRef) {
    return null;
  }

  const installHint = documentRef.getElementById('install-hint');
  const status = documentRef.getElementById('pwa-status');
  if (installHint) {
    installHint.hidden = !shouldShowIosInstallHint(navigatorRef, windowRef);
  }

  let registrationPromise = Promise.resolve(null);
  if (canRegisterServiceWorker(locationRef, secureContext, navigatorRef)) {
    registrationPromise = navigatorRef.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((registration) => {
        if (status) {
          status.textContent = '离线缓存准备中';
        }
        const expectedScope = new URL('./', locationRef.href).href;
        return waitForActiveRegistration(registration, expectedScope);
      })
      .then((readyRegistration) => {
        if (status) {
          status.textContent = '离线模式已就绪';
        }
        return readyRegistration;
      })
      .catch(() => {
        if (status) {
          status.textContent = '离线模式暂不可用，游戏仍可继续';
        }
        logger?.warn?.('Compound Breaker service worker registration failed.');
        return null;
      });
  }

  return { registrationPromise };
}
