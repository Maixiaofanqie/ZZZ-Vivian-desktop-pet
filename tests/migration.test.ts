import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createWorkMemory } from '../src/main/store/memory'
import { migrateProfile } from '../src/main/store/migrations'
import { PROFILE_SCHEMA_VERSION } from '../src/shared/constants'

const v1Fixture = JSON.parse(
  readFileSync(new URL('./fixtures/profile-v1.json', import.meta.url), 'utf8'),
) as {
  schemaVersion: number
  coWork: { firstMetAt: number; interactionCount: number; lastInteractionAt: number }
}

describe('profile 迁移', () => {
  it('v1 升级到当前版本，共处记录原样保留', () => {
    const migrated = migrateProfile(v1Fixture)

    expect(migrated).not.toBeNull()
    expect(migrated?.schemaVersion).toBe(PROFILE_SCHEMA_VERSION)
    expect(migrated?.coWork).toEqual({
      firstMetAt: 1760000000000,
      interactionCount: 42,
      lastInteractionAt: 1760000005000,
    })
    expect(migrated?.memory).toEqual({
      activeDays: [],
      milestones: [],
      work: createWorkMemory(),
    })
  })

  it('v2 保留并归一化记忆，同时补空工作聚合', () => {
    const migrated = migrateProfile({
      schemaVersion: 2,
      coWork: { firstMetAt: 1, interactionCount: 3, lastInteractionAt: 2 },
      memory: {
        activeDays: ['2026-10-23', 'bad'],
        milestones: [{ id: 'days-7', reachedAt: 10, seen: false }],
      },
    })

    expect(migrated?.memory.activeDays).toEqual(['2026-10-23'])
    expect(migrated?.memory.milestones).toEqual([{ id: 'days-7', reachedAt: 10, seen: false }])
    expect(migrated?.memory.work).toEqual(createWorkMemory())
  })

  it('v3 保留工作聚合', () => {
    const work = {
      lastProjectName: 'demo-project',
      lastActiveAt: 10,
      sessionCount: 5,
      projectCount: 3,
      updatedAt: 20,
    }
    const migrated = migrateProfile({
      schemaVersion: 3,
      coWork: { firstMetAt: 1, interactionCount: 3, lastInteractionAt: 2 },
      memory: { activeDays: [], milestones: [], work },
    })

    expect(migrated?.schemaVersion).toBe(PROFILE_SCHEMA_VERSION)
    expect(migrated?.memory.work).toEqual(work)
  })

  it('缺少或损坏共处记录时拒绝迁移', () => {
    expect(migrateProfile({ schemaVersion: 1 })).toBeNull()
    expect(
      migrateProfile({
        schemaVersion: 1,
        coWork: { firstMetAt: 0, interactionCount: 0, lastInteractionAt: null },
      }),
    ).toBeNull()
  })

  it('无法识别的版本或非对象输入返回 null', () => {
    expect(migrateProfile({ schemaVersion: 99, coWork: v1Fixture.coWork })).toBeNull()
    expect(migrateProfile({ schemaVersion: '1', coWork: v1Fixture.coWork })).toBeNull()
    expect(migrateProfile(null)).toBeNull()
    expect(migrateProfile('oops')).toBeNull()
  })
})
