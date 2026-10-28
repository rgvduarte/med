import { describe, expect, it } from 'vitest'
import { cleanSeriesDescription, sampleFrameIndices, slicePosition, storedPixelValues, writeYbrFull } from './dicom'
import { combineBurnedIn, sortInstances } from './ingest'
import { distinctTimes } from './video'

describe('cleanSeriesDescription', () => {
  it('keeps acquisition and anatomy descriptors only', () => {
    expect(cleanSeriesDescription('PUNHO DTO PA')).toBe('PUNHO DTO PA')
    expect(cleanSeriesDescription('Joao Silva 1234567 wrist lat')).toBe('WRIST LAT')
    expect(cleanSeriesDescription('cor_t1_fs')).toBe('COR T1 FS')
    expect(cleanSeriesDescription('Mão esquerda — oblíqua')).toBe('MAO ESQUERDA OBLIQUA')
    expect(cleanSeriesDescription('Maria Santos')).toBe('')
    expect(cleanSeriesDescription(undefined)).toBe('')
  })
})

describe('storedPixelValues', () => {
  it('masks bits above HighBit (e.g. overlays) for unsigned data', () => {
    const raw = new Uint16Array([0x0fff, 0xf123, 0x8000])
    expect([...storedPixelValues(raw, 12, 11, false)]).toEqual([0x0fff, 0x0123, 0])
  })
  it('sign-extends signed 12-bit data', () => {
    const raw = new Uint16Array([0x0fff, 0x0800, 0x07ff, 0xf001])
    const out = storedPixelValues(raw, 12, 11, true)
    expect(out).toBeInstanceOf(Int16Array)
    expect([...out]).toEqual([-1, -2048, 2047, 1])
  })
  it('honours a HighBit above BitsStored - 1', () => {
    const raw = new Uint16Array([0xfff0])
    expect([...storedPixelValues(raw, 12, 15, false)]).toEqual([0x0fff])
  })
  it('returns full-width data untouched, and reads 16-bit signed as Int16', () => {
    const raw = new Uint16Array([1, 0xffff])
    expect(storedPixelValues(raw, 16, 15, false)).toBe(raw)
    expect([...storedPixelValues(raw, 16, 15, true)]).toEqual([1, -1])
    expect([...storedPixelValues(new Uint8Array([0xff, 0x01]), 8, 7, true)]).toEqual([-1, 1])
  })
})

describe('writeYbrFull', () => {
  it('converts BT.601 full-range YCbCr to RGB', () => {
    const px = new Uint8ClampedArray(12)
    writeYbrFull(px, 0, 128, 128, 128) // grey
    writeYbrFull(px, 4, 76, 85, 255) // ≈ pure red
    writeYbrFull(px, 8, 255, 128, 255) // clamps
    expect([...px.slice(0, 4)]).toEqual([128, 128, 128, 255])
    expect(px[4]).toBeGreaterThan(250)
    expect(px[5]).toBeLessThan(5)
    expect(px[6]).toBeLessThan(5)
    expect(px[8]).toBe(255)
  })
})

describe('sampleFrameIndices', () => {
  it('keeps every frame when they fit and spreads the picks over the whole sequence otherwise', () => {
    expect(sampleFrameIndices(3, 32)).toEqual([0, 1, 2])
    const picks = sampleFrameIndices(100, 32)
    expect(picks).toHaveLength(32)
    expect(picks[0]).toBe(0)
    expect(picks[31]).toBe(99)
    expect(new Set(picks).size).toBe(32)
    expect(sampleFrameIndices(5, 1)).toEqual([0])
  })
})

describe('series grouping', () => {
  it('projects ImagePositionPatient on the slice normal', () => {
    expect(slicePosition([10, 20, 30], [1, 0, 0, 0, 1, 0])).toBe(30) // axial: normal = z
    expect(slicePosition([10, 20, 30], [0, 1, 0, 0, 0, -1])).toBe(-10) // sagittal: normal = -x
    expect(slicePosition(undefined, [1, 0, 0, 0, 1, 0])).toBeUndefined()
  })
  it('sorts by InstanceNumber, then by slice position, else keeps file order', () => {
    const a = { n: 'a', instanceNumber: 3, slicePosition: 1 }
    const b = { n: 'b', instanceNumber: 1, slicePosition: 3 }
    const c = { n: 'c', instanceNumber: 2, slicePosition: 2 }
    expect(sortInstances([a, b, c]).map((x) => x.n)).toEqual(['b', 'c', 'a'])
    expect(sortInstances([{ ...a, instanceNumber: undefined }, b, c]).map((x) => x.n)).toEqual(['a', 'c', 'b'])
    const unordered: { n: string; instanceNumber?: number }[] = [{ n: 'x' }, { n: 'y', instanceNumber: 1 }]
    expect(sortInstances(unordered).map((x) => x.n)).toEqual(['x', 'y'])
  })
  it('combines BurnedInAnnotation conservatively', () => {
    expect(combineBurnedIn(['NO', 'NO'])).toBe('NO')
    expect(combineBurnedIn(['NO', undefined])).toBeUndefined()
    expect(combineBurnedIn(['NO', 'YES', undefined])).toBe('YES')
    expect(combineBurnedIn([])).toBeUndefined()
  })
})

describe('distinctTimes', () => {
  it('drops keyframe candidates that share a timestamp', () => {
    expect(distinctTimes([0, 1, 2, 3], [0, 0, 0, 0])).toEqual([0])
    expect(distinctTimes([0, 2, 3], [0, 0.5, 1, 1])).toEqual([0, 2])
  })
})
