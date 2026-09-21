/**
 * app/calendar.tsx — Calendar screen showing CalDAV events from Nextcloud.
 *
 * Displays a month view with event dots, and a list of events for the selected day.
 * Requires Nextcloud account setup (calendardav setup in profile).
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/src/theme'
import { SPACE } from '@/src/design'
import { Icon } from '@/src/components/icon'
import {
  fetchAllEvents, isCalDAVConfigured, type CalDAVEvent,
} from '@/src/lib/caldav'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function daysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate() }
function firstDayOfMonth(year: number, month: number) { return new Date(year, month, 1).getDay() }

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function CalendarScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [events, setEvents] = useState<CalDAVEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [currentMonth, setCurrentMonth] = useState(new Date())

  useEffect(() => {
    isCalDAVConfigured().then((ok) => {
      setConfigured(ok)
      if (ok) loadEvents()
      else setLoading(false)
    })
  }, [])

  const loadEvents = useCallback(async () => {
    try {
      const evts = await fetchAllEvents()
      setEvents(evts)
    } catch (e) {
      console.warn('[Calendar] load error:', e)
    }
  }, [])

  useEffect(() => {
    setLoading(false)
  }, [configured])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadEvents()
    setRefreshing(false)
  }, [loadEvents])

  const selectedDayEvents = useMemo(() => {
    return events.filter((e) => isSameDay(e.start, selectedDate))
  }, [events, selectedDate])

  const eventsOnDay = useCallback((day: number) => {
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    return events.some((e) => isSameDay(e.start, d))
  }, [events, currentMonth])

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))

  if (configured === null) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator size="large" color={c.accent} />
    </View>
  }

  if (!configured) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, padding: 32 }}>
      <Icon name="calendar" size={48} color={c.muted} />
      <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 18, fontWeight: 700, color: c.text, marginTop: 16, textAlign: 'center' }}>
        Calendar Not Set Up
      </Text>
      <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 12, color: c.muted, marginTop: 8, textAlign: 'center', lineHeight: 18 }}>
        Connect your Nextcloud account to view and manage your calendar events.
      </Text>
      <TouchableOpacity
        onPress={() => router.push('/nextcloud-setup')}
        style={{ marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, backgroundColor: c.accent }}>
        <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 12, fontWeight: 700, color: '#fff' }}>SETUP NEXTCLOUD</Text>
      </TouchableOpacity>
    </View>
  }

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const totalDays = daysInMonth(year, month)
  const startDay = firstDayOfMonth(year, month)

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 20, fontWeight: 700, color: c.text }}>Calendar</Text>
        <TouchableOpacity onPress={() => router.push('/nextcloud-setup')}>
          <Icon name="settings" size={20} color={c.muted} />
        </TouchableOpacity>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
        {/* Month navigator */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}>
          <TouchableOpacity onPress={prevMonth} style={{ padding: 8 }}>
            <Icon name="back" size={18} color={c.accent} />
          </TouchableOpacity>
          <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 16, fontWeight: 700, color: c.text }}>
            {MONTH_NAMES[month]} {year}
          </Text>
          <TouchableOpacity onPress={nextMonth} style={{ padding: 8 }}>
            <Icon name="forward" size={18} color={c.accent} />
          </TouchableOpacity>
        </View>

        {/* Day names */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 8 }}>
          {DAY_NAMES.map((d) => (
            <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
              <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 10, color: c.muted, letterSpacing: 1 }}>{d.toUpperCase()}</Text>
            </View>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 }}>
          {Array.from({ length: startDay }).map((_, i) => <View key={`empty-${i}`} style={{ width: `${100/7}%`, aspectRatio: 1 }} />)}
          {Array.from({ length: totalDays }).map((_, i) => {
            const day = i + 1
            const date = new Date(year, month, day)
            const isSelected = isSameDay(date, selectedDate)
            const isToday = isSameDay(date, new Date())
            const hasEvent = eventsOnDay(day)
            return (
              <TouchableOpacity key={day} onPress={() => setSelectedDate(date)}
                style={{ width: `${100/7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isSelected ? c.accent : isToday ? `${c.accent}22` : 'transparent',
                }}>
                  <Text style={{
                    fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 13, fontWeight: isToday || isSelected ? 700 : 400,
                    color: isSelected ? '#fff' : isToday ? c.accent : c.text,
                  }}>{day}</Text>
                </View>
                {hasEvent && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.accent, marginTop: 1 }} />}
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Selected day events */}
        <View style={{ marginTop: 16, paddingHorizontal: 16 }}>
          <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 10, color: c.muted, letterSpacing: 1, marginBottom: 8 }}>
            {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
          </Text>
          {selectedDayEvents.length === 0 ? (
            <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 12, color: c.muted, textAlign: 'center', padding: 24 }}>
              No events on this day
            </Text>
          ) : (
            selectedDayEvents.map((event) => (
              <View key={event.uid} style={{
                padding: 12, borderRadius: 10, marginBottom: 8,
                backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                borderLeftWidth: 3, borderLeftColor: c.accent,
              }}>
                <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 14, fontWeight: 600, color: c.text }}>{event.summary}</Text>
                <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 11, color: c.muted, marginTop: 4 }}>
                  {event.allDay ? 'All day' : `${event.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} – ${event.end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
                </Text>
                {event.location && (
                  <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 11, color: c.accent, marginTop: 2 }}>📍 {event.location}</Text>
                )}
                {event.calendarName && (
                  <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 10, color: c.muted, marginTop: 2 }}>📅 {event.calendarName}</Text>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  )
}
