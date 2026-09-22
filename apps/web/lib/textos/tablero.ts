import type { Idioma } from '../idioma';

/** Rango de fechas que se intercala en las preguntas que el tablero le manda a WiBot. */
type Rango = { desde: string; hasta: string };

const en = {
  titulo: 'Dashboard',
  periodo: 'Period',
  mostrarWibot: 'Show WiBot',
  ocultarWibot: 'Hide WiBot',
  interpretar: 'Interpret',
  interpretarTitulo: 'Ask WiBot to interpret this',
  pestanaTablero: 'Dashboard',
  cargando: 'Querying the operation…',
  faltaGestionAntes: 'Surveys, leads and call data have not been imported yet. Run',
  faltaGestionDespues: '.',
  errorCarga: 'Could not load the dashboard.',
  errorConexion: 'Could not reach the server.',
  tarjetas: {
    cupones: {
      titulo: 'Coupons day by day',
      consulta: ({ desde, hasta }: Rango) =>
        `Look at the daily evolution of coupons between ${desde} and ${hasta}: explain the pattern, where the peaks and drops are, and what may be behind them.`,
    },
    concesionarios: {
      titulo: 'Dealers by volume',
      apoyo: 'coupons issued',
      consulta: ({ desde, hasta }: Rango) =>
        `Analyze the dealer ranking by coupons between ${desde} and ${hasta}: who leads, how concentrated it is and which dealer fell behind.`,
    },
    nps: {
      titulo: 'NPS by dealer',
      apoyo: 'only with 20 or more responses',
      consulta: ({ desde, hasta }: Rango) =>
        `Interpret the NPS by dealer between ${desde} and ${hasta}, considering only those with 20 or more responses: who is doing well, who is a concern and what should be reviewed.`,
    },
    temperatura: {
      titulo: 'Lead temperature',
      apoyo: 'share of the total',
      consulta: ({ desde, hasta }: Rango) =>
        `Interpret the breakdown of leads by temperature between ${desde} and ${hasta}: what it says about demand quality and what should be done with the super hot ones.`,
    },
    puntosDeVenta: {
      titulo: 'Points of sale',
      apoyo: 'leads received',
      consulta: ({ desde, hasta }: Rango) =>
        `Analyze the points of sale by leads received between ${desde} and ${hasta}, paying attention to how many are super hot in each one.`,
    },
    telefonia: {
      titulo: 'Phone service',
      apoyo: (atendidas: string, perdidas: string) => `${atendidas} answered · ${perdidas} missed`,
      pie: (enEspera: string) => `${enEspera} left on hold`,
      consulta: ({ desde, hasta }: Rango) =>
        `Interpret the phone answer rate between ${desde} and ${hasta}: is it good or bad for an after-sales contact center, and what is happening with the missed calls?`,
    },
    anexos: {
      titulo: 'Extensions missing the most calls',
      apoyo: 'unanswered calls',
      consulta: ({ desde, hasta }: Rango) =>
        `Analyze the phone extensions with the most missed calls between ${desde} and ${hasta}: which extension is most concerning and what would you recommend.`,
    },
  },
  indicadores: {
    cupones: 'Service coupons',
    cuponesApoyo: (locales: string, asesores: string) => `${locales} branches · ${asesores} advisors`,
    nps: 'After-sales NPS',
    respuestas: (cantidad: string) => `${cantidad} responses`,
    sinEncuestas: 'no surveys loaded',
    leads: 'CRM leads',
    superCalientes: (cantidad: string) => `${cantidad} super hot`,
    sinLeads: 'no leads loaded',
    atencion: 'Phone service',
    llamadas: (cantidad: string) => `${cantidad} calls`,
    sinLlamadas: 'no calls loaded',
    atendidasPorcentaje: (porcentaje: string) => `${porcentaje} % answered`,
  },
  temperaturas: {
    superCaliente: 'Super hot',
    caliente: 'Hot',
    tibio: 'Warm',
    frio: 'Cold',
  },
  errores: {
    fechasInvalidas: 'Provide "desde" and "hasta" in YYYY-MM-DD format.',
    rangoInvertido: 'The date range is reversed.',
    noSePudoArmar: 'Could not build the dashboard.',
    noEncontrado: 'Not found.',
    sesionExpirada: 'Your session has expired.',
  },
};

