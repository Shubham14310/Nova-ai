import React, { useEffect, useState } from 'react';
import {
  SafeAreaView, View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert, StatusBar
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import Constants from 'expo-constants';

const API_BASE = Constants.expoConfig?.extra?.apiBaseUrl || '';
const STORAGE_KEY = 'nova_ai_chats_v1';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [input, setInput] = useState('');
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState(String(Date.now()));
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || '[]');
        setChats(saved);
        const latest = saved[0];
        if (latest) { setChatId(latest.id); setMessages(latest.messages || []); }
      } catch {}
    })();
  }, []);

  async function persist(nextMessages, nextId = chatId) {
    const nextChats = [{ id: nextId, title: nextMessages.find(m => m.role === 'user')?.content?.slice(0, 32) || 'New chat',
      updatedAt: Date.now(), messages: nextMessages }, ...chats.filter(c => c.id !== nextId)].slice(0, 30);
    setChats(nextChats);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextChats));
  }

  function newChat() { setMessages([]); setImage(null); setChatId(String(Date.now())); }

  async function chooseImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, quality: 0.7, base64: true
    });
    if (!result.canceled) setImage(result.assets[0]);
  }

  async function send() {
    const text = input.trim();
    if ((!text && !image) || busy) return;
    if (!API_BASE || API_BASE.includes('YOUR-BACKEND')) {
      Alert.alert('Backend not connected', 'Deploy the server and add its HTTPS URL in app.json first.');
      return;
    }
    const userMessage = { role: 'user', content: text || 'Please describe this image.', imageUri: image?.uri };
    const next = [...messages, userMessage];
    setMessages(next); setInput(''); setBusy(true);
    const selectedImage = image;
    setImage(null);
    try {
      const payloadMessages = next.map((m, i) => {
        if (m.role !== 'user' || !m.imageUri || i !== next.length - 1 || !selectedImage?.base64) {
          return { role: m.role, content: m.content };
        }
        return { role: 'user', content: [
          { type: 'text', text: m.content },
          { type: 'image_url', image_url: { url: `data:${selectedImage.mimeType || 'image/jpeg'};base64,${selectedImage.base64}` } }
        ]};
      });
      const response = await fetch(`${API_BASE.replace(/\/$/, '')}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payloadMessages })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI request failed');
      const completed = [...next, { role: 'assistant', content: data.reply }];
      setMessages(completed); await persist(completed);
    } catch (e) {
      const failed = [...next, { role: 'assistant', content: `Sorry, I couldn't connect: ${e.message}` }];
      setMessages(failed);
    } finally { setBusy(false); }
  }

  function speak(text) { Speech.speak(text, { language: 'en-IN', rate: 0.95 }); }

  const bubble = ({ item }) => (
    <View style={{ alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%',
      backgroundColor: item.role === 'user' ? '#6547E8' : '#20212A', borderRadius: 18,
      padding: 13, marginVertical: 6, borderBottomRightRadius: item.role === 'user' ? 5 : 18 }}>
      {item.imageUri ? <Image source={{ uri: item.imageUri }} style={{ width: 190, height: 140, borderRadius: 12, marginBottom: 8 }} /> : null}
      <Text style={{ color: '#F5F5FA', fontSize: 15, lineHeight: 22 }}>{item.content}</Text>
      {item.role === 'assistant' ? <TouchableOpacity onPress={() => speak(item.content)} style={{ marginTop: 9 }}>
        <Text style={{ color: '#B9AFFF', fontSize: 12 }}>▶ Read aloud</Text>
      </TouchableOpacity> : null}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#11121A' }}>
      <StatusBar barStyle="light-content" backgroundColor="#11121A" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ height: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#282936' }}>
          <View><Text style={{ color: '#FFFFFF', fontSize: 21, fontWeight: '800' }}>✦ Nova AI</Text><Text style={{ color: '#9293A4', fontSize: 11 }}>Your AI assistant</Text></View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => setShowHistory(v => !v)} style={{ backgroundColor: '#272433', paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12 }}>
              <Text style={{ color: '#D8D1FF', fontWeight: '600' }}>History</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={newChat} style={{ backgroundColor: '#272433', paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12 }}>
              <Text style={{ color: '#D8D1FF', fontWeight: '600' }}>＋ New</Text>
            </TouchableOpacity>
          </View>
        </View>
        {showHistory ? <View style={{ flex: 1, padding: 16 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 12 }}>Chat history</Text>
          {chats.length === 0 ? <Text style={{ color: '#A3A4B4' }}>Your saved chats will appear here.</Text> :
            <FlatList data={chats} keyExtractor={item => item.id} renderItem={({ item }) => (
              <TouchableOpacity onPress={() => { setChatId(item.id); setMessages(item.messages || []); setShowHistory(false); }}
                style={{ padding: 14, backgroundColor: '#20212A', borderRadius: 13, marginBottom: 8 }}>
                <Text style={{ color: '#F5F5FA', fontWeight: '600' }}>{item.title || 'Chat'}</Text>
                <Text style={{ color: '#8F91A2', fontSize: 11, marginTop: 4 }}>{new Date(item.updatedAt).toLocaleString()}</Text>
              </TouchableOpacity>
            )} />}
        </View> : messages.length === 0 ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 }}>
          <Text style={{ fontSize: 48, color: '#9C88FF' }}>✦</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 27, fontWeight: '800', marginTop: 12 }}>Hello, I'm Nova.</Text>
          <Text style={{ color: '#A3A4B4', textAlign: 'center', marginTop: 10, lineHeight: 22 }}>Ask me anything. Let's make something great together.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 24 }}>
            {['Explain something', 'Write a story', 'Help me learn'].map(t => <TouchableOpacity key={t} onPress={() => setInput(t)} style={{ borderColor: '#393747', borderWidth: 1, borderRadius: 20, padding: 10, margin: 4 }}><Text style={{ color: '#C8C3DC' }}>{t}</Text></TouchableOpacity>)}
          </View>
        </View> : <FlatList style={{ flex: 1, paddingHorizontal: 14 }} data={messages} keyExtractor={(_, i) => String(i)} renderItem={bubble} contentContainerStyle={{ paddingVertical: 14 }} />}
        {!showHistory ? <>{busy ? <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 }}><ActivityIndicator color="#A99BFF" /><Text style={{ color: '#A3A4B4', marginLeft: 9 }}>Nova is thinking...</Text></View> : null}
        {image ? <View style={{ paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' }}><Image source={{ uri: image.uri }} style={{ width: 56, height: 56, borderRadius: 10 }} /><TouchableOpacity onPress={() => setImage(null)}><Text style={{ color: '#FF9A9A', marginLeft: 12 }}>Remove image</Text></TouchableOpacity></View> : null}
        <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#282936', flexDirection: 'row', alignItems: 'flex-end' }}>
          <TouchableOpacity onPress={chooseImage} style={{ backgroundColor: '#282936', padding: 13, borderRadius: 15, marginRight: 8 }}><Text style={{ color: '#D5CEFF', fontSize: 18 }}>＋</Text></TouchableOpacity>
          <TextInput value={input} onChangeText={setInput} placeholder="Message Nova AI..." placeholderTextColor="#77798B" multiline
            style={{ flex: 1, maxHeight: 110, minHeight: 48, color: '#FFFFFF', backgroundColor: '#22232D', borderRadius: 16, paddingHorizontal: 15, paddingVertical: 13, fontSize: 15 }} />
          <TouchableOpacity onPress={send} disabled={busy} style={{ backgroundColor: '#7659F5', paddingHorizontal: 16, paddingVertical: 15, borderRadius: 15, marginLeft: 8, opacity: busy ? 0.5 : 1 }}><Text style={{ color: '#FFFFFF', fontWeight: '800' }}>↑</Text></TouchableOpacity>
        </View>
        <Text style={{ color: '#696B7B', fontSize: 10, textAlign: 'center', paddingBottom: 7 }}>Nova AI can make mistakes. Check important information.</Text></> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
