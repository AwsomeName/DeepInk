import { describe, expect, it } from 'vitest'
import { normalizeUpdateBaseUrl, resolveUpdateUrl } from './update-checker'

describe('update source validation', () => {
  it('accepts only credential-free HTTPS base URLs', () => {
    expect(normalizeUpdateBaseUrl('https://updates.example.com/studio/')).toBe(
      'https://updates.example.com/studio',
    )
    expect(normalizeUpdateBaseUrl('http://updates.example.com')).toBeNull()
    expect(normalizeUpdateBaseUrl('https://user:secret@updates.example.com')).toBeNull()
    expect(normalizeUpdateBaseUrl('file:///tmp/releases')).toBeNull()
  })

  it('keeps manifest artifacts on the configured origin', () => {
    expect(resolveUpdateUrl('https://updates.example.com/studio', 'app.dmg')).toBe(
      'https://updates.example.com/studio/app.dmg',
    )
    expect(() =>
      resolveUpdateUrl('https://updates.example.com/studio', 'https://evil.example/app.dmg'),
    ).toThrow('同源')
  })
})
