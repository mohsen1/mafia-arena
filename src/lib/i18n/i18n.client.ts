import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { languages, fallbackLng, defaultNS } from './settings';

import enTranslation from '@/dictionaries/en.json';
import zhTranslation from '@/dictionaries/zh.json';
import hiTranslation from '@/dictionaries/hi.json';
import esTranslation from '@/dictionaries/es.json';
import frTranslation from '@/dictionaries/fr.json';
import arTranslation from '@/dictionaries/ar.json';
import bnTranslation from '@/dictionaries/bn.json';
import ptTranslation from '@/dictionaries/pt.json';
import ruTranslation from '@/dictionaries/ru.json';
import urTranslation from '@/dictionaries/ur.json';
import idTranslation from '@/dictionaries/id.json';
import deTranslation from '@/dictionaries/de.json';
import jaTranslation from '@/dictionaries/ja.json';
import swTranslation from '@/dictionaries/sw.json';
import trTranslation from '@/dictionaries/tr.json';
import viTranslation from '@/dictionaries/vi.json';
import koTranslation from '@/dictionaries/ko.json';
import itTranslation from '@/dictionaries/it.json';
import thTranslation from '@/dictionaries/th.json';
import faTranslation from '@/dictionaries/fa.json';
import plTranslation from '@/dictionaries/pl.json';
import ukTranslation from '@/dictionaries/uk.json';
import msTranslation from '@/dictionaries/ms.json';
import tlTranslation from '@/dictionaries/tl.json';
import taTranslation from '@/dictionaries/ta.json';
import mrTranslation from '@/dictionaries/mr.json';
import jvTranslation from '@/dictionaries/jv.json';
import teTranslation from '@/dictionaries/te.json';
import haTranslation from '@/dictionaries/ha.json';
import myTranslation from '@/dictionaries/my.json';

const resources = {
  en: { [defaultNS]: enTranslation },
  zh: { [defaultNS]: zhTranslation },
  hi: { [defaultNS]: hiTranslation },
  es: { [defaultNS]: esTranslation },
  fr: { [defaultNS]: frTranslation },
  ar: { [defaultNS]: arTranslation },
  bn: { [defaultNS]: bnTranslation },
  pt: { [defaultNS]: ptTranslation },
  ru: { [defaultNS]: ruTranslation },
  ur: { [defaultNS]: urTranslation },
  id: { [defaultNS]: idTranslation },
  de: { [defaultNS]: deTranslation },
  ja: { [defaultNS]: jaTranslation },
  sw: { [defaultNS]: swTranslation },
  tr: { [defaultNS]: trTranslation },
  vi: { [defaultNS]: viTranslation },
  ko: { [defaultNS]: koTranslation },
  it: { [defaultNS]: itTranslation },
  th: { [defaultNS]: thTranslation },
  fa: { [defaultNS]: faTranslation },
  pl: { [defaultNS]: plTranslation },
  uk: { [defaultNS]: ukTranslation },
  ms: { [defaultNS]: msTranslation },
  tl: { [defaultNS]: tlTranslation },
  ta: { [defaultNS]: taTranslation },
  mr: { [defaultNS]: mrTranslation },
  jv: { [defaultNS]: jvTranslation },
  te: { [defaultNS]: teTranslation },
  ha: { [defaultNS]: haTranslation },
  my: { [defaultNS]: myTranslation },
};

i18next
  .use(initReactI18next)
  .init({
    fallbackLng,
    ns: [defaultNS],
    defaultNS,
    supportedLngs: languages,
    resources,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18next; 