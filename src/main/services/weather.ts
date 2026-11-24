import type {
  WeatherCityCandidate,
  WeatherCurrent,
  WeatherLocation,
  WeatherSnapshot,
  WeatherSnapshotResult,
} from '../../shared/ipc'

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const DEFAULT_TIMEOUT_MS = 8000
const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000
const DEFAULT_MIN_REFRESH_MS = 60 * 1000
const MAX_CANDIDATES = 5

const WEATHER_TEXT: Record<number, string> = {
  0: '晴',
  1: '大部晴朗',
  2: '局部多云',
  3: '阴',
  45: '雾',
  48: '霜雾',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  56: '冻毛毛雨',
  57: '强冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '强冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '小阵雨',
  81: '阵雨',
  82: '强阵雨',
  85: '小阵雪',
  86: '强阵雪',
  95: '雷暴',
  96: '雷暴伴小冰雹',
  99: '雷暴伴大冰雹',
}

export function weatherCodeText(code: number): string {
  return WEATHER_TEXT[code] ?? '未知天气'
}

export interface WeatherState {
  location: WeatherLocation | null
  /** 发起搜索的城市名，用于判断设置是否变化 */
  locationQuery: string | null
  snapshot: WeatherSnapshot | null
  lastFetchAt: number
}

export function createWeatherState(): WeatherState {
  return { location: null, locationQuery: null, snapshot: null, lastFetchAt: 0 }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeLocation(value: unknown): WeatherLocation | null {
  const record = asRecord(value)
  if (!record) return null

  const name = asString(record.name)?.trim()
  const latitude = asNumber(record.latitude)
  const longitude = asNumber(record.longitude)
  if (!name || latitude === null || longitude === null) return null

  return {
    name,
    admin1: asString(record.admin1) ?? '',
    country: asString(record.country) ?? '',
    latitude,
    longitude,
  }
}

function normalizeCurrent(value: unknown): WeatherCurrent | null {
  const record = asRecord(value)
  if (!record) return null

  const temperature = asNumber(record.temperature)
  const apparentTemperature = asNumber(record.apparentTemperature)
  const weatherCode = asNumber(record.weatherCode)
  const high = asNumber(record.high)
  const low = asNumber(record.low)
  const observedAt = asString(record.observedAt)
  if (
    temperature === null ||
    apparentTemperature === null ||
    weatherCode === null ||
    high === null ||
    low === null ||
    !observedAt
  ) {
    return null
  }

  return {
    temperature,
    apparentTemperature,
    condition: weatherCodeText(Math.round(weatherCode)),
    weatherCode: Math.round(weatherCode),
    high,
    low,
    precipitationProbability: asNumber(record.precipitationProbability) ?? 0,
    precipitation: asNumber(record.precipitation) ?? 0,
    humidity: asNumber(record.humidity) ?? 0,
    windSpeed: asNumber(record.windSpeed) ?? 0,
    isDay: record.isDay === true,
    observedAt,
  }
}

function normalizeSnapshot(value: unknown): WeatherSnapshot | null {
  const record = asRecord(value)
  if (!record) return null

  const location = normalizeLocation(record.location)
  const current = normalizeCurrent(record.current)
  const fetchedAt = asNumber(record.fetchedAt)
  if (!location || !current || fetchedAt === null || fetchedAt <= 0) return null

  return { location, current, fetchedAt: Math.round(fetchedAt) }
}

/** 读取 modules.json 时容错；非法结构回退空状态 */
export function normalizeWeatherState(value: unknown): WeatherState {
  const record = asRecord(value)
  if (!record) return createWeatherState()

  const snapshot = normalizeSnapshot(record.snapshot)
  const location = normalizeLocation(record.location) ?? snapshot?.location ?? null
  const locationQuery = asString(record.locationQuery) ?? location?.name ?? null
  const lastFetchAt = asNumber(record.lastFetchAt)

  return {
    location,
    locationQuery,
    snapshot,
    lastFetchAt: lastFetchAt !== null && lastFetchAt > 0 ? Math.round(lastFetchAt) : 0,
  }
}

export type FetchLike = typeof fetch

export interface WeatherServiceOptions {
  fetchImpl?: FetchLike
  now?: () => number
  timeoutMs?: number
  cacheTtlMs?: number
  minRefreshMs?: number
}

interface ResolveOutput {
  result: WeatherSnapshotResult
  state: WeatherState
}

function locationFromCandidate(candidate: WeatherCityCandidate): WeatherLocation {
  return {
    name: candidate.name,
    admin1: candidate.admin1,
    country: candidate.country,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
  }
}

function parseCandidate(value: unknown): WeatherCityCandidate | null {
  const record = asRecord(value)
  if (!record) return null

  const id = asNumber(record.id)
  const name = asString(record.name)?.trim()
  const latitude = asNumber(record.latitude)
  const longitude = asNumber(record.longitude)
  if (id === null || !name || latitude === null || longitude === null) return null

  return {
    id,
    name,
    admin1: asString(record.admin1) ?? '',
    country: asString(record.country) ?? '',
    latitude,
    longitude,
  }
}

export class WeatherService {
  private readonly fetchImpl: FetchLike
  private readonly now: () => number
  private readonly timeoutMs: number
  private readonly cacheTtlMs: number
  private readonly minRefreshMs: number

  constructor(options: WeatherServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? Date.now
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
    this.minRefreshMs = options.minRefreshMs ?? DEFAULT_MIN_REFRESH_MS
  }

  async searchCity(query: string): Promise<WeatherCityCandidate[]> {
    const trimmed = query.trim()
    if (!trimmed) return []

    const url = new URL(GEOCODE_URL)
    url.searchParams.set('name', trimmed)
    url.searchParams.set('count', String(MAX_CANDIDATES))
    url.searchParams.set('language', 'zh')
    url.searchParams.set('format', 'json')

    const data = asRecord(await this.fetchJson(url))
    const results = Array.isArray(data?.results) ? data.results : []

    return results
      .map(parseCandidate)
      .filter((candidate): candidate is WeatherCityCandidate => candidate !== null)
      .slice(0, MAX_CANDIDATES)
  }

  /** 城市选中后清空旧天气，避免把旧城市的数据显示到新城市 */
  selectCity(candidate: WeatherCityCandidate): WeatherState {
    return {
      location: locationFromCandidate(candidate),
      locationQuery: candidate.name,
      snapshot: null,
      lastFetchAt: 0,
    }
  }

  async resolve(city: string, state: WeatherState, refresh: boolean): Promise<ResolveOutput> {
    const trimmed = city.trim()
    if (!trimmed) {
      return {
        result: { configured: false, city: '', snapshot: null, stale: false, error: null },
        state,
      }
    }

    const now = this.now()
    let next = state

    if (!next.location || next.locationQuery !== trimmed) {
      let candidates: WeatherCityCandidate[]
      try {
        candidates = await this.searchCity(trimmed)
      } catch {
        return {
          result: {
            configured: true,
            city: trimmed,
            snapshot: null,
            stale: false,
            error: '暂时无法定位城市，请稍后再试。',
          },
          state: next,
        }
      }

      const first = candidates[0]
      if (!first) {
        return {
          result: {
            configured: true,
            city: trimmed,
            snapshot: null,
            stale: false,
            error: '没有找到这个城市。',
          },
          state: next,
        }
      }

      next = this.selectCity(first)
    }

    if (!refresh && next.snapshot && now - next.lastFetchAt < this.cacheTtlMs) {
      return { result: this.success(next.snapshot), state: next }
    }

    if (refresh && next.snapshot && now - next.lastFetchAt < this.minRefreshMs) {
      return { result: this.success(next.snapshot), state: next }
    }

    try {
      const snapshot = await this.fetchWeather(next.location as WeatherLocation, now)
      next = { ...next, snapshot, lastFetchAt: now }
      return { result: this.success(snapshot), state: next }
    } catch {
      return {
        result: {
          configured: true,
          city: trimmed,
          snapshot: next.snapshot,
          stale: next.snapshot !== null,
          error: next.snapshot ? '天气更新失败，显示上次结果。' : '暂时拿不到天气，请稍后再试。',
        },
        state: next,
      }
    }
  }

  private success(snapshot: WeatherSnapshot): WeatherSnapshotResult {
    return {
      configured: true,
      city: snapshot.location.name,
      snapshot,
      stale: false,
      error: null,
    }
  }

  private async fetchWeather(location: WeatherLocation, now: number): Promise<WeatherSnapshot> {
    const url = new URL(FORECAST_URL)
    url.searchParams.set('latitude', String(location.latitude))
    url.searchParams.set('longitude', String(location.longitude))
    url.searchParams.set(
      'current',
      'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m,is_day',
    )
    url.searchParams.set(
      'daily',
      'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    )
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set('forecast_days', '1')
    url.searchParams.set('temperature_unit', 'celsius')
    url.searchParams.set('wind_speed_unit', 'kmh')
    url.searchParams.set('precipitation_unit', 'mm')

    const data = asRecord(await this.fetchJson(url))
    const current = asRecord(data?.current)
    const daily = asRecord(data?.daily)
    if (!current || !daily) throw new Error('天气数据字段缺失')

    const temperature = asNumber(current.temperature_2m)
    const apparentTemperature = asNumber(current.apparent_temperature)
    const weatherCode = asNumber(current.weather_code)
    const high = Array.isArray(daily.temperature_2m_max)
      ? asNumber(daily.temperature_2m_max[0])
      : null
    const low = Array.isArray(daily.temperature_2m_min)
      ? asNumber(daily.temperature_2m_min[0])
      : null
    if (
      temperature === null ||
      apparentTemperature === null ||
      weatherCode === null ||
      high === null ||
      low === null
    ) {
      throw new Error('天气数值缺失')
    }

    const precipitationProbability = Array.isArray(daily.precipitation_probability_max)
      ? asNumber(daily.precipitation_probability_max[0])
      : null
    const code = Math.round(weatherCode)

    return {
      location,
      current: {
        temperature,
        apparentTemperature,
        condition: weatherCodeText(code),
        weatherCode: code,
        high,
        low,
        precipitationProbability: precipitationProbability ?? 0,
        precipitation: asNumber(current.precipitation) ?? 0,
        humidity: asNumber(current.relative_humidity_2m) ?? 0,
        windSpeed: asNumber(current.wind_speed_10m) ?? 0,
        isDay: current.is_day === 1,
        observedAt: asString(current.time) ?? new Date(now).toISOString(),
      },
      fetchedAt: now,
    }
  }

  private async fetchJson(url: URL): Promise<unknown> {
    let lastError: unknown

    // 最多 2 次尝试；超时与网络错误都走同一退路
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)

      try {
        const response = await this.fetchImpl(url.toString(), { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return await response.json()
      } catch (error) {
        lastError = error
      } finally {
        clearTimeout(timer)
      }
    }

    throw lastError instanceof Error ? lastError : new Error('天气请求失败')
  }
}
