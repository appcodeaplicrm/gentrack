import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ToastAndroid, Platform } from 'react-native';
import * as ExpoClipboard from 'expo-clipboard';

interface Props {
  visible: boolean;
  apiKey: string;
  onClose: () => void;
}

export default function ApiKeyModal({ visible, apiKey, onClose }: Props) {
  const copiar = async () => {
    await ExpoClipboard.setStringAsync(apiKey);
    if (Platform.OS === 'android') {
      ToastAndroid.show('Copiada al portapapeles', ToastAndroid.SHORT);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.titulo}>API Key generada</Text>
          <Text style={s.aviso}>Guárdala ahora, no se podrá recuperar después.</Text>

          <View style={s.keyBox}>
            <Text selectable style={s.keyText}>{apiKey}</Text>
            <TouchableOpacity onPress={copiar} style={s.copyBtn}>
              <Text style={s.copyLabel}>Copiar</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onClose} style={s.btnOk}>
            <Text style={s.btnOkLabel}>Entendido</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:       { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380 },
  titulo:     { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  aviso:      { fontSize: 13, color: '#888', marginBottom: 16 },
  keyBox:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f4f4f4', borderRadius: 10, padding: 12, marginBottom: 16, gap: 8 },
  keyText:    { flex: 1, fontFamily: 'monospace', fontSize: 12, color: '#222' },
  copyBtn:    { backgroundColor: '#e8e8e8', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  copyLabel:  { fontSize: 12, fontWeight: '500' },
  btnOk:      { backgroundColor: '#222', borderRadius: 10, padding: 13, alignItems: 'center' },
  btnOkLabel: { color: '#fff', fontWeight: '500', fontSize: 15 },
});