import { asc, avg, between, count, desc, gt, ilike, isNotNull } from 'drizzle-orm'
import { authenticateUser } from '~/server/app/utils/auth'
import {
  siteDateAnalytics, sitePageSpeedInsightScanAudits, sitePageSpeedInsightScans,
  sitePathDateAnalytics,
  sites,
} from '~/server/database/schema'
import { userPeriodRange } from '~/server/app/models/User'

export default defineEventHandler(async (e) => {
  // extract from db
  const user = await authenticateUser(e)
  const { siteId } = getRouterParams(e, { decode: true })
  const site = await useDrizzle().query.sites.findFirst({
    where: eq(sites.publicId, siteId),
  })
  if (!site) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Site not found',
    })
  }
  const { filters, offset, q, sort, pageSize } = getQueryAsyncDataTable<
    'top-level' | 'new' | 'lost' | 'improving' | 'declining' | 'trending'
  >(e)
  const range = userPeriodRange(user)
  const _where = [
    eq(sitePathDateAnalytics.siteId, site.siteId),
    or(
      isNotNull(sitePathDateAnalytics.mobileCls75),
      isNotNull(sitePathDateAnalytics.mobileTtfb75),
      isNotNull(sitePathDateAnalytics.mobileFcp75),
      isNotNull(sitePathDateAnalytics.mobileLcp75),
      isNotNull(sitePathDateAnalytics.mobileInp75),
    ),
    // isNotNull(sitePathDateAnalytics.mobileInp75),
  ]
  // if (q?.length)
  //   _where.push(ilike(sitePathDateAnalytics.path, `%${q}%`))
  const sq = useDrizzle()
    .select({
      path: sitePathDateAnalytics.path,
      mobileCls75: avg(sitePathDateAnalytics.mobileCls75).mapWith(Number).as('mobileCls75'),
      mobileTtfb75: avg(sitePathDateAnalytics.mobileTtfb75).mapWith(Number).as('mobileTtfb75'),
      mobileFcp75: avg(sitePathDateAnalytics.mobileFcp75).mapWith(Number).as('mobileFcp75'),
      mobileLcp75: avg(sitePathDateAnalytics.mobileLcp75).mapWith(Number).as('mobileLcp75'),
      mobileInp75: avg(sitePathDateAnalytics.mobileInp75).mapWith(Number).as('mobileInp75'),
    })
    .from(sitePathDateAnalytics)
    .where(and(
      between(sitePathDateAnalytics.date, range.period.startDate, range.period.endDate),
      ..._where,
    ))
    .groupBy(sitePathDateAnalytics.path)
    .as('sq')

  // we're going to get previous period data so we can join it and compute differences
  // const sq2 = useDrizzle()
  //   .select({
  //     path: sitePathDateAnalytics.path,
  //     prevPsiDesktopPerformance: avg(sitePathDateAnalytics.psiDesktopPerformance).as('prevPsiDesktopPerformance'),
  //     prevPsiDesktopSeo: avg(sitePathDateAnalytics.psiDesktopSeo).as('prevPsiDesktopSeo'),
  //     prevPsiDesktopAccessibility: avg(sitePathDateAnalytics.psiDesktopAccessibility).as('prevPsiDesktopAccessibility'),
  //     prevPsiDesktopBestPractices: avg(sitePathDateAnalytics.psiDesktopBestPractices).as('prevPsiDesktopBestPractices'),
  //     prevPsiDesktopScore: avg(sitePathDateAnalytics.psiDesktopScore).as('prevPsiDesktopScore'),
  //   })
  //   .from(sitePathDateAnalytics)
  //   .where(and(
  //     between(sitePathDateAnalytics.date, range.prevPeriod.startDate, range.prevPeriod.endDate),
  //     ..._where,
  //   ))
  //   .groupBy(sitePathDateAnalytics.path)
  //   .as('sq2')
  //
  // let finalWhere
  // if (filters.includes('improving')) {
  //   finalWhere = gt(sq.psiDesktopPerformance, sq2.prevPsiDesktopPerformance)
  // }
  // else if (filters.includes('declining')) {
  //   finalWhere = gt(sq2.prevPsiDesktopPerformance, sq.psiDesktopPerformance)
  // }

  const pagesSelect = useDrizzle().select({
    path: sq.path,
    mobileCls75: sq.mobileCls75,
    mobileTtfb75: sq.mobileTtfb75,
    mobileFcp75: sq.mobileCls75,
    mobileLcp75: sq.mobileLcp75,
    mobileInp75: sq.mobileInp75,
    // prevPsiDesktopPerformance: sq2.prevPsiDesktopPerformance,
    // prevPsiDesktopSeo: sq2.prevPsiDesktopSeo,
    // prevPsiDesktopAccessibility: sq2.prevPsiDesktopAccessibility,
    // prevPsiDesktopBestPractices: sq2.prevPsiDesktopBestPractices,
    // prevPsiDesktopScore: sq2.prevPsiDesktopScore,
  })
    .from(sq)
    // .leftJoin(sq2, filter === 'top-level' ? sql`sq.topLevelPath1 = sq2.topLevelPath2` : eq(sq.path, sq2.path))
    // .where(finalWhere)
    .orderBy(desc(sq.path))
    .as('pagesSelect')

  const pages = await useDrizzle().select()
    .from(pagesSelect)
    .orderBy(sort.column ? (sort.direction === 'asc' ? asc(pagesSelect[sort.column]) : desc(pagesSelect[sort.column])) : asc(pagesSelect.path))
    .offset(offset)
    .limit(pageSize)

  const totals = await useDrizzle().select({
    count: count().as('total'),
    // totalAvgDesktop: avg(sq.psiDesktopPerformance).as('psiDesktopScore'),
    // totalAvgMobile: avg(sq.psiMobilePerformance).as('psiMobilePerformance'),
  })
    .from(pagesSelect)

  const crux = await useDrizzle().select({
    date: siteDateAnalytics.date,
    mobileOriginCls75: siteDateAnalytics.mobileOriginCls75,
    mobileOriginTtfb75: siteDateAnalytics.mobileOriginTtfb75,
    mobileOriginFcp75: siteDateAnalytics.mobileOriginFcp75,
    mobileOriginLcp75: siteDateAnalytics.mobileOriginLcp75,
    mobileOriginInp75: siteDateAnalytics.mobileOriginInp75,
    desktopOriginCls75: siteDateAnalytics.desktopOriginCls75,
    desktopOriginTtfb75: siteDateAnalytics.desktopOriginTtfb75,
    desktopOriginFcp75: siteDateAnalytics.desktopOriginFcp75,
    desktopOriginLcp75: siteDateAnalytics.desktopOriginLcp75,
    desktopOriginInp75: siteDateAnalytics.desktopOriginInp75,
  })
    .from(siteDateAnalytics)
    .where(and(
      eq(siteDateAnalytics.siteId, site.siteId),
      // between(siteDateAnalytics.date, range.period.startDate, range.period.endDate),
      // make sure we have values for at least one of them
      or(
        isNotNull(siteDateAnalytics.mobileOriginCls75),
        isNotNull(siteDateAnalytics.mobileOriginTtfb75),
        isNotNull(siteDateAnalytics.mobileOriginFcp75),
        isNotNull(siteDateAnalytics.mobileOriginLcp75),
        isNotNull(siteDateAnalytics.mobileOriginInp75),
      ),
    ))
  // let syntheticWebVitals = []
  //
  // // TODO use hasCruxOriginData
  // if (!site.hasCruxOriginData || !crux.length) {
  //   syntheticWebVitals = await useDrizzle().select({
  //     date: sitePathDateAnalytics.date,
  //     desktopCls: avg(sitePathDateAnalytics.psiDesktopCls).mapWith(Number).as('desktopCls'),
  //     desktopFcp: avg(sitePathDateAnalytics.psiDesktopFcp).mapWith(Number).as('desktopFcp'),
  //     desktopLcp: avg(sitePathDateAnalytics.psiDesktopLcp).mapWith(Number).as('desktopLcp'),
  //     desktopTbt: avg(sitePathDateAnalytics.psiDesktopTbt).mapWith(Number).as('desktopTbt'),
  //     desktopSi: avg(sitePathDateAnalytics.psiDesktopSi).mapWith(Number).as('desktopSi'),
  //     mobileCls: avg(sitePathDateAnalytics.psiMobileCls).mapWith(Number).as('mobileCls'),
  //     mobileFcp: avg(sitePathDateAnalytics.psiMobileFcp).mapWith(Number).as('mobileFcp'),
  //     mobileLcp: avg(sitePathDateAnalytics.psiMobileLcp).mapWith(Number).as('mobileLcp'),
  //     mobileTbt: avg(sitePathDateAnalytics.psiMobileTbt).mapWith(Number).as('mobileTbt'),
  //     mobileSi: avg(sitePathDateAnalytics.psiMobileSi).mapWith(Number).as('mobileSi'),
  //   })
  //     .from(sitePathDateAnalytics)
  //     .where(and(
  //       eq(sitePathDateAnalytics.siteId, site.siteId),
  //     ))
  //     .groupBy(sitePathDateAnalytics.date)
  //     .having(isNotNull(sitePathDateAnalytics.psiDesktopCls))
    // const sq = useDrizzle().select()
    //   .from(sitePageSpeedInsightScanAudits)
    //   .leftJoin(sitePathDateAnalytics, eq(sitePageSpeedInsightScanAudits.sitePageSpeedInsightScanId, sitePageSpeedInsightScans.sitePageSpeedInsightScanId))
    //   .where(and(
    //     eq(sitePageSpeedInsightScans.siteId, site.siteId),
    //   ))
    //   .as('sq')
    // const clsSq = useDrizzle()
    //   .select({
    //     cls: avg(sitePageSpeedInsightScanAudits.numericValue).as('cls'),
    //   })
    //   .from(sq)
    //   .where(and(
    //     eq(sitePageSpeedInsightScanAudits.auditId, 'cumulative-layout-shift'),
    //   ))
    //   .as('clsSq')
    // // we can use sitePageSpeedInsightScanAudits data
    // syntheticWebVitals = await useDrizzle().select({
    //   // need to convert createdAt to date in format yyyy-mm-dd
    //   date: sql`DATE_FORMAT(${sitePageSpeedInsightScanAudits.createdAt}, '%Y-%m-%d')`.as('date'),
    //   cls: clsSq,
    // })
    //   .from(sq)
    //   .leftJoin(sitePathDateAnalytics, eq(sitePageSpeedInsightScanAudits.sitePageSpeedInsightScanId, sitePageSpeedInsightScans.sitePageSpeedInsightScanId))
    //   .where(and(
    //     eq(sitePageSpeedInsightScans.siteId, site.siteId),
    //   ))
  // }

  return {
    rows: pages,
    total: totals[0].count,
    totals: totals[0],
    // syntheticWebVitals,
    crux,
  }
})