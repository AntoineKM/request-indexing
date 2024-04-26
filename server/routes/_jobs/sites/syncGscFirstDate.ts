import dayjs from 'dayjs'

import {
  siteDateAnalytics,
  sites,
} from '~/server/database/schema'
import { defineJobHandler } from '~/server/plugins/eventServiceProvider'
// import { wsUsers } from '~/server/routes/_ws'

export default defineJobHandler(async (event) => {
  const { siteId } = await readBody<{ siteId: number }>(event)

  const db = useDrizzle()
  const site = await db.query.sites.findFirst({
    with: {
      owner: true,
    },
    where: eq(sites.siteId, siteId),
  })

  if (!site || !site.owner) {
    throw createError({
      statusCode: 404,
      message: 'Site or User not found',
    })
  }

  const dates = await fetchGSCDates(site.owner.loginTokens, {
    period: {
      start: dayjs().subtract(500, 'days').toDate(),
      end: dayjs().subtract(499, 'days').toDate(),
    },
  }, site)

  const { rows, startDate } = dates
  // insert the rows
  if (rows.length) {
    await db.batch(rows.map((row) => {
      return db.insert(siteDateAnalytics).values({
        ...row,
        siteId,
      })
    }))
  }

  return {
    res: startDate,
  }
})
