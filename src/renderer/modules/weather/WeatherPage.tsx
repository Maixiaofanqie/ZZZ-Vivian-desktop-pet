import { useCallback, useEffect, useState } from 'react'
import type { WeatherSnapshotResult } from '../../../shared/ipc'
import { WeatherGlyph } from '../../ui/panelIcons'
import { PanelState, RefreshButton } from '../../ui/panelParts'

const REFRESH_INTERVAL_MS = 30 * 60 * 1000

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function rounded(value: number): string {
  return `${Math.round(value)}°`
}

export function WeatherPage() {
  const [result, setResult] = useState<WeatherSnapshotResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (refresh: boolean): Promise<void> => {
    if (refresh) setRefreshing(true)

    try {
      const data = await window.vivian.weather.getSnapshot({ refresh })
      setResult(data)
      setError(null)
    } catch {
      setError('读取天气失败。')
    } finally {
      if (refresh) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(true)

    const refreshIfVisible = (): void => {
      if (document.visibilityState === 'visible') void load(true)
    }
    const refreshOnFocus = (): void => {
      if (document.visibilityState === 'visible') void load(false)
    }
    const timer = window.setInterval(refreshIfVisible, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshOnFocus)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [load])

  if (error && !result) {
    return (
      <PanelState
        kind="error"
        title={error}
        hint="请稍后重试；天气只访问 Open-Meteo。"
        action={{ label: '重试', onClick: () => void load(true), disabled: refreshing }}
      />
    )
  }

  if (!result) {
    return <PanelState kind="loading" title="正在查看天气…" hint="读取最近一次天气记录。" />
  }

  if (!result.configured) {
    return (
      <PanelState
        kind="empty"
        title="还没有设置城市。"
        hint="请先在设置中搜索并选择城市，薇薇安才能看到天气。"
      />
    )
  }

  const snapshot = result.snapshot

  if (!snapshot) {
    return (
      <div>
        <div className="panel-toolbar">
          <span className="panel-updated">尚未获取天气</span>
          <RefreshButton busy={refreshing} onClick={() => void load(true)} />
        </div>
        {result.error && (
          <p className="panel-action-message" role="status">
            {result.error}
          </p>
        )}
        <PanelState
          kind="empty"
          title="暂时拿不到天气。"
          hint="请检查网络，或稍后点「刷新」再试。"
        />
      </div>
    )
  }

  const { location, current } = snapshot
  const region = [location.admin1, location.country].filter(Boolean).join(' · ')

  return (
    <div>
      <div className="panel-toolbar">
        <span className="panel-updated">更新于 {formatTime(snapshot.fetchedAt)}</span>
        <RefreshButton busy={refreshing} onClick={() => void load(true)} />
      </div>

      {result.error && (
        <p className="panel-action-message" role="status">
          {result.error}
        </p>
      )}

      <section className="weather-card">
        <div className="weather-head">
          <div className="weather-place">
            <p className="weather-city">{location.name}</p>
            {region && <p className="weather-region">{region}</p>}
            <p className="weather-condition">{current.condition}</p>
          </div>
          <div className="weather-readout">
            <span className="weather-glyph">
              <WeatherGlyph code={current.weatherCode} isDay={current.isDay} />
            </span>
            <p className="weather-temperature">{rounded(current.temperature)}</p>
          </div>
        </div>

        <dl className="weather-details">
          <div className="weather-stat">
            <dt>体感</dt>
            <dd>{rounded(current.apparentTemperature)}</dd>
          </div>
          <div className="weather-stat">
            <dt>最高 / 最低</dt>
            <dd>
              {rounded(current.high)} / {rounded(current.low)}
            </dd>
          </div>
          <div className="weather-stat">
            <dt>降水概率</dt>
            <dd>{Math.round(current.precipitationProbability)}%</dd>
          </div>
          <div className="weather-stat">
            <dt>湿度</dt>
            <dd>{Math.round(current.humidity)}%</dd>
          </div>
          <div className="weather-stat">
            <dt>风速</dt>
            <dd>{Math.round(current.windSpeed)} km/h</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
