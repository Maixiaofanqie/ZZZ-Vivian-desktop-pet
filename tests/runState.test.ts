import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { beginRun, endRun, readRunState, runStatePath } from '../src/main/services/runState'

const tempDirs: string[] = []

function createStatePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vivian-run-'))
  tempDirs.push(dir)
  return runStatePath(dir)
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  tempDirs.length = 0
})

describe('运行状态', () => {
  it('首次启动不视为崩溃，正常退出后下次启动也不视为崩溃', () => {
    const path = createStatePath()

    const first = beginRun(path, 1_000)
    expect(first.crashed).toBe(false)
    expect(first.state.cleanExit).toBe(false)

    endRun(path, first.state.startedAt, 2_000)

    const second = beginRun(path, 3_000)
    expect(second.crashed).toBe(false)
    expect(second.previous?.cleanExit).toBe(true)
    expect(second.previous?.endedAt).toBe(2_000)
  })

  it('未写正常退出标记时，下次启动标记为崩溃', () => {
    const path = createStatePath()

    beginRun(path, 1_000)
    const next = beginRun(path, 5_000)

    expect(next.crashed).toBe(true)
    expect(next.previous?.startedAt).toBe(1_000)
  })

  it('文件损坏或字段非法时回退为空状态，不抛错', () => {
    const path = createStatePath()
    writeFileSync(path, '{ broken json')

    expect(readRunState(path)).toBeNull()
    const run = beginRun(path, 1_000)
    expect(run.crashed).toBe(false)
  })

  it('正常退出写入 cleanExit 与结束时间', () => {
    const path = createStatePath()

    endRun(path, 1_000, 2_500)

    const state = readRunState(path)
    expect(state).toEqual({ startedAt: 1_000, cleanExit: true, endedAt: 2_500 })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ cleanExit: true })
  })
})
