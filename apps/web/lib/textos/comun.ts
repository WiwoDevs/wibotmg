import type { Idioma } from '../idioma';

const en = {
  idioma: 'Language',
  metaDescripcion: 'Ask MG Contact’s business data in plain language and get the figure with its period.',
};

export const textosComun: Record<Idioma, typeof en> = {
  en,
  zh: {
    idioma: '语言',
    metaDescripcion: '用自然语言询问 MG Contact 的业务数据，获得带有时间段的准确数字。',
  },
};
