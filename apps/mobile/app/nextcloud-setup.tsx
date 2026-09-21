/**
 * app/nextcloud-setup.tsx — Nextcloud account setup for CalDAV/CardDAV.
 *
 * Allows the user to enter their Nextcloud credentials (URL, username, password).
 * Tests the connection, then saves to SecureStore.
 */
import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/src/theme'
import { SPACE } from '@/src/design'
import { Icon } from '@/src/components/icon'
import {
  saveCalDAVCredentials, getCalDAVCredentials, clearCalDAVCredentials,
  isCalDAVConfigured, fetchCalendars,
} from '@/src/lib/caldav'
import { fetchAddressBooks } from '@/src/lib/carddav'

export default function NextcloudSetupScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const [serverUrl, setServerUrl] = useState('https://cloud.aifazi.net')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [calCount, setCalCount] = useState(0)
  const [addrCount, setAddrCount] = useState(0)

  useEffect(() => {
    getCalDAVCredentials().then((creds) => {
      if (creds) {
        setServerUrl(creds.serverUrl)
        setUsername(creds.username)
        setPassword(creds.password)
        setConfigured(true)
        loadCounts()
      }
    })
  }, [])

  const loadCounts = async () => {
    try {
      const cals = await fetchCalendars()
      setCalCount(cals.length)
    } catch {}
    try {
      const addrs = await fetchAddressBooks()
      setAddrCount(addrs.length)
    } catch {}
  }

  const testAndSave = async () => {
    if (!serverUrl || !username || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.')
      return
    }
    setLoading(true)
    try {
      await saveCalDAVCredentials({ serverUrl: serverUrl.replace(/\/+$/, ''), username, password })
      // Test connection
      const cals = await fetchCalendars()
      setCalCount(cals.length)
      try {
        const addrs = await fetchAddressBooks()
        setAddrCount(addrs.length)
      } catch { setAddrCount(0) }
      setConfigured(true)
      Alert.alert('Connected!', `Found ${cals.length} calendar(s).`)
    } catch (e: any) {
      await clearCalDAVCredentials()
      setConfigured(false)
      Alert.alert('Connection Failed', e?.message || 'Could not connect to Nextcloud. Check your credentials and URL.')
    } finally {
      setLoading(false)
    }
  }

  const disconnect = async () => {
    Alert.alert('Disconnect', 'Remove Nextcloud account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: async () => {
        await clearCalDAVCredentials()
        setConfigured(false)
        setCalCount(0)
        setAddrCount(0)
        setUsername('')
        setPassword('')
      }},
    ])
  }

  const inputStyle = {
    fontFamily: theme.mono ? 'monospace' : undefined,
    fontSize: 14,
    color: c.text,
    backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 20, fontWeight: 700, color: c.text }}>
          Nextcloud Setup
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <Icon name="calendar" size={48} color={c.accent} />
          <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 16, fontWeight: 700, color: c.text, marginTop: 12, textAlign: 'center' }}>
            Connect Nextcloud
          </Text>
          <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 12, color: c.muted, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
            Sync your calendar and contacts with Nextcloud.{'\n'}Uses your Nextcloud/LDAP credentials.
          </Text>
        </View>

        {configured && (
          <View style={{
            padding: 12, borderRadius: 10, marginBottom: 16,
            backgroundColor: theme.dark ? 'rgba(35,209,96,0.1)' : 'rgba(35,209,96,0.08)',
            borderWidth: 1, borderColor: 'rgba(35,209,96,0.3)',
          }}>
            <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 12, color: '#23d160', fontWeight: 600 }}>
              ✓ Connected
            </Text>
            <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 11, color: c.muted, marginTop: 4 }}>
              {calCount} calendar(s), {addrCount} address book(s)
            </Text>
          </View>
        )}

        <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 10, color: c.muted, letterSpacing: 1, marginBottom: 6 }}>
          SERVER URL
        </Text>
        <TextInput
          value={serverUrl} onChangeText={setServerUrl}
          placeholder="https://cloud.aifazi.net"
          placeholderTextColor={c.muted}
          autoCapitalize="none" autoCorrect={false}
          style={inputStyle}
        />

        <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 10, color: c.muted, letterSpacing: 1, marginBottom: 6 }}>
          USERNAME
        </Text>
        <TextInput
          value={username} onChangeText={setUsername}
          placeholder="your.username"
          placeholderTextColor={c.muted}
          autoCapitalize="none" autoCorrect={false}
          style={inputStyle}
        />

        <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 10, color: c.muted, letterSpacing: 1, marginBottom: 6 }}>
          PASSWORD
        </Text>
        <TextInput
          value={password} onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={c.muted}
          secureTextEntry
          autoCapitalize="none" autoCorrect={false}
          style={inputStyle}
        />

        <TouchableOpacity
          onPress={testAndSave}
          disabled={loading}
          style={{
            padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 8,
            backgroundColor: loading ? `${c.accent}66` : c.accent,
          }}>
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 13, fontWeight: 700, color: '#fff' }}>
              {configured ? 'RECONNECT' : 'CONNECT'}
            </Text>
          )}
        </TouchableOpacity>

        {configured && (
          <TouchableOpacity onPress={disconnect}
            style={{ padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: c.danger }}>
            <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 13, fontWeight: 700, color: c.danger }}>DISCONNECT</Text>
          </TouchableOpacity>
        )}

        <Text style={{ fontFamily: theme.mono ? 'monospace' : undefined, fontSize: 10, color: c.muted, marginTop: 20, textAlign: 'center', lineHeight: 16 }}>
          Your credentials are stored securely on-device using the OS keychain.{'\n'}They are never sent to our servers.
        </Text>
      </ScrollView>
    </View>
  )
}
