// Ensures libraries that still expect React 18 internals keep working on React 19.
import * as React from 'react';

type ReactWithInternals = typeof React & {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?: unknown;
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: unknown;
  __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: unknown;
};

const reactAny = React as ReactWithInternals;

const internals =
  reactAny.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ??
  reactAny.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

if (internals) {
  const internalsAny = internals as Record<string, unknown>;
  if (!reactAny.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED) {
    reactAny.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = internals;
  }

  const aliasMap = {
    ReactCurrentDispatcher: 'H',
    ReactCurrentOwner: 'A',
    ReactCurrentBatchConfig: 'T',
    ReactCurrentCache: 'S',
  } as const;

  for (const [legacyName, modernKey] of Object.entries(aliasMap)) {
    const modernValue = internalsAny[modernKey];

    if (modernKey === 'T' && modernValue == null) {
      internalsAny[modernKey] = { transition: null };
    }

    if (!(legacyName in internalsAny)) {
      Object.defineProperty(internalsAny, legacyName, {
        configurable: true,
        enumerable: false,
        get: () => internalsAny[modernKey],
        set: (value) => {
          internalsAny[modernKey] = value;
        },
      });
    }
  }
}

export {}; // keep as module
