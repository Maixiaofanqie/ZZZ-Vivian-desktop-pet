import { describe, expect, it, vi } from 'vitest'
import {
  createWeatherState,
  normalizeWeatherState,
  WeatherService,
  weatherCodeText,
} from '../src/main/services/weather'

const NOW = 1_800_000_000_000
const HOUR = 60 * 60 * 1000

const GEO = {
  results: [
    {
      id: 1796236,
      name: '上海',
      admin1: '上海市',
      country: '中国',
      latitude: 31.22222,
      longitude: 121.45806,
    },
    {
      id: 1796237,
      name: '上海',
      admin1: '广西',
      country: '中国',
      latitude: 24.0,
      longitude: 108.0,
    },
  ],
}

const FORECAST = {
  current: {
    time: '2026-10-24T21:30',
    temperature_2m: 20.8,
    apparent_temperature: 21.1,
    precipitation: 0,
    weather_code: 3,
    wind_speed_10m: 17.6,
    relative_humidity_2m: 84,
    is_day: 1,
  },
  daily: {
    temperature_2m_max: [21.1],
    temperature_2m_min: [18.1],
    precipitation_probability_max: [100],
  },
}

function response(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => data } as Response
}

function createService(
  impl: (url: string) => Promise<Response> | Response,
  options: { now?: () => number; cacheTtlMs?: number; minRefreshMs?: number } = {},
) {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => impl(String(input)))
  const service = new WeatherService({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: options.now ?? (() => NOW),
    cacheTtlMs: options.cacheTtlMs,
    minRefreshMs: options.minRefreshMs,
  })
  return { service, fetchImpl }
}

function contentAwareFetch(url: string): Response {
  return url.includes('geocoding-api') ? response(GEO) : response(FORECAST)
}

describe('天气服务', () => {
  it('WMO 天气代码映射为中文', () => {
    expect(weatherCodeText(0)).toBe('晴')
    expect(weatherCodeText(3)).toBe('阴')
    expect(weatherCodeText(61)).toBe('小雨')
    expect(weatherCodeText(95)).toBe('雷暴')
    expect(weatherCodeText(999)).toBe('未知天气')
  })

  it('城市搜索编码查询并解析候选', async () => {
    const { service, fetchImpl } = createService(() => response(GEO))

    const candidates = await service.searchCity('上海')

    expect(candidates).toHaveLength(2)
    expect(candidates[0]?.name).toBe('上海')
    expect(candidates[0]?.latitude).toBe(31.22222)
    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]))
    expect(url.hostname).toBe('geocoding-api.open-meteo.com')
    expect(url.searchParams.get('name')).toBe('上海')
    expect(url.searchParams.get('language')).toBe('zh')
  })

  it('定位并获取天气，30 分钟内复用缓存', async () => {
    const { service, fetchImpl } = createService(contentAwareFetch)

    const first = await service.resolve('上海', createWeatherState(), true)
    expect(first.result.configured).toBe(true)
    expect(first.result.snapshot?.current).toMatchObject({
      temperature: 20.8,
      apparentTemperature: 21.1,
      condition: '阴',
      high: 21.1,
      low: 18.1,
      precipitationProbability: 100,
      humidity: 84,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    const cached = await service.resolve('上海', first.state, false)
    expect(cached.result.snapshot).toEqual(first.result.snapshot)
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    const manual = await service.resolve('上海', first.state, true)
    expect(manual.result.snapshot).toEqual(first.result.snapshot)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('缓存过期后重新请求', async () => {
    let now = NOW
    const { service, fetchImpl } = createService(contentAwareFetch, {
      now: () => now,
      cacheTtlMs: 30 * 60 * 1000,
    })

    const first = await service.resolve('上海', createWeatherState(), false)
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    now += HOUR
    await service.resolve('上海', first.state, false)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('手动刷新在 1 分钟内复用缓存', async () => {
    let now = NOW
    const { service, fetchImpl } = createService(contentAwareFetch, {
      now: () => now,
      minRefreshMs: 60 * 1000,
    })

    const first = await service.resolve('上海', createWeatherState(), true)
    now += 30 * 1000
    await service.resolve('上海', first.state, true)

    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('请求失败时返回旧缓存并标记', async () => {
    let failing = false
    let now = NOW
    const { service } = createService(
      (url) => {
        if (failing && !url.includes('geocoding-api')) throw new Error('network')
        return contentAwareFetch(url)
      },
      { now: () => now },
    )

    const first = await service.resolve('上海', createWeatherState(), true)
    failing = true
    now += 31 * 60 * 1000
    const failed = await service.resolve('上海', first.state, false)

    expect(failed.result.snapshot).toEqual(first.result.snapshot)
    expect(failed.result.stale).toBe(true)
    expect(failed.result.error).toContain('更新失败')
  })

  it('无缓存且请求失败时返回空状态', async () => {
    const { service } = createService((url) => {
      if (url.includes('geocoding-api')) return response(GEO)
      throw new Error('network')
    })

    const result = await service.resolve('上海', createWeatherState(), false)

    expect(result.result.configured).toBe(true)
    expect(result.result.snapshot).toBeNull()
    expect(result.result.error).toBeTruthy()
  })

  it('请求失败最多尝试两次', async () => {
    const { service, fetchImpl } = createService(() => {
      throw new Error('network')
    })
    const state = {
      location: {
        name: '上海',
        admin1: '上海市',
        country: '中国',
        latitude: 31.22,
        longitude: 121.45,
      },
      locationQuery: '上海',
      snapshot: null,
      lastFetchAt: 0,
    }

    await service.resolve('上海', state, false)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('城市变更时清空旧天气', () => {
    const { service } = createService(contentAwareFetch)
    const current = service.selectCity({
      id: 1,
      name: '上海',
      admin1: '上海市',
      country: '中国',
      latitude: 31.22,
      longitude: 121.45,
    })

    expect(current.snapshot).toBeNull()
    expect(current.locationQuery).toBe('上海')
  })

  it('归一化损坏的天气状态', () => {
    expect(normalizeWeatherState(null)).toEqual(createWeatherState())
    expect(normalizeWeatherState({ location: { name: '上海' } })).toEqual(createWeatherState())

    const valid = normalizeWeatherState({
      location: {
        name: '上海',
        admin1: '上海市',
        country: '中国',
        latitude: 31.22,
        longitude: 121.45,
      },
      locationQuery: '上海',
      lastFetchAt: NOW,
      snapshot: {
        location: {
          name: '上海',
          admin1: '上海市',
          country: '中国',
          latitude: 31.22,
          longitude: 121.45,
        },
        current: {
          temperature: 20,
          apparentTemperature: 21,
          weatherCode: 3,
          high: 22,
          low: 18,
          precipitationProbability: 10,
          precipitation: 0,
          humidity: 80,
          windSpeed: 5,
          isDay: true,
          observedAt: '2026-10-24T21:30',
        },
        fetchedAt: NOW,
      },
    })

    expect(valid.snapshot?.current.condition).toBe('阴')
    expect(valid.locationQuery).toBe('上海')
  })
})
