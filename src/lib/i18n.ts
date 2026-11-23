// src/lib/i18n.ts

import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';

const en = require('../../lang/en.json');
const tn = require('../../lang/tn.json');
const kck = require('../../lang/kck.json');

const i18n = new I18n({ en, tn, kck });

i18n.locale = getLocales()[0]?.languageCode ?? 'en';
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

// Explicit helper that always passes params through
export const t = (key: string, params?: Record<string, any>) => {
  return i18n.t(key, params ?? {});
};

export default i18n;