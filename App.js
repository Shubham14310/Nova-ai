import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView, View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert, StatusBar, Share
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';

const API_BASE = Constants.expoConfig?.extra?.apiBaseUrl || '';
const STORAGE_KEY = 'nova_ai_chats_v1';
const AUTH_KEY = 'nova_ai_session_v1';
const FREE_MESSAGES_KEY = 'nova_ai_guest_messages_v1';
const SUPABASE_URL = 'https://icnhaeqdqxrckbfsxmne.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nvQsuah4Kru_3MPA-MhrLA_XhFSRvB8';

export default function App() {
  const [showLaunchSplash, setShowLaunchSplash] = useState(true);
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [input, setInput] = useState('');
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState(String(Date.now()));
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [editingChat, setEditingChat] = useState(null);
  const [chatTitleInput, setChatTitleInput] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [codingMode, setCodingMode] = useState(false);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [speechRate, setSpeechRate] = useState(0.95);
  const [showSettings, setShowSettings] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [temporaryChat, setTemporaryChat] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    const splashTimer = setTimeout(() => setShowLaunchSplash(false), 1900);
    return () => clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const savedVoice = await AsyncStorage.getItem('nova_ai_voice_v1');
        if (savedVoice) setSelectedVoice(JSON.parse(savedVoice));
        const savedRate = await AsyncStorage.getItem('nova_ai_voice_rate_v1');
        if (savedRate) setSpeechRate(Math.max(0.6, Math.min(1.2, Number(savedRate) || 0.95)));
        const savedInstructions = await AsyncStorage.getItem('nova_ai_custom_instructions_v1');
        if (savedInstructions) setCustomInstructions(savedInstructions);
        const voices = await Speech.getAvailableVoicesAsync();
        setAvailableVoices(Array.isArray(voices) ? voices : []);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const savedSession = await AsyncStorage.getItem(AUTH_KEY);
        if (savedSession) {
          const parsedSession = JSON.parse(savedSession);
          setSession(parsedSession);
          if (parsedSession?.access_token && parsedSession?.user?.id) {
            await loadCloudChats(parsedSession);
          }
        }
        const saved = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || '[]');
        setChats(current => current.length ? current : saved);
        const latest = saved[0];
        if (latest) { setChatId(latest.id); setMessages(latest.messages || []); }
      } catch {}
    })();
  }, []);

  async function authenticate() {
    if (!email.trim() || !password) {
      Alert.alert('Details required', 'Enter your email and password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    setAuthBusy(true);
    try {
      const isSignup = authMode === 'signup';
      const endpoint = isSignup
        ? '/auth/v1/signup'
        : '/auth/v1/token?grant_type=password';
      const response = await fetch(SUPABASE_URL + endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY
        },
        body: JSON.stringify(isSignup
          ? { email: email.trim(), password, data: { display_name: displayName.trim() } }
          : { email: email.trim(), password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || 'Authentication failed');
      if (!data.access_token) {
        Alert.alert('Verify your email', 'Signup successful. Check your email, verify your account, then log in.');
        setAuthMode('login');
        return;
      }
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(data));
      setSession(data);
      setPassword('');
      setShowAuth(false);
      setShowProfile(false);
      setShowMenu(false);
      await loadCloudChats(data);
    } catch (error) {
      Alert.alert('Account error', error.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    try {
      if (session?.access_token) {
        await fetch(SUPABASE_URL + '/auth/v1/logout', {
          method: 'POST',
          headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + session.access_token }
        });
      }
    } catch {}
    await AsyncStorage.removeItem(AUTH_KEY);
    setSession(null);
    setMessages([]);
    setShowAuth(false);
    setShowProfile(false);
    setShowMenu(false);
  }

  async function loadCloudChats(activeSession) {
    try {
      const url = SUPABASE_URL + '/rest/v1/nova_chat_history?select=id,title,messages,updated_at&user_id=eq.' +
        encodeURIComponent(activeSession.user.id) + '&order=updated_at.desc&limit=30';
      const response = await fetch(url, {
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + activeSession.access_token }
      });
      if (!response.ok) return;
      const rows = await response.json();
      const local = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || '[]');
      const cloudChats = rows.map(row => {
        const localChat = local.find(item => item.id === row.id);
        const cloudMessages = row.messages || [];
        const hydratedMessages = cloudMessages.map((message, index) => {
          const localMessage = localChat?.messages?.[index];
          return localMessage?.imageBase64
            ? { ...message, imageUri: localMessage.imageUri, imageBase64: localMessage.imageBase64, imageMimeType: localMessage.imageMimeType || 'image/jpeg' }
            : message;
        });
        return {
          id: row.id, title: row.title,
          messages: localChat?.updatedAt >= new Date(row.updated_at).getTime() ? localChat.messages : hydratedMessages,
          updatedAt: Math.max(localChat?.updatedAt || 0, new Date(row.updated_at).getTime())
        };
      });
      const merged = [...cloudChats, ...local.filter(item => !cloudChats.some(cloud => cloud.id === item.id))]
        .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
      setChats(merged);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      if (cloudChats.length && messages.length === 0) {
        setChatId(cloudChats[0].id);
        setMessages(cloudChats[0].messages || []);
      }
    } catch {}
  }

  async function persist(nextMessages, nextId = chatId) {
    if (temporaryChat) return;
    const existingTitle = chats.find(c => c.id === nextId)?.title;
    const nextChats = [{ id: nextId, title: existingTitle || nextMessages.find(m => m.role === 'user')?.content?.slice(0, 32) || 'New chat',
      updatedAt: Date.now(), messages: nextMessages }, ...chats.filter(c => c.id !== nextId)].slice(0, 30);
    setChats(nextChats);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextChats));
    if (session?.access_token && session?.user?.id) {
      try {
        await fetch(SUPABASE_URL + '/rest/v1/nova_chat_history?on_conflict=id', {
          method: 'POST',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: 'Bearer ' + session.access_token,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify({
            id: nextId,
            user_id: session.user.id,
            title: nextChats[0].title,
            messages: nextMessages.map(({ imageBase64, imageUri, ...message }) => message),
            updated_at: new Date().toISOString()
          })
        });
      } catch {}
    }
  }

  async function updateChatTitle(id, title) {
    const cleaned = title.trim().slice(0, 60); if (!cleaned) return;
    const updated = chats.map(chat => chat.id === id ? { ...chat, title: cleaned, updatedAt: Date.now() } : chat);
    setChats(updated); await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    if (session?.access_token) { try { await fetch(SUPABASE_URL + '/rest/v1/nova_chat_history?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: cleaned, updated_at: new Date().toISOString() }) }); } catch {} }
    setEditingChat(null);
  }
  async function deleteChat(id) {
    Alert.alert('Delete chat?', 'Remove this chat?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => {
      const updated = chats.filter(chat => chat.id !== id); setChats(updated); await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      if (session?.access_token) { try { await fetch(SUPABASE_URL + '/rest/v1/nova_chat_history?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + session.access_token } }); } catch {} }
      if (chatId === id) { setMessages([]); setChatId(String(Date.now())); }
    }}]);
  }
  function newChat() { setMessages([]); setImage(null); setChatId(String(Date.now())); setTemporaryChat(false); setShowHistory(false); setShowVoiceSettings(false); setShowSettings(false); setShowAuth(false); setShowProfile(false); setShowMenu(false); }

  async function shareCurrentChat() {
    if (!messages.length) { Alert.alert('Nothing to share', 'Start a conversation first.'); return; }
    const transcript = messages.map(m => `${m.role === 'user' ? 'You' : 'Nova AI'}: ${m.content || ''}`).join('\n\n');
    try { await Share.share({ message: `Nova AI conversation\n\n${transcript}` }); }
    catch { Alert.alert('Share unavailable', 'Could not open the share sheet.'); }
  }

  async function saveCustomInstructions() {
    const value = customInstructions.slice(0, 1500);
    await AsyncStorage.setItem('nova_ai_custom_instructions_v1', value);
    setCustomInstructions(value);
    setShowSettings(false);
    Alert.alert('Saved', 'Your custom instructions are saved on this device.');
  }


  async function chooseImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, quality: 0.7, base64: true
    });
    if (!result.canceled) setImage(result.assets[0]);
  }

  async function send() {
    const text = input.trim();
    if ((!text && !image) || busy) return;
    // Guests get three free user messages total on this device, then must sign up.
    if (!session) {
      const used = Number(await AsyncStorage.getItem(FREE_MESSAGES_KEY) || '0');
      if (used >= 3) {
        setAuthMode('signup');
        setShowAuth(true);
        setShowHistory(false);
        setShowProfile(false);
        setShowSettings(false);
        setShowVoiceSettings(false);
        setShowMenu(false);
        Alert.alert('Free messages used', 'Aapke 3 free messages complete ho gaye. Continue karne ke liye free account banayein.');
        return;
      }
      await AsyncStorage.setItem(FREE_MESSAGES_KEY, String(used + 1));
    }
    if (!API_BASE || API_BASE.includes('YOUR-BACKEND')) {
      Alert.alert('Backend not connected', 'Deploy the server and add its HTTPS URL in app.json first.');
      return;
    }
    const userMessage = { role: 'user', content: text || 'Please describe this image.', imageUri: image?.uri, imageBase64: image?.base64, imageMimeType: image?.mimeType || 'image/jpeg' };
    const next = [...messages, userMessage];
    setMessages(next); setInput(''); setBusy(true);
    setImage(null);
    try {
      // Save the user's message immediately so it is not lost if the network fails.
      await persist(next);
      // Detect image requests in English, Hindi and Hinglish from the normal chat composer.
      const imageIntent = /(?:\b(?:generate|create|draw|make|paint)\b.{0,100}\b(?:image|picture|photo|art|illustration)\b)|(?:\b(?:image|picture|photo|art|illustration|tasveer|tasvir)\b.{0,100}\b(?:bana(?:o|do)?|bana\s*do|banado|create|generate|draw)\b)|(?:\b(?:bana(?:o|do)?|bana\s*do|banado|make|create|generate|draw)\b.{0,100}\b(?:image|picture|photo|art|illustration|tasveer|tasvir)\b)|(?:(?:फोटो|तस्वीर|इमेज|चित्र).{0,100}(?:बना|बनाओ|बना\s*दो|तैयार))|(?:(?:बना|बनाओ|बना\s*दो|तैयार).{0,100}(?:फोटो|तस्वीर|इमेज|चित्र))/i;
      if (imageIntent.test(text)) {
        const prompt = text
          .replace(/^(?:please\s+)?(?:generate|create|draw|make|paint)(?:\s+me)?\s+(?:an?\s+)?(?:image|picture|photo|art|illustration)(?:\s+(?:of|for))?\s*/i, '')
          .replace(/^(?:ek|एक)\s+/i, '')
          .replace(/\s+(?:ki|ka|ke)?\s*(?:image|picture|photo|tasveer|tasvir|फोटो|तस्वीर|इमेज|चित्र)\s*(?:banao|bana\s*do|banado|बनाओ|बना\s*दो)\s*$/i, '')
          .replace(/\s+(?:banao|bana\s*do|banado|बनाओ|बना\s*दो)\s*$/i, '')
          .trim() || text;
        try {
          const imageResponse = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/images/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
          });
          const imageData = await imageResponse.json();
          if (!imageResponse.ok) throw new Error(imageData.error || `Image generation failed (HTTP ${imageResponse.status})`);
          if (!imageData.imageBase64) throw new Error('Image service returned no image.');
          const generated = { role: 'assistant', content: 'Ye rahi aapki image ✨', imageUri: `data:${imageData.mimeType || 'image/jpeg'};base64,${imageData.imageBase64}` };
          const completed = [...next, generated];
          setMessages(completed); await persist(completed);
          return;
        } catch (imageError) {
          const failed = [...next, { role: 'assistant', content: `Image generate nahi ho paayi: ${imageError.message}` }];
          setMessages(failed); await persist(failed);
          return;
        }
      }
      // Recent cross-chat context is kept locally and sent only with the next message.
      const previousContext = chats
        .filter(chat => chat.id !== chatId)
        .slice(0, 4)
        .reverse()
        .flatMap(chat => (chat.messages || []).slice(-6))
        .filter(message => (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
        .map(message => `${message.role === 'user' ? 'User' : 'Nova'}: ${message.content.slice(0, 700)}`)
        .join('\\n')
        .slice(-5000);

      const payloadMessages = [
        ...(customInstructions.trim() ? [{ role: 'system', content: 'User custom instructions (follow when safe and relevant): ' + customInstructions.trim().slice(0, 1500) }] : []),
        ...(codingMode ? [{ role: 'system', content: 'CODING MODE: Act as an expert senior software engineer and patient coding tutor. Understand the user’s goal before coding. Provide correct, runnable, complete code (not vague snippets) when they ask to build something; preserve existing project structure and explain exactly which file to edit and where. For bug fixes, identify the likely root cause, give the corrected full relevant file or precise patch, and explain how to test it. Use current best practices, safe input handling, error states, accessibility, and mobile-friendly UI when relevant. Do not invent APIs or claim you ran the code. If essential details are missing, ask one concise question; otherwise make sensible assumptions and state them. For Hindi/Hinglish requests, explain simply in Hinglish. When a task is large, deliver a working first milestone and then continue incrementally.' }] : []),
        ...(previousContext ? [{
          role: 'system',
          content: 'Context from recent earlier chats on this device. Use only when relevant; details may be outdated. Trust the user’s latest correction and do not repeat private details unnecessarily.\\n' + previousContext
        }] : []),
        ...(() => {
          const imageIndexes = next
            .map((message, index) => message.role === 'user' && message.imageBase64 ? index : -1)
            .filter(index => index >= 0)
            .slice(-2);
          return next.map((message, index) => {
            if (message.role !== 'user' || !imageIndexes.includes(index)) {
              return { role: message.role, content: message.content };
            }
            return {
              role: 'user',
              content: [
                { type: 'text', text: message.content || 'Please describe this image.' },
                { type: 'image_url', image_url: { url: `data:${message.imageMimeType || 'image/jpeg'};base64,${message.imageBase64}` } }
              ]
            };
          });
        })()
      ];
      const response = await fetch(`${API_BASE.replace(/\/$/, '')}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payloadMessages })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI request failed');
      const completed = [...next, { role: 'assistant', content: data.reply }];
      setMessages(completed); await persist(completed);
    } catch (e) {
      const failed = [...next, { role: 'assistant', content: `Connection issue: ${e.message}. Please try again.` }];
      setMessages(failed);
      await persist(failed);
    } finally { setBusy(false); }
  }

  async function copyReply(text) {
    try {
      await Clipboard.setStringAsync(String(text || ''));
      Alert.alert('Copied', 'Nova AI ka reply clipboard mein copy ho gaya.');
    } catch (error) {
      Alert.alert('Copy failed', 'Text copy nahi ho paya. Dobara try karo.');
    }
  }

  function speak(text) {
    const value = String(text || '');
    const isHindi = /[\u0900-\u097F]/.test(value);
    const isHinglish = /\b(kya|kaise|kyun|hai|hain|nahi|haan|aap|mera|mujhe|karna|batao)\b/i.test(value);
    const language = isHindi || isHinglish ? 'hi-IN' : 'en-IN';
    const voice = selectedVoice && (!selectedVoice.language || selectedVoice.language.toLowerCase().startsWith(language.slice(0, 2))) ? selectedVoice : null;
    Speech.stop();
    Speech.speak(value, { language, voice: voice?.identifier, rate: speechRate });
  }

  async function chooseVoice(voice) {
    setSelectedVoice(voice);
    await AsyncStorage.setItem('nova_ai_voice_v1', JSON.stringify(voice));
  }

  async function changeSpeechRate(nextRate) {
    const rate = Math.max(0.6, Math.min(1.2, Number(nextRate.toFixed(2))));
    setSpeechRate(rate);
    await AsyncStorage.setItem('nova_ai_voice_rate_v1', String(rate));
  }

  function renderFormattedText(content) {
    const lines = String(content || '').split(/\r?\n/);
    return lines.map((line, index) => {
      const clean = line.replace(/^\s*[-*]\s+/, '• ').replace(/^#{1,3}\s+/, '');
      const parts = clean.split(/(\*\*.*?\*\*|\*.*?\*)/g);
      return <Text key={index} style={{ color: '#F5F5FA', fontSize: 15, lineHeight: 23, marginBottom: 2 }}>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) return <Text key={i} style={{ fontWeight: '800' }}>{part.slice(2, -2)}</Text>;
          if (part.startsWith('*') && part.endsWith('*')) return <Text key={i} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</Text>;
          return part;
        })}
      </Text>;
    });
  }

  const bubble = ({ item, index }) => (
    <View style={{ alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%',
      backgroundColor: item.role === 'user' ? '#6547E8' : '#20212A', borderRadius: 18,
      padding: 13, marginVertical: 6, borderBottomRightRadius: item.role === 'user' ? 5 : 18 }}>
      {item.imageUri ? <Image source={{ uri: item.imageUri }} style={{ width: 190, height: 140, borderRadius: 12, marginBottom: 8 }} /> : null}
      {renderFormattedText(item.content)}
      {item.role === 'assistant' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 9, gap: 16 }}>
        <TouchableOpacity onPress={() => speak(item.content)}><Text style={{ color: '#B9AFFF', fontSize: 12 }}>▶ Read aloud</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => copyReply(item.content)} accessibilityLabel="Copy Nova reply"><Text style={{ color: '#B9AFFF', fontSize: 12 }}>▢ Copy</Text></TouchableOpacity>
      </View> : <TouchableOpacity onPress={async () => { const revised = messages.slice(0, index); setMessages(revised); setInput(String(item.content || '')); await persist(revised); }} style={{ marginTop: 8, alignSelf: 'flex-end' }}><Text style={{ color: '#D8D1FF', fontSize: 12 }}>✎ Edit</Text></TouchableOpacity>}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#11121A' }}>
      <StatusBar barStyle="light-content" backgroundColor="#11121A" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <View style={{ minHeight: 68, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#282936' }}>
          <TouchableOpacity accessibilityLabel="Open menu" onPress={() => setShowMenu(true)} style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#272433', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '700' }}>☰</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}><Text style={{ color: '#FFFFFF', fontSize: 21, fontWeight: '800' }}>Nova <Text style={{ color: '#A99BFF' }}>✦</Text></Text><Text style={{ color: '#9293A4', fontSize: 11 }}>AI assistant · Ready to help</Text></View>
          <TouchableOpacity onPress={() => setCodingMode(value => !value)} style={{ backgroundColor: codingMode ? '#3A315B' : '#272433', paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12, marginRight: 7 }}><Text style={{ color: codingMode ? '#D8CEFF' : '#B9B6C8', fontWeight: '700', fontSize: 12 }}>{codingMode ? '⌘ Code ON' : '⌘ Code'}</Text></TouchableOpacity>
          <TouchableOpacity onPress={newChat} style={{ backgroundColor: '#272433', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 }}>
            <Text style={{ color: '#D8D1FF', fontWeight: '700' }}>＋ New</Text>
          </TouchableOpacity>
        </View>
        {showAuth ? <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 27, fontWeight: '800', marginBottom: 8 }}>{authMode === 'signup' ? 'Create your account' : 'Welcome back'}</Text>
          <Text style={{ color: '#A3A4B4', marginBottom: 22 }}>{authMode === 'signup' ? 'Sign up to sync your chats across devices.' : 'Log in to access your saved chats.'}</Text>
          {authMode === 'signup' ? <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Your name" placeholderTextColor="#77798B" autoCapitalize="words" style={{ color: '#FFFFFF', backgroundColor: '#22232D', borderRadius: 13, padding: 15, marginBottom: 12 }} /> : null}
          <TextInput value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor="#77798B" keyboardType="email-address" autoCapitalize="none" style={{ color: '#FFFFFF', backgroundColor: '#22232D', borderRadius: 13, padding: 15, marginBottom: 12 }} />
          <TextInput value={password} onChangeText={setPassword} placeholder="Password (minimum 6 characters)" placeholderTextColor="#77798B" secureTextEntry style={{ color: '#FFFFFF', backgroundColor: '#22232D', borderRadius: 13, padding: 15, marginBottom: 16 }} />
          <TouchableOpacity onPress={authenticate} disabled={authBusy} style={{ backgroundColor: '#7659F5', padding: 15, borderRadius: 13, alignItems: 'center', opacity: authBusy ? 0.6 : 1 }}>
            {authBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>{authMode === 'signup' ? 'Create account' : 'Log in'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setPassword(''); }} style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ color: '#C8C3DC' }}>{authMode === 'signup' ? 'Already have an account? Log in' : "Don't have an account? Sign up"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowAuth(false)} style={{ padding: 8, alignItems: 'center' }}><Text style={{ color: '#9293A4' }}>Back to chat</Text></TouchableOpacity>
        </View> : showProfile ? <View style={{ flex: 1, padding: 24 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 25, fontWeight: '800', marginBottom: 24 }}>Profile</Text>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: '#6547E8', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 30, fontWeight: '800' }}>{(session?.user?.user_metadata?.display_name || session?.user?.email || 'U').charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '700' }}>{session?.user?.user_metadata?.display_name || 'Nova AI user'}</Text>
          <Text style={{ color: '#A3A4B4', marginTop: 6 }}>{session?.user?.email || 'No email available'}</Text>
          <Text style={{ color: '#77798B', marginTop: 18, fontSize: 12 }}>Your account details</Text>
          <TouchableOpacity onPress={() => setShowProfile(false)} style={{ marginTop: 24, backgroundColor: '#272433', padding: 14, borderRadius: 12, alignItems: 'center' }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Back to chat</Text></TouchableOpacity>
        </View> : showSettings ? <View style={{ flex: 1, padding: 18 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 23, fontWeight: '800', marginBottom: 8 }}>Personalization</Text>
          <Text style={{ color: '#A3A4B4', marginBottom: 12 }}>Tell Nova how you prefer responses. Saved on this device (max 1,500 characters).</Text>
          <TextInput value={customInstructions} onChangeText={setCustomInstructions} multiline placeholder="Example: Reply in simple Hinglish. Keep answers short and explain step by step." placeholderTextColor="#77798B" style={{ minHeight: 150, maxHeight: 240, color: '#FFFFFF', backgroundColor: '#22232D', borderRadius: 13, padding: 14, textAlignVertical: 'top' }} />
          <TouchableOpacity onPress={saveCustomInstructions} style={{ marginTop: 12, backgroundColor: '#7659F5', padding: 14, borderRadius: 12, alignItems: 'center' }}><Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Save instructions</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSettings(false)} style={{ padding: 14, alignItems: 'center' }}><Text style={{ color: '#A3A4B4' }}>Back to chat</Text></TouchableOpacity>
        </View> : showVoiceSettings ? <View style={{ flex: 1, padding: 16 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 6 }}>Voice settings</Text>
          <Text style={{ color: '#A3A4B4', marginBottom: 14 }}>Choose an available voice. Hindi/Hinglish replies use Hindi voices when supported.</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#20212A', borderRadius: 13, padding: 14, marginBottom: 12 }}>
            <View><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Voice speed</Text><Text style={{ color: '#A3A4B4', marginTop: 4 }}>{speechRate.toFixed(2)}×</Text></View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => changeSpeechRate(speechRate - 0.1)} style={{ backgroundColor: '#393449', padding: 10, borderRadius: 9 }}><Text style={{ color: '#FFFFFF', fontWeight: '800' }}>−</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => changeSpeechRate(speechRate + 0.1)} style={{ backgroundColor: '#393449', padding: 10, borderRadius: 9 }}><Text style={{ color: '#FFFFFF', fontWeight: '800' }}>＋</Text></TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity onPress={() => speak('Hello! Main Nova AI hoon. Aap mujhse Hindi ya English mein baat kar sakte hain.')} style={{ backgroundColor: '#6547E8', padding: 13, borderRadius: 12, marginBottom: 14 }}><Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '700' }}>▶ Preview voice</Text></TouchableOpacity>
          <Text style={{ color: '#FFFFFF', fontWeight: '700', marginBottom: 8 }}>Available voices ({availableVoices.length})</Text>
          <FlatList data={availableVoices} keyExtractor={(item, index) => item.identifier || String(index)} ListEmptyComponent={<Text style={{ color: '#A3A4B4' }}>No voice list is available on this device yet. Android system text-to-speech voices will be used.</Text>} renderItem={({ item }) => {
            const active = selectedVoice?.identifier === item.identifier;
            return <TouchableOpacity onPress={() => chooseVoice(item)} style={{ padding: 13, backgroundColor: active ? '#393052' : '#20212A', borderRadius: 11, marginBottom: 7, borderWidth: active ? 1 : 0, borderColor: '#9C88FF' }}><Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{item.name || item.identifier}</Text><Text style={{ color: '#A3A4B4', fontSize: 11, marginTop: 3 }}>{item.language || 'Unknown language'} {active ? ' • Selected' : ''}</Text></TouchableOpacity>;
          }} />
        </View> : showHistory ? <View style={{ flex: 1, padding: 16 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 12 }}>Chat history</Text>
          <TextInput value={historySearch} onChangeText={setHistorySearch} placeholder="Search chats or messages..." placeholderTextColor="#77798B" style={{ color: '#FFFFFF', backgroundColor: '#22232D', borderRadius: 12, padding: 12, marginBottom: 12 }} />
          {chats.length === 0 ? <Text style={{ color: '#A3A4B4' }}>Your saved chats will appear here.</Text> :
            <FlatList data={chats.filter(item => (item.title || '').toLowerCase().includes(historySearch.trim().toLowerCase()) || (item.messages || []).some(m => String(m.content || '').toLowerCase().includes(historySearch.trim().toLowerCase())))} keyExtractor={item => item.id} renderItem={({ item }) => (
              <View style={{ padding: 13, backgroundColor: '#20212A', borderRadius: 13, marginBottom: 8 }}>
                <TouchableOpacity onPress={() => { setChatId(item.id); setMessages(item.messages || []); setShowHistory(false); }}>
                  <Text style={{ color: '#F5F5FA', fontWeight: '600' }}>{item.title || 'Chat'}</Text>
                  <Text style={{ color: '#8F91A2', fontSize: 11, marginTop: 4 }}>{new Date(item.updatedAt).toLocaleString()}</Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', marginTop: 10 }}>
                  <TouchableOpacity onPress={() => { setEditingChat(item.id); setChatTitleInput(item.title || ''); }} style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, backgroundColor: '#393449', marginRight: 8 }}><Text style={{ color: '#D8D1FF', fontSize: 12 }}>Rename</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteChat(item.id)} style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, backgroundColor: '#39272D' }}><Text style={{ color: '#FFB5B5', fontSize: 12 }}>Delete</Text></TouchableOpacity>
                </View>
              </View>
            )} />}
          {editingChat ? <View style={{ position: 'absolute', left: 16, right: 16, top: 110, zIndex: 40, elevation: 40, backgroundColor: '#292834', padding: 16, borderRadius: 15 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', marginBottom: 10 }}>Rename chat</Text>
            <TextInput value={chatTitleInput} onChangeText={setChatTitleInput} placeholder="Chat name" placeholderTextColor="#77798B" style={{ color: '#FFFFFF', backgroundColor: '#1B1C25', padding: 12, borderRadius: 10 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
              <TouchableOpacity onPress={() => setEditingChat(null)} style={{ padding: 10 }}><Text style={{ color: '#A3A4B4' }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => updateChatTitle(editingChat, chatTitleInput)} style={{ backgroundColor: '#7659F5', padding: 10, borderRadius: 9, marginLeft: 8 }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Save</Text></TouchableOpacity>
            </View>
          </View> : null}
        </View> : messages.length === 0 ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 }}>
          <View style={{ width: 76, height: 76, borderRadius: 26, backgroundColor: '#29243D', borderWidth: 1, borderColor: '#51466F', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 38, color: '#B8A9FF' }}>✦</Text></View>
          <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginTop: 18 }}>What can I help with?</Text>
          <Text style={{ color: '#A3A4B4', textAlign: 'center', marginTop: 9, lineHeight: 22 }}>Ask a question, share an image, or start with an idea.</Text>
          <View style={{ width: '100%', marginTop: 28 }}>
            {[
              ['✎', 'Write something', 'Draft a message, story or caption'],
              ['⌕', 'Learn a topic', 'Explain it in simple words'],
              ['◇', 'Brainstorm ideas', 'Plan a project or solve a problem']
            ].map(([icon, title, subtitle]) => <TouchableOpacity key={title} onPress={() => setInput(title === 'Write something' ? 'Help me write ' : title === 'Learn a topic' ? 'Explain ' : 'Give me ideas for ')} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1D27', borderWidth: 1, borderColor: '#30313E', borderRadius: 16, padding: 13, marginBottom: 9 }}><View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: '#302A48', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}><Text style={{ color: '#C9BDFF', fontSize: 18 }}>{icon}</Text></View><View style={{ flex: 1 }}><Text style={{ color: '#F5F5FA', fontWeight: '700' }}>{title}</Text><Text style={{ color: '#9092A3', fontSize: 12, marginTop: 3 }}>{subtitle}</Text></View><Text style={{ color: '#77798B', fontSize: 20 }}>›</Text></TouchableOpacity>)}</View>
        </View> : <FlatList ref={listRef} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" style={{ flex: 1, paddingHorizontal: 14 }} data={messages} keyExtractor={(_, i) => String(i)} renderItem={bubble} contentContainerStyle={{ paddingVertical: 14, paddingBottom: 24 }} onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })} onLayout={() => listRef.current?.scrollToEnd({ animated: false })} />}
        {!showHistory && !showVoiceSettings && !showSettings && !showAuth && !showProfile ? <>{busy ? <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 }}><ActivityIndicator color="#A99BFF" /><Text style={{ color: '#A3A4B4', marginLeft: 9 }}>Nova is thinking...</Text></View> : null}
        {image ? <View style={{ paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' }}><Image source={{ uri: image.uri }} style={{ width: 56, height: 56, borderRadius: 10 }} /><TouchableOpacity onPress={() => setImage(null)}><Text style={{ color: '#FF9A9A', marginLeft: 12 }}>Remove image</Text></TouchableOpacity></View> : null}
        <View style={{ paddingHorizontal: 12, paddingTop: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity onPress={() => setTemporaryChat(v => !v)} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: temporaryChat ? '#45366B' : '#22232D' }}><Text style={{ color: temporaryChat ? '#E4DBFF' : '#A3A4B4', fontSize: 11, fontWeight: '700' }}>{temporaryChat ? '◉ Temporary chat ON' : '◯ Temporary chat'}</Text></TouchableOpacity>
          <TouchableOpacity onPress={shareCurrentChat} style={{ paddingHorizontal: 10, paddingVertical: 7 }}><Text style={{ color: '#B9AFFF', fontSize: 11 }}>↗ Share chat</Text></TouchableOpacity>
        </View>
        <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#282936', flexDirection: 'row', alignItems: 'flex-end' }}>
          <TouchableOpacity onPress={chooseImage} style={{ backgroundColor: '#282936', padding: 13, borderRadius: 15, marginRight: 8 }}><Text style={{ color: '#D5CEFF', fontSize: 18 }}>＋</Text></TouchableOpacity>
          <TextInput value={input} onChangeText={setInput} placeholder="Message Nova AI..." placeholderTextColor="#77798B" multiline blurOnSubmit={false} returnKeyType="default"
            style={{ flex: 1, maxHeight: 130, minHeight: 48, color: '#FFFFFF', backgroundColor: '#22232D', borderRadius: 16, paddingHorizontal: 15, paddingVertical: 13, fontSize: 15, textAlignVertical: 'top' }} />
          <TouchableOpacity onPress={send} disabled={busy} style={{ backgroundColor: '#7659F5', paddingHorizontal: 16, paddingVertical: 15, borderRadius: 15, marginLeft: 8, opacity: busy ? 0.5 : 1 }}><Text style={{ color: '#FFFFFF', fontWeight: '800' }}>↑</Text></TouchableOpacity>
        </View>
        <Text style={{ color: '#696B7B', fontSize: 10, textAlign: 'center', paddingBottom: 7 }}>Nova AI can make mistakes. Check important information.</Text></> : null}
        {showMenu ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30, elevation: 30, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.58)' }}>
          <View style={{ width: '82%', maxWidth: 330, backgroundColor: '#191A24', paddingTop: 18, paddingHorizontal: 18, paddingBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 21, fontWeight: '800' }}>✦ Nova AI</Text>
              <TouchableOpacity onPress={() => setShowMenu(false)} style={{ padding: 8 }}><Text style={{ color: '#C8C3DC', fontSize: 22 }}>×</Text></TouchableOpacity>
            </View>
            {session ? <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#242330', borderRadius: 14, marginBottom: 16 }}>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#6547E8', alignItems: 'center', justifyContent: 'center', marginRight: 11 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '800' }}>{(session?.user?.user_metadata?.display_name || session?.user?.email || 'U').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: '#FFFFFF', fontWeight: '700' }}>{session?.user?.user_metadata?.display_name || 'Account'}</Text><Text numberOfLines={1} style={{ color: '#A3A4B4', fontSize: 11, marginTop: 3 }}>{session?.user?.email}</Text></View>
            </View> : <Text style={{ color: '#A3A4B4', marginBottom: 16 }}>You are using Nova AI as a guest.</Text>}
            <TouchableOpacity onPress={newChat} style={{ padding: 14, backgroundColor: '#2B2740', borderRadius: 12, marginBottom: 8 }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>＋  New chat</Text></TouchableOpacity>
            {session ? <>
              <TouchableOpacity onPress={() => { setShowSettings(true); setShowMenu(false); setShowHistory(false); setShowVoiceSettings(false); setShowProfile(false); }} style={{ padding: 14, borderRadius: 12 }}><Text style={{ color: '#E6E2F5' }}>⚙  Personalization</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowProfile(true); setShowMenu(false); setShowHistory(false); setShowVoiceSettings(false); setShowSettings(false); }} style={{ padding: 14, borderRadius: 12 }}><Text style={{ color: '#E6E2F5' }}>♙  Profile</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowHistory(true); setShowMenu(false); setShowProfile(false); setShowVoiceSettings(false); }} style={{ padding: 14, borderRadius: 12 }}><Text style={{ color: '#E6E2F5' }}>◷  Chat history</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowSettings(true); setShowMenu(false); setShowHistory(false); setShowVoiceSettings(false); setShowProfile(false); }} style={{ padding: 14, borderRadius: 12 }}><Text style={{ color: '#E6E2F5' }}>⚙  Personalization</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowVoiceSettings(true); setShowMenu(false); setShowHistory(false); setShowProfile(false); setShowSettings(false); }} style={{ padding: 14, borderRadius: 12 }}><Text style={{ color: '#E6E2F5' }}>♫  Voice settings</Text></TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={logout} style={{ padding: 14, borderRadius: 12, backgroundColor: '#342327' }}><Text style={{ color: '#FFB5B5', fontWeight: '700' }}>↪  Log out</Text></TouchableOpacity>
            </> : <>
              <TouchableOpacity onPress={() => { setAuthMode('login'); setShowAuth(true); setShowMenu(false); }} style={{ padding: 14, borderRadius: 12 }}><Text style={{ color: '#E6E2F5', fontWeight: '700' }}>Log in</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { setAuthMode('signup'); setShowAuth(true); setShowMenu(false); }} style={{ padding: 14, borderRadius: 12 }}><Text style={{ color: '#E6E2F5', fontWeight: '700' }}>Create account / Sign up</Text></TouchableOpacity>
              <View style={{ flex: 1 }} />
              <Text style={{ color: '#77798B', fontSize: 11, paddingBottom: 8 }}>Sign in to sync your chat history.</Text>
            </>}
          </View>
          <TouchableOpacity onPress={() => setShowMenu(false)} style={{ flex: 1 }} />
        </View> : null}
      </KeyboardAvoidingView>
      {showLaunchSplash ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, elevation: 100, backgroundColor: '#090D1F', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={require('./assets/nova-splash.png')} resizeMode="contain" style={{ width: 190, height: 190, marginBottom: 22 }} />
        <Text style={{ color: '#FFFFFF', fontSize: 32, fontWeight: '800', letterSpacing: 1 }}>Nova AI</Text>
        <Text style={{ color: '#A9B8E8', fontSize: 13, marginTop: 9, letterSpacing: 1.2 }}>YOUR INTELLIGENT ASSISTANT</Text>
        <ActivityIndicator color="#7D9BFF" size="small" style={{ marginTop: 30 }} />
      </View> : null}
    </SafeAreaView>
  );
}
