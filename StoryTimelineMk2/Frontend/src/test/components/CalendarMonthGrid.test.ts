import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CalendarMonthGrid from '@/components/CalendarMonthGrid.vue'
import type { ItemDot } from '@/components/CalendarMonthGrid.vue'

// Minimal default props for a 5-day week, 10-day month
const BASE_PROPS = {
  monthName: 'Firstmonth',
  monthIndex: 0,
  days: 10,
  weekLength: 5,
  dayLabels: ['Mo', 'Tu', 'We', 'Th', 'Fr'],
  weekendDays: [],
  memorableDays: [],
}

function mountGrid(propsOverrides = {}) {
  return mount(CalendarMonthGrid, { props: { ...BASE_PROPS, ...propsOverrides } })
}

describe('CalendarMonthGrid', () => {
  // ── Basic rendering ──────────────────────────────────────────────────────

  it('renders the month name', () => {
    const wrapper = mountGrid()
    expect(wrapper.find('.month-name').text()).toBe('Firstmonth')
  })

  it('renders day header labels', () => {
    const wrapper = mountGrid()
    const headers = wrapper.findAll('th')
    expect(headers).toHaveLength(5)
    expect(headers[0].text()).toBe('Mo')
    expect(headers[4].text()).toBe('Fr')
  })

  it('renders all day numbers 1–N', () => {
    const wrapper = mountGrid({ days: 7 })
    const dayNums = wrapper.findAll('.day-num')
    const nums = dayNums.map(n => parseInt(n.text()))
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  // ── Weekend class ────────────────────────────────────────────────────────

  it('applies weekend class to specified column headers', () => {
    const wrapper = mountGrid({ weekendDays: [3, 4] })
    const headers = wrapper.findAll('th')
    expect(headers[3].classes()).toContain('weekend')
    expect(headers[4].classes()).toContain('weekend')
    expect(headers[0].classes()).not.toContain('weekend')
  })

  // ── Item dots ────────────────────────────────────────────────────────────

  it('adds has-items class to cells with item dots', () => {
    const itemDots: Record<number, ItemDot[]> = {
      3: [{ color: '#f00', title: 'Battle of Helm' }],
    }
    const wrapper = mountGrid({ itemDots })
    const cells = wrapper.findAll('td')
    // Day 3 is the third cell (index 2)
    const day3 = cells.find(c => c.find('.day-num').exists() && parseInt(c.find('.day-num').text()) === 3)
    expect(day3).toBeDefined()
    expect(day3!.classes()).toContain('has-items')
  })

  it('does not add has-items class to cells without item dots', () => {
    const wrapper = mountGrid({ itemDots: {} })
    wrapper.findAll('td').forEach(cell => {
      expect(cell.classes()).not.toContain('has-items')
    })
  })

  it('renders individual dot spans when there are 1–3 item dots', () => {
    const itemDots: Record<number, ItemDot[]> = {
      1: [
        { color: '#f00', title: 'First event' },
        { color: '#0f0', title: 'Second event' },
      ],
    }
    const wrapper = mountGrid({ itemDots })
    const dots = wrapper.findAll('.item-dot')
    expect(dots).toHaveLength(2)
    expect(dots[0].attributes('style')).toContain('#f00')
    expect(dots[1].attributes('style')).toContain('#0f0')
  })

  it('renders a count badge instead of dots when there are more than 3 item dots', () => {
    const itemDots: Record<number, ItemDot[]> = {
      2: [
        { color: '#111', title: 'A' },
        { color: '#222', title: 'B' },
        { color: '#333', title: 'C' },
        { color: '#444', title: 'D' },
      ],
    }
    const wrapper = mountGrid({ itemDots })
    expect(wrapper.findAll('.item-dot')).toHaveLength(0)
    const badge = wrapper.find('.item-count-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('4')
  })

  it('renders no item-dot-row when itemDots is undefined', () => {
    const wrapper = mountGrid({ itemDots: undefined })
    expect(wrapper.find('.item-dot-row').exists()).toBe(false)
    expect(wrapper.find('.item-dot').exists()).toBe(false)
  })
})
