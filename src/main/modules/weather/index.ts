import { z } from 'zod'
import type { WeatherCityCandidate, WeatherSnapshotResult } from '../../../shared/ipc'
import type { WeatherSettings } from '../../../shared/modules'
import {
  createWeatherState,
  normalizeWeatherState,
  WeatherService,
  type WeatherState,
} from '../../services/weather'
import { updateModuleSettingsById } from '../../store/settings'
import type { ModuleContext, PetModule } from '../types'

const settingsSchema = z.object({
  enabled: z.boolean(),
  city: z.string().max(40),
})

const getSnapshotSchema = z.object({ refresh: z.boolean().optional() })
const searchSchema = z.object({ query: z.string().trim().min(1).max(40) })
const candidateSchema = z.object({
  id: z.number().int(),
  name: z.string().trim().min(1).max(80),
  admin1: z.string().max(80),
  country: z.string().max(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

let ctx: ModuleContext | null = null
let service: WeatherService | null = null
let state: WeatherState = createWeatherState()

function emptyResult(): WeatherSnapshotResult {
  return { configured: false, city: '', snapshot: null, stale: false, error: null }
}

async function resolveSnapshot(refresh: boolean): Promise<WeatherSnapshotResult> {
  if (!ctx || !service) return emptyResult()

  const city = ctx.getSettings<WeatherSettings>().city.trim()
  const resolved = await service.resolve(city, state, refresh)
  if (resolved.state !== state) {
    state = resolved.state
    ctx.setState(state)
  }

  return resolved.result
}

async function setup(context: ModuleContext): Promise<void> {
  ctx = context
  service = new WeatherService()
  state = normalizeWeatherState(context.getState<WeatherState>())

  context.ipc.handle('weather:get-snapshot', getSnapshotSchema, (payload) =>
    resolveSnapshot(payload.refresh === true),
  )

  context.ipc.handle('weather:search-city', searchSchema, async (payload) => {
    if (!service) return []
    return service.searchCity(payload.query)
  })

  context.ipc.handle('weather:select-city', candidateSchema, async (payload) => {
    if (!ctx || !service) return emptyResult()

    const candidate = payload as WeatherCityCandidate
    state = service.selectCity(candidate)
    ctx.setState(state)
    updateModuleSettingsById('weather', { city: candidate.name })

    return resolveSnapshot(true)
  })
}

async function dispose(): Promise<void> {
  service = null
  ctx = null
  state = createWeatherState()
}

export const weatherModule: PetModule = {
  id: 'weather',
  title: '天气',
  description: '在功能面板查看天气；城市可在设置中搜索并选择',
  defaultEnabled: true,
  panelPage: {
    id: 'weather',
    title: '天气',
    description: '当前天气、体感、最高/最低与降水概率',
    order: 20,
  },
  settingsSchema,
  setup,
  dispose,
}
