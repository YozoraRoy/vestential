export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.ARENA_CRON_ENABLED !== 'true') return
  const { startArenaPhaseScheduler } = await import('@/lib/arena-scheduler')
  startArenaPhaseScheduler()
}