export const textosTablero: Record<Idioma, typeof en> = {
  en,
  zh: {
    titulo: '仪表板',
    periodo: '时间段',
    mostrarWibot: '显示 WiBot',
    ocultarWibot: '隐藏 WiBot',
    interpretar: '解读',
    interpretarTitulo: '让 WiBot 解读此图表',
    pestanaTablero: '仪表板',
    cargando: '正在查询运营数据…',
    faltaGestionAntes: '尚未导入问卷、线索和电话数据。请运行',
    faltaGestionDespues: '。',
    errorCarga: '无法加载仪表板。',
    errorConexion: '无法连接到服务器。',
    tarjetas: {
      cupones: {
        titulo: '每日服务券',
        consulta: ({ desde, hasta }: Rango) =>
          `请查看 ${desde} 至 ${hasta} 期间服务券的每日变化：解释其规律、高峰和低谷出现在哪里，以及背后可能的原因。`,
      },
      concesionarios: {
        titulo: '按数量排列的经销商',
        apoyo: '已发放的服务券',
        consulta: ({ desde, hasta }: Rango) =>
          `请分析 ${desde} 至 ${hasta} 期间按服务券数量排列的经销商排名：谁领先、集中程度如何，以及哪家经销商落后了。`,
      },
      nps: {
        titulo: '各经销商 NPS',
        apoyo: '仅限 20 份及以上回复',
        consulta: ({ desde, hasta }: Rango) =>
          `请解读 ${desde} 至 ${hasta} 期间各经销商的 NPS，仅考虑回复数在 20 份及以上的经销商：谁表现良好、谁令人担忧，以及需要检查什么。`,
      },
      temperatura: {
        titulo: '线索热度',
        apoyo: '占总数的比例',
        consulta: ({ desde, hasta }: Rango) =>
          `请解读 ${desde} 至 ${hasta} 期间按热度划分的线索分布：它说明了需求质量如何，以及应如何处理超热线索。`,
      },
      puntosDeVenta: {
        titulo: '销售网点',
        apoyo: '收到的线索',
        consulta: ({ desde, hasta }: Rango) =>
          `请分析 ${desde} 至 ${hasta} 期间各销售网点收到的线索，并关注每个网点中超热线索的数量。`,
      },
      telefonia: {
        titulo: '电话接听',
        apoyo: (atendidas: string, perdidas: string) => `已接听 ${atendidas} · 未接 ${perdidas}`,
        pie: (enEspera: string) => `${enEspera} 通仍在等待`,
        consulta: ({ desde, hasta }: Rango) =>
          `请解读 ${desde} 至 ${hasta} 期间的电话接听率：对于售后联络中心来说这是好是坏，未接来电又是怎么回事？`,
      },
      anexos: {
        titulo: '未接来电最多的分机',
        apoyo: '未接听的来电',
        consulta: ({ desde, hasta }: Rango) =>
          `请分析 ${desde} 至 ${hasta} 期间未接来电最多的电话分机：哪个分机最令人担忧，你有什么建议。`,
      },
    },
    indicadores: {
      cupones: '服务券',
      cuponesApoyo: (locales: string, asesores: string) => `${locales} 个网点 · ${asesores} 名顾问`,
      nps: '售后 NPS',
      respuestas: (cantidad: string) => `${cantidad} 份回复`,
      sinEncuestas: '尚未加载问卷',
      leads: 'CRM 线索',
      superCalientes: (cantidad: string) => `${cantidad} 条超热`,
      sinLeads: '尚未加载线索',
      atencion: '电话接听',
      llamadas: (cantidad: string) => `${cantidad} 通来电`,
      sinLlamadas: '尚未加载来电',
      atendidasPorcentaje: (porcentaje: string) => `已接听 ${porcentaje} %`,
    },
    temperaturas: {
      superCaliente: '超热',
      caliente: '热',
      tibio: '温',
      frio: '冷',
    },
    errores: {
      fechasInvalidas: '请以 YYYY-MM-DD 格式提供 "desde" 和 "hasta"。',
      rangoInvertido: '日期范围颠倒了。',
      noSePudoArmar: '无法生成仪表板。',
      noEncontrado: '未找到。',
      sesionExpirada: '你的会话已过期。',
    },
  },
};
