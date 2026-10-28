import { describe, expect, it } from 'vitest'
import { formatMb, isMobileDevice, resolveBrowserModel } from './models'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const IPADOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'

describe('built-in model choice', () => {
  it('detects phones and tablets, including iPadOS posing as a Mac', () => {
    expect(isMobileDevice(IPHONE, 5)).toBe(true)
    expect(isMobileDevice(ANDROID, 5)).toBe(true)
    expect(isMobileDevice(IPADOS, 5)).toBe(true)
    expect(isMobileDevice(IPADOS, 0)).toBe(false) // a real Mac
    expect(isMobileDevice(DESKTOP, 0)).toBe(false)
  })

  it('automatic: 2B on computers, 450M on phones', () => {
    expect(resolveBrowserModel('auto', {}, false)).toBe('qwen3.5-2b')
    expect(resolveBrowserModel('auto', {}, true)).toBe('lfm2.5-vl-450m')
  })

  it('automatic steps down after an out-of-memory kill and gives up when the smallest one died too', () => {
    expect(resolveBrowserModel('auto', { 'qwen3.5-2b': 1 }, false)).toBe('qwen3.5-0.8b')
    expect(resolveBrowserModel('auto', { 'qwen3.5-2b': 1, 'qwen3.5-0.8b': 1 }, false)).toBe('lfm2.5-vl-450m')
    expect(resolveBrowserModel('auto', { 'lfm2.5-vl-450m': 1 }, true)).toBeUndefined()
  })

  it('honours an explicit choice; unknown values fall back to automatic', () => {
    expect(resolveBrowserModel('qwen3.5-0.8b', { 'qwen3.5-0.8b': 2 }, true)).toBe('qwen3.5-0.8b')
    expect(resolveBrowserModel('qwen3.5-9b', {}, false)).toBe('qwen3.5-2b')
  })

  it('formats sizes the Portuguese way', () => {
    expect(formatMb(2070)).toBe('2,1 GB')
    expect(formatMb(319)).toBe('319 MB')
  })
})
